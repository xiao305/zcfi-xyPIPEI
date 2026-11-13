/*!
 * zcfi-core.js v2.2.0
 * 共享核心：状态词表 / 转义 / 编码规范化 / 凭据读写 / GitHub Gist 严格读写 / 并发安全三方合并保存引擎 / 通用工具
 *
 * 用法：在页面业务脚本之前引入
 *   <script src="js/core.js"></script>
 * 之后使用 window.ZCFI
 *
 * 保存示例：
 *   const result = await ZCFI.save({
 *     token, gistId, filename,
 *     baseDoc,                 // 上次成功读取/保存的完整文档快照（用于三方合并基准）
 *     ops: [
 *       { type: 'node.upsert', code, parentCode, originalCode, baseNode, fields },
 *       { type: 'item.upsert', parentCode, code, originalCode, baseItem, fields },
 *       { type: 'node.delete', code, baseNode },
 *       { type: 'item.delete', parentCode, code, baseItem }
 *     ],
 *     onConflict: async (conflicts) => ['mine', 'theirs', ...], // 与 conflicts 等长；返回 null 表示放弃
 *     onRetry: async (err, attempt) => { ... }
 *   });
 *   gistData = result.data;
 *
 * 设计原则：
 *   1. 写之前必须重新 GET 远端，把本次 ops 应用到“远端副本”上再 PATCH，绝不整库覆盖；
 *   2. 每个字段以 baseDoc 为基准做三方比较，远端被别人改过就产生冲突交给页面确认；
 *   3. 同一个 gist+file 的写操作串行化；
 *   4. 读取失败（文件不存在 / JSON 损坏 / 内容截断 / 结构异常）一律抛错，绝不静默返回空数据。
 */
(function (global) {
    'use strict';

    var VERSION = '2.3.0';
    /** 数据文件结构版本；根级 schemaVersion 缺失视为 0/未标记，保存时补写当前版本 */
    var SCHEMA_VERSION = 1;
    var API_ROOT = 'https://api.github.com';
    /** 统一请求头：固定 API 版本，避免 GitHub 变更默认行为 */
    var API_HEADERS = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    var INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF]/g;
    var DEFAULT_TIMEOUT = 15000;
    var DEFAULT_SAVE_TIMEOUT = 25000;

    /* ============================================================
     * 一、状态词表
     * 业务统一为 待售 / 在售 / 售出；兼容历史数据里的“已售”等写法
     * ============================================================ */
    var STATUS = { PENDING: '待售', ON_SALE: '在售', SOLD: '售出' };
    var STATUS_LIST = [STATUS.PENDING, STATUS.ON_SALE, STATUS.SOLD];
    var STATUS_ALIASES = {
        '已售': STATUS.SOLD,
        '已卖出': STATUS.SOLD,
        '已售出': STATUS.SOLD,
        '已卖': STATUS.SOLD,
        'sold': STATUS.SOLD,
        'sale': STATUS.SOLD,
        'onsale': STATUS.ON_SALE,
        'on_sale': STATUS.ON_SALE,
        '在售中': STATUS.ON_SALE,
        '待出售': STATUS.PENDING,
        'pending': STATUS.PENDING
    };

    function normalizeStatus(value) {
        if (value === null || value === undefined) return STATUS.ON_SALE;
        var raw = String(value).replace(INVISIBLE_RE, '').trim();
        if (!raw) return STATUS.ON_SALE;
        if (STATUS_ALIASES[raw]) return STATUS_ALIASES[raw];
        var lower = raw.toLowerCase();
        if (STATUS_ALIASES[lower]) return STATUS_ALIASES[lower];
        return raw;
    }

    function statusClass(value) {
        var s = normalizeStatus(value);
        if (s === STATUS.SOLD) return 'status-sold';
        if (s === STATUS.PENDING) return 'status-pending';
        if (s === STATUS.ON_SALE) return 'status-onsale';
        return 'status-unknown';
    }

    /* ============================================================
     * 二、转义与规范化
     * ============================================================ */
    var HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"'`]/g, function (ch) { return HTML_ESCAPES[ch]; });
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    /** 编码/单号规范：去零宽字符、BOM，去掉所有空白（含全角空格） */
    function normalizeCode(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(INVISIBLE_RE, '').replace(/[\s\u3000]+/g, '');
    }

    /** 搜索关键词规范：去零宽，首尾 trim，小写；保留内部空格 */
    function normalizeQuery(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(INVISIBLE_RE, '').trim().toLowerCase();
    }

    function sameCode(a, b) {
        var x = normalizeCode(a).toLowerCase();
        var y = normalizeCode(b).toLowerCase();
        return !!x && x === y;
    }

    function normalizeUrl(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(INVISIBLE_RE, '').trim();
    }

    function sameUrl(a, b) {
        var x = normalizeUrl(a).replace(/\/+$/, '').toLowerCase();
        var y = normalizeUrl(b).replace(/\/+$/, '').toLowerCase();
        return !!x && x === y;
    }

    function isHttpUrl(value) {
        return /^https?:\/\//i.test(normalizeUrl(value));
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function clone(value) {
        if (value === null || value === undefined) return value;
        if (typeof structuredClone === 'function') {
            try { return structuredClone(value); } catch (e) { /* 回退到 JSON */ }
        }
        return JSON.parse(JSON.stringify(value));
    }

    /** 深比较：对象键顺序无关；undefined 与缺失视为不等（调用方先归一） */
    function deepEqual(a, b) {
        if (a === b) return true;
        if (typeof a !== typeof b) return false;
        if (a === null || b === null || typeof a !== 'object') return false;
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        var i;
        if (Array.isArray(a)) {
            if (a.length !== b.length) return false;
            for (i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i])) return false;
            }
            return true;
        }
        var ka = Object.keys(a);
        var kb = Object.keys(b);
        if (ka.length !== kb.length) return false;
        for (i = 0; i < ka.length; i++) {
            var key = ka[i];
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!deepEqual(a[key], b[key])) return false;
        }
        return true;
    }

    /** UTF-8 字节数（中文不能按字符数估算 1MB 限制） */
    function sizeBytes(value) {
        var text = value === null || value === undefined ? '' : String(value);
        try {
            if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
        } catch (e) { /* 回退 */ }
        try {
            return unescape(encodeURIComponent(text)).length;
        } catch (e2) {
            return text.length;
        }
    }

    function valuesEqual(a, b) {
        var x = a === undefined ? null : a;
        var y = b === undefined ? null : b;
        if (x === y) return true;
        if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return false;
        return deepEqual(x, y);
    }

    /* ============================================================
     * 三、错误与提示
     * ============================================================ */
    function makeError(code, message, extra) {
        var err = new Error(message);
        err.code = code;
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) err[k] = extra[k];
            }
        }
        return err;
    }

    function isRetryableError(err) {
        return !!err && (err.code === 'NETWORK' || err.code === 'SERVER');
    }

    function friendlyError(err) {
        if (!err) return '未知错误';
        if (err.code === 'FILE_MISSING') return 'Gist 中找不到数据文件，请检查“文件名”是否正确（默认 data.json），或确认该 Gist 是否存在。';
        if (err.code === 'TRUNCATED') return '数据文件过大，GitHub 只返回了部分内容。已停止加载以避免数据损坏，请先备份并拆分/压缩数据。';
        if (err.code === 'PARSE') return '数据文件不是合法 JSON，可能已损坏。已停止进入编辑状态，请先用备份恢复。';
        if (err.code === 'SCHEMA') return '数据结构异常（缺少 products 对象）。已停止进入编辑状态，避免误写。';
        if (err.code === 'EMPTY') return '数据文件内容为空。已停止加载，避免用空数据覆盖。';
        if (err.code === 'AUTH') return err.message || '登录凭证无效或已过期（401），请重新登录。';
        if (err.code === 'PERMISSION') return err.message || '没有访问该 Gist 的权限（403）。请确认 Token 具备 gist 权限、且该 Gist 属于该账号。';
        if (err.code === 'NETWORK') return '网络请求超时或失败，请检查网络后重试。';
        if (err.code === 'RATE_LIMIT') {
            var hint = '';
            if (err.retryAfter) hint = '，请 ' + err.retryAfter + ' 秒后重试';
            else if (err.resetAt) hint = '，额度重置于 ' + err.resetAt;
            return 'GitHub API 频率超限' + hint + '。';
        }
        if (err.code === 'CONFLICT_ABORTED') return '检测到他人同时修改，已取消本次保存。可刷新后重试。';
        if (err.code === 'CONFLICT_UNRESOLVED') return '冲突未能解决，已取消保存。';
        if (err.code === 'CODE_EXISTS') return err.message || '编码已存在。';
        if (err.code === 'PARENT_MISSING') return err.message || '父节点不存在，请刷新后重试。';
        if (err.code === 'SAVE_FAILED') return err.message || '保存失败，请稍后重试。';
        if (err.code === 'BAD_OP') return err.message || '保存操作无效，请刷新后重试。';
        return err.message || String(err);
    }

    /* ============================================================
     * 四、本地存储 / 下载 / 时间 / Toast
     * ============================================================ */
    var storage = {
        get: function (key, fallback) {
            try {
                var v = global.localStorage.getItem(key);
                return v === null ? fallback : v;
            } catch (e) { return fallback; }
        },
        set: function (key, value) {
            try { global.localStorage.setItem(key, String(value)); return true; } catch (e) { return false; }
        },
        remove: function (key) {
            try { global.localStorage.removeItem(key); } catch (e) { /* ignore */ }
        },
        getJson: function (key, fallback) {
            var raw = storage.get(key, null);
            if (raw === null) return fallback;
            try { return JSON.parse(raw); } catch (e) { return fallback; }
        },
        setJson: function (key, value) {
            try { return storage.set(key, JSON.stringify(value)); } catch (e) { return false; }
        }
    };

    /* ============================================================
     * 四、凭据（登录态）统一读写
     * 规则：sessionStorage 优先、localStorage 兜底；
     *       remember=true 只写 localStorage，false 只写 sessionStorage；
     *       退出登录两处同时清理，绝不把“仅本次会话”写成持久化。
     * ============================================================ */
    var CRED_KEYS = { TOKEN: 'github_token', GIST_ID: 'gist_id', FILENAME: 'gist_filename' };

    function readCredential(key) {
        try {
            var s = global.sessionStorage.getItem(key);
            if (s !== null) return { value: s, store: 'session' };
        } catch (e) { /* 隐私模式 */ }
        try {
            var l = global.localStorage.getItem(key);
            if (l !== null) return { value: l, store: 'local' };
        } catch (e2) { /* 隐私模式 */ }
        return { value: null, store: null };
    }

    function writeCredential(key, value, remember) {
        var ok = false;
        try {
            if (remember) {
                global.localStorage.setItem(key, String(value));
                global.sessionStorage.removeItem(key);
                ok = true;
            } else {
                global.sessionStorage.setItem(key, String(value));
                global.localStorage.removeItem(key);
                ok = true;
            }
        } catch (e) {
            ok = false;
        }
        return ok;
    }

    function clearCredentialKey(key) {
        try { global.localStorage.removeItem(key); } catch (e) { /* ignore */ }
        try { global.sessionStorage.removeItem(key); } catch (e2) { /* ignore */ }
    }

    var credentials = {
        keys: CRED_KEYS,
        /** @returns {{token:string, gistId:string, filename:string, remember:boolean}} */
        read: function () {
            var token = readCredential(CRED_KEYS.TOKEN);
            var gistId = readCredential(CRED_KEYS.GIST_ID);
            var filename = readCredential(CRED_KEYS.FILENAME);
            return {
                token: token.value || '',
                gistId: gistId.value || '',
                filename: filename.value || '',
                remember: token.store === 'local' || gistId.store === 'local' || filename.store === 'local'
            };
        },
        /** 写入三项；remember=false 时只写 sessionStorage。返回实际生效的 remember 值 */
        write: function (token, gistId, filename, remember) {
            var test = writeCredential(CRED_KEYS.TOKEN, token, !!remember);
            writeCredential(CRED_KEYS.GIST_ID, gistId, !!remember);
            writeCredential(CRED_KEYS.FILENAME, filename, !!remember);
            return !!remember && test;
        },
        /** 只清 Token（保留 Gist ID/文件名，便于重新登录） */
        clearToken: function () {
            clearCredentialKey(CRED_KEYS.TOKEN);
        },
        /** 清除全部登录信息 */
        clear: function () {
            clearCredentialKey(CRED_KEYS.TOKEN);
            clearCredentialKey(CRED_KEYS.GIST_ID);
            clearCredentialKey(CRED_KEYS.FILENAME);
        }
    };

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function formatDateTime(ts) {
        var d = ts instanceof Date ? ts : new Date(ts);
        if (isNaN(d.getTime())) return '';
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
            pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    function formatTime(ts) {
        var d = ts instanceof Date ? ts : new Date(ts);
        if (isNaN(d.getTime())) return '';
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    function downloadJson(filename, data) {
        var text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename || ('zcfi-backup-' + Date.now() + '.json');
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            URL.revokeObjectURL(url);
            if (a.parentNode) a.parentNode.removeChild(a);
        }, 0);
    }

    var toastHost = null;
    function ensureToastHost() {
        if (typeof document === 'undefined' || !document.body) return null;
        if (toastHost && toastHost.parentNode) return toastHost;
        toastHost = document.createElement('div');
        toastHost.id = 'zcfi-toast-host';
        toastHost.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;' +
            'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;max-width:92vw;';
        document.body.appendChild(toastHost);
        return toastHost;
    }

    function toast(message, options) {
        options = options || {};
        var host = ensureToastHost();
        if (!host) {
            try { console.log('[toast]', message); } catch (e) { /* ignore */ }
            return null;
        }
        var type = options.type || 'info';
        var colors = { success: '#16a34a', error: '#dc2626', warn: '#d97706', info: '#2563eb' };
        var el = document.createElement('div');
        el.setAttribute('role', 'status');
        el.style.cssText = 'pointer-events:auto;background:#fff;color:#0f172a;border-left:4px solid ' +
            (colors[type] || colors.info) + ';box-shadow:0 8px 24px rgba(15,23,42,.18);border-radius:10px;' +
            'padding:10px 16px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:100%;' +
            'white-space:pre-wrap;word-break:break-word;opacity:0;transition:opacity .18s ease,transform .18s ease;' +
            'transform:translateY(6px);';
        el.textContent = message === null || message === undefined ? '' : String(message);
        host.appendChild(el);
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(function () { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
        } else {
            el.style.opacity = '1';
        }
        var duration = typeof options.duration === 'number' ? options.duration : (type === 'error' ? 5200 : 2600);
        setTimeout(function () {
            el.style.opacity = '0';
            el.style.transform = 'translateY(6px)';
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
        }, duration);
        return el;
    }

    /* ============================================================
     * 五、文档查询
     * ============================================================ */
    function getProducts(docOrProducts) {
        if (docOrProducts && isPlainObject(docOrProducts.products)) return docOrProducts.products;
        if (isPlainObject(docOrProducts)) return docOrProducts;
        return {};
    }

    function findNodeByCode(docOrProducts, code) {
        var products = getProducts(docOrProducts);
        if (!code) return null;
        var target = String(code);
        if (Object.prototype.hasOwnProperty.call(products, target)) return products[target];
        for (var key in products) {
            if (!Object.prototype.hasOwnProperty.call(products, key)) continue;
            var node = products[key];
            if (node && isPlainObject(node.children)) {
                var found = findNodeByCode(node.children, target);
                if (found) return found;
            }
        }
        return null;
    }

    /** 返回 { container, key, node, parentCode }；parentCode 为真实父编码（根级为 null） */
    function findNodeEntry(docOrProducts, code, parentCode) {
        var products = getProducts(docOrProducts);
        if (!code) return null;
        if (Object.prototype.hasOwnProperty.call(products, code)) {
            return { container: products, key: code, node: products[code], parentCode: parentCode || null };
        }
        for (var key in products) {
            if (!Object.prototype.hasOwnProperty.call(products, key)) continue;
            var node = products[key];
            if (node && isPlainObject(node.children)) {
                var found = findNodeEntry(node.children, code, key);
                if (found) return found;
            }
        }
        return null;
    }

    function findParentNode(docOrProducts, code) {
        var entry = findNodeEntry(docOrProducts, code);
        if (!entry || !entry.parentCode) return null;
        return findNodeByCode(docOrProducts, entry.parentCode);
    }

    /** 库存编码归一：与节点编码一致，去空白/零宽，忽略大小写 */
    function normItemCode(value) {
        return normalizeCode(value).toLowerCase();
    }

    function findItem(node, itemCode) {
        if (!node || !Array.isArray(node.items)) return null;
        var target = normItemCode(itemCode);
        if (!target) return null;
        for (var i = 0; i < node.items.length; i++) {
            if (node.items[i] && normItemCode(node.items[i].code) === target) return node.items[i];
        }
        return null;
    }

    function walk(docOrProducts, callback) {
        var products = getProducts(docOrProducts);
        function visit(container, depth) {
            for (var key in container) {
                if (!Object.prototype.hasOwnProperty.call(container, key)) continue;
                var node = container[key];
                if (!node || typeof node !== 'object') continue;
                callback(node, key, depth, container);
                if (isPlainObject(node.children)) visit(node.children, depth + 1);
            }
        }
        visit(products, 0);
    }

    function countDescendants(node) {
        var result = { children: 0, items: 0 };
        if (!node || typeof node !== 'object') return result;
        if (Array.isArray(node.items)) result.items += node.items.length;
        if (isPlainObject(node.children)) {
            for (var key in node.children) {
                if (!Object.prototype.hasOwnProperty.call(node.children, key)) continue;
                result.children += 1;
                var sub = countDescendants(node.children[key]);
                result.children += sub.children;
                result.items += sub.items;
            }
        }
        return result;
    }

    /** 软删除标记（回收站） */
    function isDeleted(entity) {
        return !!(entity && typeof entity === 'object' && entity.deletedAt);
    }

    /**
     * 深度校验 + 数据体检。
     * 返回 { ok, errors:[], warnings:[], stats:{nodes,items} }
     * errors 表示结构损坏（应阻止导入/以只读处理），warnings 仅提示。
     */
    function validateDocDeep(data) {
        var errors = [];
        var warnings = [];
        var seenNode = Object.create(null);
        var seenItem = Object.create(null);
        var seenTracking = Object.create(null);
        var seenOrder = Object.create(null);

        try {
            validateDoc(data);
        } catch (e) {
            return { ok: false, errors: [e.message], warnings: warnings, stats: { nodes: 0, items: 0 } };
        }

        function walkNodes(container) {
            for (var key in container) {
                if (!Object.prototype.hasOwnProperty.call(container, key)) continue;
                var node = container[key];
                if (!isPlainObject(node)) {
                    errors.push('节点「' + key + '」不是对象');
                    continue;
                }
                if (seenNode[key]) errors.push('节点编码重复：' + key);
                seenNode[key] = true;
                if (!node.name && !isDeleted(node)) warnings.push('节点「' + key + '」缺少名称');
                if (node.status !== undefined && node.status !== null && STATUS_LIST.indexOf(normalizeStatus(node.status)) === -1) {
                    warnings.push('节点「' + key + '」的状态不在词表内（' + node.status + '），将按原值显示');
                }
                if (node.children !== undefined && !isPlainObject(node.children)) {
                    errors.push('节点「' + key + '」的 children 不是对象');
                }
                if (node.items !== undefined && !Array.isArray(node.items)) {
                    errors.push('节点「' + key + '」的 items 不是数组');
                }
                if (node.qrLinks !== undefined && !Array.isArray(node.qrLinks)) {
                    warnings.push('节点「' + key + '」的 qrLinks 不是数组，扫码匹配可能失效');
                }
                if (Array.isArray(node.items)) {
                    node.items.forEach(function (item, idx) {
                        if (!isPlainObject(item)) {
                            errors.push('节点「' + key + '」第 ' + (idx + 1) + ' 个库存不是对象');
                            return;
                        }
                        if (!item.code) {
                            errors.push('节点「' + key + '」存在无编码库存（第 ' + (idx + 1) + ' 个）');
                        } else {
                            if (seenItem[item.code]) errors.push('库存编码重复：' + item.code);
                            seenItem[item.code] = true;
                            if (item.code.indexOf(key + '/') !== 0) {
                                warnings.push('库存编码前缀与父节点不一致：' + item.code + '（父节点 ' + key + '）');
                            }
                        }
                        if (item.trackingNumber !== undefined && item.trackingNumber !== null && typeof item.trackingNumber !== 'string') {
                            warnings.push('节点「' + key + '」的库存「' + item.code + '」快递单号不是字符串，打印时按空值处理');
                        }
                        if (item.orderNumber !== undefined && item.orderNumber !== null && typeof item.orderNumber !== 'string') {
                            warnings.push('节点「' + key + '」的库存「' + item.code + '」订单号不是字符串，打印时按空值处理');
                        }
                        if (item.trackingNumber) {
                            if (seenTracking[item.trackingNumber]) warnings.push('快递单号重复：' + item.trackingNumber);
                            seenTracking[item.trackingNumber] = true;
                        }
                        if (item.orderNumber) {
                            if (seenOrder[item.orderNumber]) warnings.push('订单号重复：' + item.orderNumber);
                            seenOrder[item.orderNumber] = true;
                        }
                    });
                }
                if (isPlainObject(node.children)) walkNodes(node.children);
            }
        }

        walkNodes(data.products);
        return {
            ok: errors.length === 0,
            errors: errors,
            warnings: warnings,
            stats: { nodes: Object.keys(seenNode).length, items: Object.keys(seenItem).length }
        };
    }

    /** 校验文档基本结构 */
    function validateDoc(data) {
        if (!isPlainObject(data)) throw makeError('SCHEMA', '数据结构异常：根节点不是对象');
        if (!isPlainObject(data.products)) throw makeError('SCHEMA', '数据结构异常：缺少 products 对象');
        return true;
    }

    /* ============================================================
     * 六、GitHub Gist 严格读写
     * ============================================================ */
    function fetchWithTimeout(url, options, timeoutMs) {
        options = options || {};
        var opts = {};
        for (var p in options) {
            if (Object.prototype.hasOwnProperty.call(options, p)) opts[p] = options[p];
        }
        // 必须绕开浏览器私有缓存：写前 GET 若命中 GitHub 的 60s 缓存，三方合并会看不到他人改动
        if (opts.cache === undefined) opts.cache = 'no-store';
        var controller = null;
        if (typeof AbortController === 'function') {
            controller = new AbortController();
            opts.signal = controller.signal;
        }
        var limit = timeoutMs || DEFAULT_TIMEOUT;
        var timer = null;
        if (controller) {
            timer = setTimeout(function () { try { controller.abort(); } catch (e) { /* ignore */ } }, limit);
        }
        return Promise.resolve()
            .then(function () { return fetch(url, opts); })
            .catch(function (err) {
                if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
                    throw makeError('NETWORK', '请求超时（' + Math.round(limit / 1000) + 's），请检查网络后重试');
                }
                throw makeError('NETWORK', '网络请求失败：' + (err && err.message ? err.message : err));
            })
            .then(function (resp) {
                if (timer) clearTimeout(timer);
                return resp;
            }, function (err) {
                if (timer) clearTimeout(timer);
                throw err;
            });
    }

    /** 读取响应体并保证超时：仅有响应头返回时，body 卡住也要能失败 */
    function readBodyText(resp, timeoutMs) {
        var limit = timeoutMs || DEFAULT_TIMEOUT;
        return new Promise(function (resolve, reject) {
            var done = false;
            var timer = setTimeout(function () {
                if (done) return;
                done = true;
                reject(makeError('NETWORK', '读取响应超时（' + Math.round(limit / 1000) + 's），请检查网络后重试'));
            }, limit);
            resp.text().then(function (text) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(text);
            }, function (err) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                reject(makeError('NETWORK', '读取响应失败：' + (err && err.message ? err.message : err)));
            });
        });
    }

    async function readJsonBody(resp, timeoutMs) {
        var text = await readBodyText(resp, timeoutMs);
        if (!text) return null;
        try { return JSON.parse(text); } catch (e) { return null; }
    }

    function responseHeader(resp, name) {
        try {
            return resp.headers && typeof resp.headers.get === 'function' ? resp.headers.get(name) : null;
        } catch (e) {
            return null;
        }
    }

    function httpError(resp, body, action) {
        var detail = body && body.message ? body.message : (resp.statusText || '');
        var suffix = detail ? '（' + detail + '）' : '';
        var remaining = responseHeader(resp, 'x-ratelimit-remaining');
        var retryAfterRaw = responseHeader(resp, 'retry-after');
        var resetRaw = responseHeader(resp, 'x-ratelimit-reset');
        var retryAfter = retryAfterRaw ? parseInt(retryAfterRaw, 10) : NaN;
        var resetAt = null;
        if (resetRaw) {
            var resetEpoch = parseInt(resetRaw, 10);
            if (!isNaN(resetEpoch)) {
                try { resetAt = formatDateTime(new Date(resetEpoch * 1000)); } catch (e) { resetAt = null; }
            }
        }
        function rateLimited() {
            return makeError('RATE_LIMIT', 'GitHub API 频率超限，请稍后再试。' + suffix, {
                status: resp.status,
                detail: detail,
                retryAfter: isNaN(retryAfter) ? null : retryAfter,
                resetAt: resetAt
            });
        }
        // 403 有两种含义：主限流（remaining=0 或带 retry-after）与真的没权限
        if (resp.status === 401) return makeError('AUTH', 'GitHub Token 无效或已过期（401），请重新登录', { status: 401, detail: detail });
        if (resp.status === 403) {
            if (remaining === '0' || !isNaN(retryAfter)) return rateLimited();
            return makeError('PERMISSION', '没有访问该 Gist 的权限（403）' + suffix + '。请确认 Token 具备 gist 权限、且该 Gist 属于该账号', { status: 403, detail: detail });
        }
        if (resp.status === 404) return makeError('FILE_MISSING', '找不到该 Gist（404），请检查 Gist ID 是否正确、或该 Token 是否可访问它', { status: 404, detail: detail });
        if (resp.status === 409) return makeError('SERVER', 'GitHub 报告版本冲突（409），请稍后重试', { status: 409, detail: detail });
        if (resp.status === 422) return makeError('SAVE_FAILED', 'GitHub 拒绝写入（422）：' + detail, { status: 422, detail: detail });
        if (resp.status === 429) return rateLimited();
        if (resp.status >= 500) return makeError('SERVER', 'GitHub 服务异常（' + resp.status + '），请稍后重试', { status: resp.status, detail: detail });
        return makeError('SAVE_FAILED', (action || '操作') + '失败（' + resp.status + '）：' + detail, { status: resp.status, detail: detail });
    }

    function authHeaders(token, extra) {
        var headers = { 'Authorization': 'token ' + token };
        for (var k in API_HEADERS) {
            if (Object.prototype.hasOwnProperty.call(API_HEADERS, k)) headers[k] = API_HEADERS[k];
        }
        if (extra) {
            for (var e in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, e)) headers[e] = extra[e];
            }
        }
        return headers;
    }

    async function parseGistFileContent(file, filename) {
        if (!file) throw makeError('FILE_MISSING', 'Gist 中找不到文件「' + filename + '」');
        var text = file.content;
        // GitHub 对超过约 1MB 的文件会截断 content，此时尝试用 raw_url 拉全量
        if (file.truncated) {
            var rawSucceeded = false;
            if (file.raw_url) {
                try {
                    var rawResp = await fetchWithTimeout(file.raw_url, {}, DEFAULT_TIMEOUT);
                    if (rawResp.ok) {
                        text = await rawResp.text();
                        rawSucceeded = true;
                    }
                } catch (e) { /* 回退到报错 */ }
            }
            if (!rawSucceeded || typeof text !== 'string' || !text) {
                throw makeError('TRUNCATED', '数据文件过大已被 GitHub 截断（' + (file.size || '?') + ' 字节），且无法读取完整内容');
            }
        }
        if (typeof text !== 'string' || !text.trim()) {
            throw makeError('EMPTY', '数据文件「' + filename + '」内容为空，已阻止进入可编辑状态');
        }
        var data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw makeError('PARSE', '数据文件不是合法 JSON：' + e.message);
        }
        validateDoc(data);
        return { data: data, size: sizeBytes(text) };
    }

    async function get(token, gistId, filename, options) {
        options = options || {};
        if (!token || !gistId) throw makeError('AUTH', '缺少 Token 或 Gist ID，请先登录');
        if (!filename) filename = 'data.json';
        var url = API_ROOT + '/gists/' + encodeURIComponent(gistId);
        var resp = await fetchWithTimeout(url, {
            headers: authHeaders(token)
        }, options.timeoutMs || DEFAULT_TIMEOUT);
        var body = await readJsonBody(resp, options.timeoutMs || DEFAULT_TIMEOUT);
        if (!resp.ok) throw httpError(resp, body, '读取数据');
        var files = body && body.files;
        if (!files || !Object.prototype.hasOwnProperty.call(files, filename)) {
            throw makeError('FILE_MISSING', 'Gist 中找不到文件「' + filename + '」，请确认文件名');
        }
        var parsed = await parseGistFileContent(files[filename], filename);
        var revision = null;
        if (body.history && body.history.length && body.history[0] && body.history[0].version) {
            revision = body.history[0].version;
        }
        return {
            data: parsed.data,
            updatedAt: body.updated_at || null,
            revision: revision,
            size: parsed.size
        };
    }

    async function patch(token, gistId, filename, data, options) {
        options = options || {};
        if (!token || !gistId) throw makeError('AUTH', '缺少 Token 或 Gist ID，请先登录');
        if (!filename) filename = 'data.json';
        validateDoc(data);
        // 压缩写入，避免数据体积无谓翻倍
        var text;
        try {
            text = JSON.stringify(data);
        } catch (e) {
            throw makeError('SAVE_FAILED', '数据无法序列化：' + e.message);
        }
        var url = API_ROOT + '/gists/' + encodeURIComponent(gistId);
        var resp = await fetchWithTimeout(url, {
            method: 'PATCH',
            headers: authHeaders(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ files: (function () { var f = {}; f[filename] = { content: text }; return f; })() })
        }, options.timeoutMs || DEFAULT_SAVE_TIMEOUT);
        var body = await readJsonBody(resp, options.timeoutMs || DEFAULT_SAVE_TIMEOUT);
        if (!resp.ok) throw httpError(resp, body, '保存数据');
        var revision = null;
        if (body && body.history && body.history.length && body.history[0] && body.history[0].version) {
            revision = body.history[0].version;
        }
        return { updatedAt: (body && body.updated_at) || null, revision: revision, size: text.length };
    }

    /** 列出 Gist 历史版本：→ [{ version, committedAt, changeStatus, url }] */
    async function history(token, gistId) {
        if (!token || !gistId) throw makeError('AUTH', '缺少 Token 或 Gist ID');
        var url = API_ROOT + '/gists/' + encodeURIComponent(gistId);
        var resp = await fetchWithTimeout(url, {
            headers: authHeaders(token)
        }, DEFAULT_TIMEOUT);
        var body = await readJsonBody(resp, DEFAULT_TIMEOUT);
        if (!resp.ok) throw httpError(resp, body, '读取历史版本');
        return (body && body.history ? body.history : []).map(function (h) {
            return {
                version: h.version,
                committedAt: h.committed_at,
                changeStatus: h.change_status,
                url: h.url
            };
        });
    }

    /** 读取指定历史版本的数据 → { data, updatedAt, revision } */
    async function getAtRevision(token, gistId, sha, filename) {
        if (!token || !gistId || !sha) throw makeError('AUTH', '缺少 Token / Gist ID / 版本号');
        if (!filename) filename = 'data.json';
        var url = API_ROOT + '/gists/' + encodeURIComponent(gistId) + '/' + encodeURIComponent(sha);
        var resp = await fetchWithTimeout(url, {
            headers: authHeaders(token)
        }, DEFAULT_TIMEOUT);
        var body = await readJsonBody(resp, DEFAULT_TIMEOUT);
        if (!resp.ok) throw httpError(resp, body, '读取历史版本');
        var files = body && body.files;
        if (!files || !Object.prototype.hasOwnProperty.call(files, filename)) {
            throw makeError('FILE_MISSING', '该历史版本中没有文件「' + filename + '」');
        }
        var parsed = await parseGistFileContent(files[filename], filename);
        return { data: parsed.data, updatedAt: body.updated_at || null, revision: sha };
    }

    /* ============================================================
     * 七、并发安全保存引擎（ops + 三方合并）
     * ============================================================ */
    var FIELD_LABELS = {
        name: '名称',
        unified: '类目条码',
        cost: '成本',
        trackingNumber: '快递单号',
        orderNumber: '订单号',
        remark: '备注',
        qrLinks: '关联链接',
        status: '状态',
        code: '编码',
        children: '子节点',
        items: '库存'
    };

    function makeConflict(opIndex, key, scope, target, field, message, extra) {
        var conflict = {
            opIndex: opIndex,
            key: key,
            scope: scope,
            target: target,
            field: field,
            label: FIELD_LABELS[field] || field,
            message: message
        };
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) conflict[k] = extra[k];
            }
        }
        return conflict;
    }

    function setField(target, field, value) {
        if (value === undefined) {
            delete target[field];
        } else {
            target[field] = value;
        }
    }

    function copyEditableFields(target, fields) {
        if (!fields) return target;
        for (var key in fields) {
            if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
            if (key === 'children' || key === 'items' || key === 'code') continue;
            setField(target, key, fields[key]);
        }
        return target;
    }

    function getChildrenContainer(doc, parentCode) {
        if (!parentCode) return doc.products;
        var parent = findNodeByCode(doc.products, parentCode);
        if (!parent) throw makeError('PARENT_MISSING', '父节点不存在：' + parentCode);
        if (!isPlainObject(parent.children)) parent.children = {};
        return parent.children;
    }

    /** 节点改名后，级联替换子树 children 的 key 和 items 的 code */
    function cascadeCodePrefix(node, oldPrefix, newPrefix) {
        var oldSlash = oldPrefix + '/';
        if (node && isPlainObject(node.children)) {
            var next = {};
            var keys = Object.keys(node.children);
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                var child = node.children[key];
                var newKey = key.indexOf(oldSlash) === 0 ? (newPrefix + key.slice(oldPrefix.length)) : key;
                cascadeCodePrefix(child, oldPrefix, newPrefix);
                next[newKey] = child;
            }
            node.children = next;
        }
        if (node && Array.isArray(node.items)) {
            for (var j = 0; j < node.items.length; j++) {
                var item = node.items[j];
                if (item && typeof item.code === 'string' && item.code.indexOf(oldSlash) === 0) {
                    item.code = newPrefix + item.code.slice(oldPrefix.length);
                }
            }
        }
    }

    function entityEqual(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
    }

    function applyFieldMerge(target, fields, baseEntity, scope, targetCode, opIndex, decisions, conflicts) {
        var keys = Object.keys(fields || {});
        for (var i = 0; i < keys.length; i++) {
            var field = keys[i];
            if (field === 'children' || field === 'items' || field === 'code') continue;
            var mine = fields[field];
            var remoteValue = target[field];
            var baseValue = baseEntity ? baseEntity[field] : undefined;
            if (baseEntity && !valuesEqual(remoteValue, baseValue) && !valuesEqual(remoteValue, mine)) {
                var conflictKey = opIndex + ':' + field;
                var decision = decisions ? decisions[conflictKey] : null;
                if (!decision && conflicts) {
                    conflicts.push(makeConflict(opIndex, conflictKey, scope, targetCode, field, '该字段已被其它设备修改', {
                        kind: 'field', base: baseValue, remote: remoteValue, mine: mine
                    }));
                    decision = 'mine';
                }
                if (decision === 'theirs') continue;
            }
            setField(target, field, mine);
        }
    }

    function applyNodeUpsert(doc, op, baseDoc, decisions, conflicts, opIndex) {
        if (!op.code) throw makeError('BAD_OP', '节点编码为空');
        var originalCode = op.originalCode || op.code;
        var newCode = op.code;
        var baseNode = op.baseNode || (baseDoc ? findNodeByCode(baseDoc.products, originalCode) : null);
        var entry = findNodeEntry(doc.products, originalCode);
        var fields = op.fields || {};

        if (!entry) {
            // 远端不存在：新增；若 base 里存在说明被别人删了 → 冲突
            if (baseNode) {
                var delKey = opIndex + ':__deleted__';
                var decision = decisions ? decisions[delKey] : null;
                if (!decision && conflicts) {
                    conflicts.push(makeConflict(opIndex, delKey, 'node', originalCode, '__deleted__', '该节点已被其它设备删除', {
                        kind: 'remote-deleted', base: baseNode, remote: null, mine: true
                    }));
                    decision = 'mine';
                }
                if (decision === 'theirs') return;
            }
            var parentContainer = getChildrenContainer(doc, op.parentCode);
            if (Object.prototype.hasOwnProperty.call(parentContainer, newCode)) {
                throw makeError('CODE_EXISTS', '编码已存在：' + newCode);
            }
            var fresh = { name: '', unified: true, children: {}, items: [] };
            copyEditableFields(fresh, fields);
            if (fields.name === undefined) fresh.name = newCode;
            parentContainer[newCode] = fresh;
            return;
        }

        var node = entry.node;
        if (op.createOnly && !baseNode) {
            throw makeError('CODE_EXISTS', '编码「' + originalCode + '」已被其它设备占用，请刷新后重试');
        }
        applyFieldMerge(node, fields, baseNode, 'node', originalCode, opIndex, decisions, conflicts);

        if (originalCode !== newCode) {
            var container = entry.container;
            if (Object.prototype.hasOwnProperty.call(container, newCode)) {
                throw makeError('CODE_EXISTS', '新编码已被占用：' + newCode);
            }
            delete container[originalCode];
            container[newCode] = node;
            cascadeCodePrefix(node, originalCode, newCode);
        }
    }

    function applyNodeDelete(doc, op, baseDoc, decisions, conflicts, opIndex) {
        var entry = findNodeEntry(doc.products, op.code);
        if (!entry) return; // 已经被删除，幂等
        var baseNode = op.baseNode || (baseDoc ? findNodeByCode(baseDoc.products, op.code) : null);
        if (baseNode && !entityEqual(entry.node, baseNode)) {
            var modKey = opIndex + ':__modified__';
            var decision = decisions ? decisions[modKey] : null;
            if (!decision && conflicts) {
                conflicts.push(makeConflict(opIndex, modKey, 'node', op.code, '__modified__', '该节点已被其它设备修改，仍要删除吗', {
                    kind: 'remote-modified', base: baseNode, remote: entry.node, mine: null
                }));
                decision = 'mine';
            }
            if (decision === 'theirs') return;
        }
        delete entry.container[entry.key];
    }

    function applyItemUpsert(doc, op, baseDoc, decisions, conflicts, opIndex) {
        var parent = findNodeByCode(doc.products, op.parentCode);
        if (!parent) throw makeError('PARENT_MISSING', '父节点不存在：' + op.parentCode);
        if (!Array.isArray(parent.items)) parent.items = [];
        var originalCode = op.originalCode || op.code;
        var baseParent = baseDoc ? findNodeByCode(baseDoc.products, op.parentCode) : null;
        var baseItem = op.baseItem || (baseParent ? findItem(baseParent, originalCode) : null);
        var targetNorm = normItemCode(originalCode);
        var idx = -1;
        for (var i = 0; i < parent.items.length; i++) {
            if (parent.items[i] && normItemCode(parent.items[i].code) === targetNorm) { idx = i; break; }
        }
        var fields = op.fields || {};

        if (idx === -1) {
            if (baseItem) {
                var delKey = opIndex + ':__deleted__';
                var decision = decisions ? decisions[delKey] : null;
                if (!decision && conflicts) {
                    conflicts.push(makeConflict(opIndex, delKey, 'item', originalCode, '__deleted__', '该库存项已被其它设备删除', {
                        kind: 'remote-deleted', base: baseItem, remote: null, mine: true
                    }));
                    decision = 'mine';
                }
                if (decision === 'theirs') return;
            }
            if (!op.code) throw makeError('BAD_OP', '库存编码为空');
            var fresh = { code: op.code };
            copyEditableFields(fresh, fields);
            parent.items.push(fresh);
            return;
        }

        var item = parent.items[idx];
        if (op.createOnly && !baseItem) {
            throw makeError('CODE_EXISTS', '库存编码「' + originalCode + '」已被其它设备占用，请刷新后重试');
        }
        applyFieldMerge(item, fields, baseItem, 'item', originalCode, opIndex, decisions, conflicts);
        if (op.code && op.code !== originalCode) {
            var newNorm = normItemCode(op.code);
            for (var j = 0; j < parent.items.length; j++) {
                if (j !== idx && parent.items[j] && normItemCode(parent.items[j].code) === newNorm) {
                    throw makeError('CODE_EXISTS', '库存编码已存在：' + op.code);
                }
            }
            item.code = op.code;
        }
    }

    function applyItemDelete(doc, op, baseDoc, decisions, conflicts, opIndex) {
        var parent = findNodeByCode(doc.products, op.parentCode);
        if (!parent || !Array.isArray(parent.items)) return;
        var targetNorm = normItemCode(op.code);
        var idx = -1;
        for (var i = 0; i < parent.items.length; i++) {
            if (parent.items[i] && normItemCode(parent.items[i].code) === targetNorm) { idx = i; break; }
        }
        if (idx === -1) return;
        var baseParent = baseDoc ? findNodeByCode(baseDoc.products, op.parentCode) : null;
        var baseItem = op.baseItem || (baseParent ? findItem(baseParent, op.code) : null);
        if (baseItem && !entityEqual(parent.items[idx], baseItem)) {
            var modKey = opIndex + ':__modified__';
            var decision = decisions ? decisions[modKey] : null;
            if (!decision && conflicts) {
                conflicts.push(makeConflict(opIndex, modKey, 'item', op.code, '__modified__', '该库存项已被其它设备修改，仍要删除吗', {
                    kind: 'remote-modified', base: baseItem, remote: parent.items[idx], mine: null
                }));
                decision = 'mine';
            }
            if (decision === 'theirs') return;
        }
        parent.items.splice(idx, 1);
    }

    function applyOps(doc, ops, baseDoc, decisions, conflicts) {
        validateDoc(doc);
        for (var i = 0; i < ops.length; i++) {
            var op = ops[i];
            if (!op || !op.type) throw makeError('BAD_OP', '第 ' + (i + 1) + ' 个保存操作无效');
            if (op.type === 'node.upsert') applyNodeUpsert(doc, op, baseDoc, decisions, conflicts, i);
            else if (op.type === 'node.delete') applyNodeDelete(doc, op, baseDoc, decisions, conflicts, i);
            else if (op.type === 'item.upsert') applyItemUpsert(doc, op, baseDoc, decisions, conflicts, i);
            else if (op.type === 'item.delete') applyItemDelete(doc, op, baseDoc, decisions, conflicts, i);
            else if (op.type === 'doc.replace') applyDocReplace(doc, op, baseDoc, decisions, conflicts, i);
            else throw makeError('BAD_OP', '未知保存操作：' + op.type);
        }
        return doc;
    }

    /**
     * 整库替换（仅用于“从备份/历史版本恢复”）。
     * 传了 baseDoc 时做冲突检测：远端 products 与 baseDoc 不一致说明期间有他人改动，
     * 推入 kind='doc-replace' 冲突交给页面确认（'theirs' 表示放弃替换）。
     */
    function applyDocReplace(doc, op, baseDoc, decisions, conflicts, opIndex) {
        if (!op.doc) throw makeError('BAD_OP', '要恢复的数据为空');
        validateDoc(op.doc);
        if (baseDoc && isPlainObject(baseDoc.products) && isPlainObject(doc.products)) {
            if (!deepEqual(baseDoc.products, doc.products)) {
                var key = opIndex + ':__replace__';
                var decision = decisions ? decisions[key] : null;
                if (!decision && conflicts) {
                    conflicts.push(makeConflict(opIndex, key, 'doc', null, '__replace__',
                        '远端数据已被其它设备修改，继续恢复会覆盖这些修改', { kind: 'doc-replace', label: '整库恢复', base: baseDoc.products, remote: doc.products }));
                    decision = 'mine';
                }
                if (decision === 'theirs') return;
            }
        }
        var next = clone(op.doc);
        // 只替换 products，保留远端根级未知字段；schemaVersion 跟随恢复内容
        doc.products = next.products;
        if (next.schemaVersion !== undefined) doc.schemaVersion = next.schemaVersion;
    }

    var writeQueues = Object.create(null);
    function enqueueWrite(key, task) {
        var previous = writeQueues[key] || Promise.resolve();
        var run = function () { return task(); };
        var next = previous.then(run, run);
        writeQueues[key] = next.then(function () { }, function () { });
        return next;
    }

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    /** 补写结构版本号（迁移入口）。不擅自改写业务字段，状态别名在读取/渲染时归一 */
    function migrateDoc(doc) {
        if (!isPlainObject(doc)) return doc;
        if (doc.schemaVersion === undefined || doc.schemaVersion === null || typeof doc.schemaVersion !== 'number') {
            doc.schemaVersion = SCHEMA_VERSION;
        }
        return doc;
    }

    async function save(options) {
        options = options || {};
        var token = options.token;
        var gistId = options.gistId;
        var filename = options.filename || 'data.json';
        if (!token || !gistId) throw makeError('AUTH', '缺少登录信息，请重新登录');
        var ops = Array.isArray(options.ops) ? options.ops : [];
        if (!ops.length) throw makeError('BAD_OP', '没有需要保存的修改');
        var baseDoc = options.baseDoc || { products: {} };
        var maxAttempts = Math.max(1, Math.min(5, options.maxAttempts || 3));
        var queueKey = gistId + '|' + filename;

        return enqueueWrite(queueKey, async function () {
            var attempt = 0;
            var lastError = null;
            while (attempt < maxAttempts) {
                attempt += 1;
                try {
                    // 1) 每次保存都重新读取远端最新文档（GET 也纳入重试，弱网下与写入同等对待）
                    var remote = await get(token, gistId, filename, { timeoutMs: options.timeoutMs });
                    // 2) 在远端副本上应用本次 ops
                    var work = clone(remote.data);
                    migrateDoc(work);
                    var conflicts = [];
                    applyOps(work, ops, baseDoc, null, conflicts);
                    var resolvedConflicts = [];
                    if (conflicts.length) {
                        var choices = null;
                        if (typeof options.onConflict === 'function') {
                            choices = await options.onConflict(conflicts, { attempt: attempt, remoteUpdatedAt: remote.updatedAt });
                        }
                        if (!choices) throw makeError('CONFLICT_ABORTED', '检测到数据冲突，已取消保存', { conflicts: conflicts });
                        var decisions = Object.create(null);
                        for (var c = 0; c < conflicts.length; c++) {
                            decisions[conflicts[c].key] = choices[c] === 'theirs' ? 'theirs' : 'mine';
                        }
                        work = clone(remote.data);
                        migrateDoc(work);
                        var still = [];
                        applyOps(work, ops, baseDoc, decisions, still);
                        if (still.length) throw makeError('CONFLICT_UNRESOLVED', '仍有冲突未解决，已取消保存', { conflicts: still });
                        resolvedConflicts = conflicts;
                        // 冲突决策可能选择“用远端”——重新判定是否有实际变化
                        if (deepEqual(work, remote.data)) {
                            return {
                                data: remote.data,
                                updatedAt: remote.updatedAt,
                                revision: remote.revision,
                                conflicts: resolvedConflicts,
                                unchanged: true,
                                attempts: attempt
                            };
                        }
                    }
                    // 3) 数据没有实际变化就不产生新版本（深比较，键顺序无关）
                    if (deepEqual(work, remote.data)) {
                        return {
                            data: remote.data,
                            updatedAt: remote.updatedAt,
                            revision: remote.revision,
                            conflicts: resolvedConflicts,
                            unchanged: true,
                            attempts: attempt
                        };
                    }
                    // 4) 写入；网络/5xx 自动重试（重试会重新 GET 并重放 ops）
                    var patched = await patch(token, gistId, filename, work, { timeoutMs: options.timeoutMs });
                    return {
                        data: work,
                        updatedAt: patched.updatedAt,
                        revision: patched.revision,
                        size: patched.size,
                        conflicts: resolvedConflicts,
                        unchanged: false,
                        attempts: attempt
                    };
                } catch (err) {
                    lastError = err;
                    if (attempt < maxAttempts && isRetryableError(err)) {
                        if (typeof options.onRetry === 'function') {
                            try { await options.onRetry(err, attempt); } catch (ignore) { /* ignore */ }
                        }
                        await sleep(300 * attempt);
                        continue;
                    }
                    throw err;
                }
            }
            throw lastError || makeError('SAVE_FAILED', '保存失败');
        });
    }

    /* ============================================================
     * 七点五、类目条码（unified 节点）状态汇总
     * 语义：unified=true 的节点代表"整个类目"，其状态由类目下所有未删除库存
     *       的状态自动汇总：全部在售 / 部分在售 / 全部售出 / 部分售出 / 全部待售 / 部分待售。
     * ============================================================ */
    function aggregateItemStatus(node) {
        var counts = { '待售': 0, '在售': 0, '售出': 0 };
        var other = 0;
        var total = 0;
        function visit(current) {
            if (!current || typeof current !== 'object') return;
            if (Array.isArray(current.items)) {
                for (var i = 0; i < current.items.length; i++) {
                    var item = current.items[i];
                    if (!item || isDeleted(item)) continue;
                    var s = normalizeStatus(item.status);
                    if (Object.prototype.hasOwnProperty.call(counts, s)) counts[s] += 1;
                    else other += 1;
                    total += 1;
                }
            }
            if (isPlainObject(current.children)) {
                for (var key in current.children) {
                    if (!Object.prototype.hasOwnProperty.call(current.children, key)) continue;
                    var child = current.children[key];
                    if (!child || isDeleted(child)) continue;
                    visit(child);
                }
            }
        }
        visit(node);
        var result = { total: total, counts: counts, other: other, label: '无库存', cls: 'status-unknown' };
        if (!total) return result;
        if (counts['售出'] === total) { result.label = '全部售出'; result.cls = 'status-sold'; return result; }
        if (counts['在售'] === total) { result.label = '全部在售'; result.cls = 'status-onsale'; return result; }
        if (counts['待售'] === total) { result.label = '全部待售'; result.cls = 'status-pending'; return result; }
        if (counts['在售'] > 0) { result.label = '部分在售'; result.cls = 'status-onsale'; return result; }
        if (counts['售出'] > 0) { result.label = '部分售出'; result.cls = 'status-sold'; return result; }
        result.label = '部分待售';
        result.cls = 'status-pending';
        return result;
    }

    /* ============================================================
     * 八、导出
     * ============================================================ */
    global.ZCFI = {
        VERSION: VERSION,
        SCHEMA_VERSION: SCHEMA_VERSION,
        STATUS: STATUS,
        STATUS_LIST: STATUS_LIST,
        FIELD_LABELS: FIELD_LABELS,

        normalizeStatus: normalizeStatus,
        statusClass: statusClass,
        escapeHtml: escapeHtml,
        escapeAttr: escapeAttr,
        normalizeCode: normalizeCode,
        normalizeQuery: normalizeQuery,
        sameCode: sameCode,
        normalizeUrl: normalizeUrl,
        sameUrl: sameUrl,
        isHttpUrl: isHttpUrl,
        isPlainObject: isPlainObject,
        clone: clone,
        valuesEqual: valuesEqual,
        deepEqual: deepEqual,
        sizeBytes: sizeBytes,

        friendlyError: friendlyError,
        isRetryableError: isRetryableError,

        storage: storage,
        credentials: credentials,
        formatDateTime: formatDateTime,
        formatTime: formatTime,
        downloadJson: downloadJson,
        toast: toast,

        getProducts: getProducts,
        findNodeByCode: findNodeByCode,
        findNodeEntry: findNodeEntry,
        findParentNode: findParentNode,
        findItem: findItem,
        walk: walk,
        countDescendants: countDescendants,
        aggregateItemStatus: aggregateItemStatus,
        validateDoc: validateDoc,
        validateDocDeep: validateDocDeep,
        migrateDoc: migrateDoc,
        isDeleted: isDeleted,

        get: get,
        patch: patch,
        history: history,
        getAtRevision: getAtRevision,
        save: save,
        applyOps: applyOps,

        // 兼容旧命名
        getGistContent: async function (token, gistId, filename) {
            var result = await get(token, gistId, filename);
            return result.data;
        },
        updateGistContent: function (token, gistId, filename, content) {
            try { console.warn('[ZCFI] updateGistContent 是整库覆盖入口，已不推荐使用；请改用 ZCFI.save() 的 ops 合并'); } catch (e) { /* ignore */ }
            return patch(token, gistId, filename, content);
        }
    };
})(typeof window !== 'undefined' ? window : this);
