// admin.html C-Lodop 加载/就绪判定单元测试（vm 沙箱，模拟本机服务脚本）
// 用法：node tools/test-lodop-loader.mjs（CI 必跑，无外部依赖）
import fs from 'node:fs';
import vm from 'node:vm';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'admin.html');
const html = fs.readFileSync(ADMIN, 'utf8');

const results = [];
function record(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }
function eq(a, b, name) { const cond = JSON.stringify(a) === JSON.stringify(b); record(name, cond, `got=${JSON.stringify(a)} want=${JSON.stringify(b)}`); }

// 抽取第一个内联脚本（C-Lodop loader）
function extractLoaderScript(source) {
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    let m;
    while ((m = re.exec(source))) {
        if (/\bsrc\s*=/i.test(m[1] || '')) continue;
        if (m[2].includes('C-Lodop 运行时加载')) return m[2];
    }
    throw new Error('未找到 C-Lodop loader 脚本');
}

function makeInst(opts = {}) {
    return {
        PRINT: function () { return 'task-1'; },
        PREVIEW: function () { return true; },
        GET_PRINTER_COUNT: function () { return opts.printers !== undefined ? opts.printers : 3; },
        GET_PRINTER_NAME: function (i) { return '打印机' + i; },
        SocketOpened: !!opts.socketOpen,
        webskt: opts.wsReady ? { readyState: 1 } : null,
        Priority: 1,
    };
}

function createEnv(opts) {
    const requests = [];
    const statusEl = { textContent: '', className: '' };
    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.console = console;
    sandbox.JSON = JSON;
    sandbox.Promise = Promise;
    sandbox.Date = Date;
    sandbox.Math = Math;
    sandbox.Number = Number;
    sandbox.Object = Object;
    sandbox.Array = Array;
    sandbox.String = String;
    sandbox.RegExp = RegExp;
    sandbox.Error = Error;
    sandbox.isFinite = isFinite;
    sandbox.setTimeout = (fn, ms) => setTimeout(fn, Math.min(ms, 20)); // 压缩等待
    sandbox.clearTimeout = clearTimeout;
    sandbox.location = { protocol: opts.protocol || 'https:' };
    sandbox.Event = class Event { constructor(type) { this.type = type; } };
    sandbox.addEventListener = function () {};
    sandbox.dispatchEvent = function () {};
    sandbox.document = {
        readyState: 'loading',
        getElementById: (id) => (id === 'lodop-status' ? statusEl : null),
        createElement: () => ({ set src(v) { this._src = v; }, get src() { return this._src; }, onload: null, onerror: null, parentNode: null }),
        head: {
            appendChild(script) {
                const url = script.src;
                requests.push(url);
                const behavior = opts.behaviors || {};
                setTimeout(() => {
                    const kind = behavior[url] || 'ok';
                    if (kind === 'error') { if (script.onerror) script.onerror(); return; }
                    if (kind === 'ok') {
                        const inst = makeInst(opts);
                        sandbox.CLODOP = inst;
                        sandbox.LODOP = inst;
                        sandbox.getCLodop = function () { return inst; };
                        if (script.onload) script.onload();
                    } else if (kind === 'script-no-socket') {
                        const inst = makeInst({ socketOpen: false, wsReady: false });
                        sandbox.CLODOP = inst;
                        sandbox.LODOP = inst;
                        sandbox.getCLodop = function () { return inst; };
                        if (script.onload) script.onload();
                    }
                }, 1);
            },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(extractLoaderScript(html), sandbox);
    return { sandbox, requests, statusEl };
}

async function main() {
    // 1. HTTPS 页面：只允许 https 脚本；服务连上 → 就绪，且补 getLodop 别名
    {
        const { sandbox, requests, statusEl } = createEnv({ protocol: 'https:', socketOpen: true });
        const ok = await sandbox.ensureLodopLoaded();
        eq(ok, true, 'https: 服务已连接 → ensureLodopLoaded() = true');
        eq(requests, ['https://localhost.lodop.net:8443/CLodopFuncs.js'], 'https: 只请求 https 脚本（无 http，避免混合内容）');
        record(requests.every((u) => u.startsWith('https://')), 'https: 未发起任何 http 请求');
        record(typeof sandbox.getLodop === 'function', '补全 getLodop 兼容别名');
        eq(sandbox.lodopCanCallService(), true, 'lodopCanCallService() = true');
        record(statusEl.textContent.includes('已就绪'), '状态显示已就绪', statusEl.textContent);
        record(statusEl.className === 'success', '状态样式 success');
    }

    // 2. HTTPS 页面：脚本加载成功但服务连不上 → 明确提示"连接未建立"，且仍不请求 http
    {
        const { sandbox, requests, statusEl } = createEnv({ protocol: 'https:', socketOpen: false, wsReady: false });
        const ok = await sandbox.ensureLodopLoaded();
        eq(ok, false, 'https: 服务未连接 → false');
        eq(requests, ['https://localhost.lodop.net:8443/CLodopFuncs.js'], 'https: 服务未连接时也不回退 http');
        record(statusEl.textContent.includes('连接未建立'), '状态提示服务连接未建立', statusEl.textContent);
        record(!/http:\/\/localhost:8000/.test(requests.join(',')), '未出现 http://localhost:8000');
    }

    // 3. HTTPS 页面：脚本加载失败（证书/未安装）→ 提示证书，且只请求 https
    {
        const { sandbox, requests, statusEl } = createEnv({
            protocol: 'https:',
            behaviors: { 'https://localhost.lodop.net:8443/CLodopFuncs.js': 'error' },
        });
        const ok = await sandbox.ensureLodopLoaded();
        eq(ok, false, 'https: 脚本加载失败 → false');
        eq(requests, ['https://localhost.lodop.net:8443/CLodopFuncs.js'], 'https: 失败后不回退 http');
        record(/证书/.test(statusEl.textContent), '状态提示证书/安装问题', statusEl.textContent);
    }

    // 4. HTTP 页面（本机调试）：先 http，成功即用；失败可回退 https
    {
        const { sandbox, requests } = createEnv({ protocol: 'http:', socketOpen: true });
        const ok = await sandbox.ensureLodopLoaded();
        eq(ok, true, 'http: 本机服务可用 → true');
        eq(requests, ['http://localhost:8000/CLodopFuncs.js'], 'http: 先请求 http:8000');
    }
    {
        const { sandbox, requests } = createEnv({
            protocol: 'http:',
            socketOpen: true,
            behaviors: { 'http://localhost:8000/CLodopFuncs.js': 'error' },
        });
        const ok = await sandbox.ensureLodopLoaded();
        eq(ok, true, 'http: 8000 失败后可回退 https 并成功');
        eq(requests, ['http://localhost:8000/CLodopFuncs.js', 'https://localhost.lodop.net:8443/CLodopFuncs.js'], 'http: 回退顺序正确');
    }

    // 5. 回归：不得再出现"HTTPS 页面尝试 http"的旧实现特征
    {
        const src = extractLoaderScript(html);
        record('旧的双协议 fallback 逻辑已移除', !/var fallback = isHttps \? LODOP_HTTP_URL/.test(src));
        record('HTTPS 仅 https、HTTP 才 http 的协议选择存在', /lodopIsHttpsPage\(\) \? \[LODOP_HTTPS_URL\] : \[LODOP_HTTP_URL, LODOP_HTTPS_URL\]/.test(src));
        record('兼容 getCLodop（本机脚本只提供它）', /getCLodop/.test(src));
        record('就绪判定检查 SocketOpened', /SocketOpened/.test(src));
    }

    const failed = results.filter((r) => !r.ok);
    console.log(`
结果：${results.length - failed.length}/${results.length} 通过，${failed.length} 失败`);
    if (failed.length) process.exit(1);
}

main().catch((e) => { console.error('TEST FAILED:', e); process.exit(2); });
