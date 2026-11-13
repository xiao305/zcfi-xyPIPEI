// admin.html C-Lodop 加载/就绪判定单元测试（vm 沙箱，模拟本机服务脚本）
// v2.2.2：验证「加载时不自动请求」「http:8000 优先」「getCLodop 兼容」「Socket 判定」
// 用法：node tools/test-lodop-loader.mjs（CI 必跑，无外部依赖）
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ADMIN = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'admin.html');
const html = fs.readFileSync(ADMIN, 'utf8');

const results = [];
function record(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }
function eq(a, b, name) { const cond = JSON.stringify(a) === JSON.stringify(b); record(name, cond, `got=${JSON.stringify(a)} want=${JSON.stringify(b)}`); }

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

function createEnv(opts = {}) {
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
                const spec = (opts.behaviors || {})[url] || 'ok';
                setTimeout(() => {
                    if (spec === 'error') { if (script.onerror) script.onerror(); return; }
                    const ip = spec === 'ok' ? { socketOpen: true } : spec;
                    const inst = makeInst(ip);
                    sandbox.CLODOP = inst;
                    sandbox.LODOP = inst;
                    sandbox.getCLodop = function () { return inst; };
                    if (script.onload) script.onload();
                }, 1);
            },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(extractLoaderScript(html), sandbox);
    return { sandbox, requests, statusEl };
}

async function main() {
    // 1. 加载时不自动请求本机（v2.2.2 关键行为：不再触发浏览器本地网络授权提示）
    {
        const { sandbox, requests } = createEnv({ protocol: 'https:' });
        await new Promise((r) => setTimeout(r, 150));
        eq(requests, [], '页面加载时不自动请求本机 C-Lodop（v2.2.2）');
        record('ensureLodopLoaded 仍可手动调用', typeof sandbox.ensureLodopLoaded === 'function');
    }

    // 2. 手动加载（模拟点打印）：HTTPS 页面也优先 http://localhost:8000
    {
        const { sandbox, requests, statusEl } = createEnv({ protocol: 'https:', behaviors: { 'http://localhost:8000/CLodopFuncs.js': 'ok' } });
        const ok = await sandbox.ensureLodopLoaded();
        eq(ok, true, '点打印后 http:8000 连接成功 → true');
        eq(requests, ['http://localhost:8000/CLodopFuncs.js'], 'HTTPS 页面优先请求 http://localhost:8000');
        record('未再请求 8443（绕开可能过期的证书）', !requests.some((u) => u.startsWith('https://')));
        record('补全 getLodop 兼容别名', typeof sandbox.getLodop === 'function');
        eq(sandbox.lodopCanCallService(), true, 'lodopCanCallService() = true');
        record('状态显示已就绪', statusEl.textContent.includes('已就绪'), statusEl.textContent);
    }

    // 3. http:8000 不可用时回退 https:8443
    {
        const { sandbox, requests } = createEnv({
            protocol: 'https:',
            behaviors: {
                'http://localhost:8000/CLodopFuncs.js': 'error',
                'https://localhost.lodop.net:8443/CLodopFuncs.js': 'ok',
            },
        });
        const ok = await sandbox.ensureLodopLoaded();
        eq(ok, true, 'http 失败后回退 https 成功');
        eq(requests, ['http://localhost:8000/CLodopFuncs.js', 'https://localhost.lodop.net:8443/CLodopFuncs.js'], '回退顺序正确');
    }

    // 4. 脚本能加载但 WebSocket 连不上 → 明确「连接未建立」
    {
        const { sandbox, requests, statusEl } = createEnv({
            protocol: 'https:',
            behaviors: {
                'http://localhost:8000/CLodopFuncs.js': { socketOpen: false, wsReady: false },
                'https://localhost.lodop.net:8443/CLodopFuncs.js': { socketOpen: false, wsReady: false },
            },
        });
        const ok = await sandbox.ensureLodopLoaded();
        eq(ok, false, '服务未连接 → false');
        record('状态提示服务连接未建立', statusEl.textContent.includes('连接未建立'), statusEl.textContent);
        eq(requests, ['http://localhost:8000/CLodopFuncs.js', 'https://localhost.lodop.net:8443/CLodopFuncs.js'], '两个地址都尝试后失败');
    }

    // 5. 两个地址都失败 → 给出启动服务/允许本地网络/证书的提示
    {
        const { sandbox, statusEl } = createEnv({
            protocol: 'https:',
            behaviors: {
                'http://localhost:8000/CLodopFuncs.js': 'error',
                'https://localhost.lodop.net:8443/CLodopFuncs.js': 'error',
            },
        });
        const ok = await sandbox.ensureLodopLoaded();
        eq(ok, false, '全部失败 → false');
        record('状态给出可操作提示', /无法连接|证书|本地网络/.test(statusEl.textContent), statusEl.textContent);
    }

    // 6. 静态实现约束
    {
        const src = extractLoaderScript(html);
        record('实现为 http 优先', /var urls = \[LODOP_HTTP_URL, LODOP_HTTPS_URL\]/.test(src));
        record('兼容 getCLodop（本机脚本只提供它）', /getCLodop/.test(src));
        record('就绪判定检查 SocketOpened', /SocketOpened/.test(src));
        record('已移除加载时自动探测逻辑', !/scheduleInitialLodopLoad/.test(src));
        record('loader 不使用 eval / new Function（不依赖 unsafe-eval）', !/\beval\s*\(/.test(src) && !/new Function/.test(src));
    }

    const failed = results.filter((r) => !r.ok);
    console.log(`\n结果：${results.length - failed.length}/${results.length} 通过，${failed.length} 失败`);
    if (failed.length) process.exit(1);
}

main().catch((e) => { console.error('TEST FAILED:', e); process.exit(2); });
