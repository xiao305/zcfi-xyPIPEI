// core.js 单元验证（node vm 沙箱，模拟 window/localStorage/fetch）
// 用法：node tools/test-core.mjs（CI 必跑，无外部依赖）
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8');

function makeStorage() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        clear: () => m.clear(),
        _map: m,
    };
}

function createCtx(fetchImpl) {
    const ctx = {};
    ctx.window = ctx;
    ctx.globalThis = ctx;
    ctx.console = console;
    ctx.JSON = JSON;
    ctx.document = { createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, removeChild() {} }), body: { appendChild() {} }, head: { appendChild() {} } };
    ctx.localStorage = makeStorage();
    ctx.sessionStorage = makeStorage();
    ctx.setTimeout = setTimeout;
    ctx.clearTimeout = clearTimeout;
    ctx.AbortController = AbortController;
    ctx.TextEncoder = TextEncoder;
    ctx.structuredClone = structuredClone;
    ctx.fetch = fetchImpl;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx);
    return ctx;
}

const results = [];
function ok(cond, name, detail) { results.push({ ok: !!cond, name, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }
function eq(actual, expected, name) { ok(JSON.stringify(actual) === JSON.stringify(expected), name, `got=${JSON.stringify(actual)}`); }

const FIXTURE = {
    products: {
        A001: {
            name: '根', unified: true,
            children: {
                'A001/B001': { name: '子', items: [{ code: 'A001/B001/001', status: '在售', cost: 10 }] },
            },
        },
        A002: { name: '根2', items: [{ code: 'A002/001', status: '已售' }] },
    },
};

function mkFetch(handler) {
    return async (url, init = {}) => handler(String(url), init);
}
function resp(data, status = 200, headers = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'ERR',
        headers: { get: (n) => headers[String(n).toLowerCase()] || null },
        text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
        json: async () => data,
    };
}

// ---------- 1. 纯函数 ----------
{
    const ctx = createCtx(mkFetch(async () => resp({})));
    const Z = ctx.ZCFI;
    eq(Z.VERSION, '2.3.0', 'VERSION = 2.3.0');
    eq(Z.SCHEMA_VERSION, 1, 'SCHEMA_VERSION = 1');

    const nested = Z.findNodeEntry(FIXTURE.products, 'A001/B001/001');
    // 库存不在 node entry 中，改为查节点
    const entry = Z.findNodeEntry(FIXTURE.products, 'A001/B001');
    eq(entry && entry.parentCode, 'A001', 'findNodeEntry 嵌套节点 parentCode=A001（H-3）');
    const top = Z.findNodeEntry(FIXTURE.products, 'A001');
    eq(top && top.parentCode, null, 'findNodeEntry 根节点 parentCode=null');
    eq(Z.findParentNode(FIXTURE.products, 'A001/B001').name, '根', 'findParentNode 可用');
    eq(Z.findItem(FIXTURE.products.A001.children['A001/B001'], 'a001/b001/001').cost, 10, 'findItem 大小写不敏感');
    ok(!Z.findItem(FIXTURE.products.A001.children['A001/B001'], ''), 'findItem 空编码返回 null');

    eq(Z.sizeBytes('中文'), 6, 'sizeBytes 按 UTF-8 字节');
    eq(Z.deepEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }), true, 'deepEqual 键顺序无关');
    eq(Z.deepEqual({ a: 1 }, { a: 1, b: undefined }), false, 'deepEqual 长度不同');

    const doc = { products: {} };
    Z.migrateDoc(doc);
    eq(doc.schemaVersion, 1, 'migrateDoc 补 schemaVersion');

    ctx.localStorage.setItem('github_token', 't');
    ctx.sessionStorage.setItem('gist_id', 'g');
    const cred = Z.credentials.read();
    eq([cred.token, cred.gistId, cred.remember], ['t', 'g', true], 'credentials.read session 优先/remember');
    Z.credentials.write('t2', 'g2', 'data.json', false);
    eq(ctx.localStorage.getItem('github_token'), null, 'credentials.write remember=false 不写 localStorage');
    eq(ctx.sessionStorage.getItem('gist_id'), 'g2', 'credentials.write remember=false 写 sessionStorage');
    Z.credentials.clear();
    eq([ctx.localStorage.getItem('github_token'), ctx.sessionStorage.getItem('gist_id')], [null, null], 'credentials.clear 清两处');
}

// ---------- 2. HTTP 错误分类 ----------
{
    const cases = [
        [resp({ message: 'Bad credentials' }, 401), 'AUTH'],
        [resp({ message: 'forbidden' }, 403, { 'x-ratelimit-remaining': '12' }), 'PERMISSION'],
        [resp({ message: 'rate' }, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60) }), 'RATE_LIMIT'],
        [resp({ message: 'slow' }, 429, { 'retry-after': '30' }), 'RATE_LIMIT'],
        [resp({ message: 'nf' }, 404), 'FILE_MISSING'],
        [resp({ message: 'boom' }, 502), 'SERVER'],
    ];
    for (const [r, expected] of cases) {
        const ctx = createCtx(mkFetch(async () => r));
        try {
            await ctx.ZCFI.get('tok', 'gid', 'data.json');
            ok(false, `httpError ${r.status} → ${expected}`, '未抛错');
        } catch (e) {
            eq(e.code, expected, `httpError ${r.status} → ${expected}`);
            if (expected === 'RATE_LIMIT') ok(!!(e.resetAt || e.retryAfter), 'RATE_LIMIT 带重置信息');
            ok(typeof ctx.ZCFI.friendlyError(e) === 'string' && ctx.ZCFI.friendlyError(e).length > 0, `${expected} 有中文提示`);
        }
    }
}

// ---------- 3. 请求行为：no-store / 版本头 / 缓存绕开 ----------
{
    const calls = [];
    const ctx = createCtx(mkFetch(async (url, init) => {
        calls.push({ url, init });
        if (init.method === 'PATCH') return resp({ updated_at: 'T', history: [{ version: 'v2' }], files: {} });
        return resp({ files: { 'data.json': { content: JSON.stringify(FIXTURE), size: 100 } }, updated_at: 'T', history: [{ version: 'v1' }] });
    }));
    const Z = ctx.ZCFI;
    await Z.get('tok', 'gid', 'data.json');
    eq(calls[0].init.cache, 'no-store', 'GET 请求 cache=no-store（M-1）');
    eq(calls[0].init.headers['X-GitHub-Api-Version'], '2022-11-28', 'GET 固定 API 版本');
    eq(calls[0].init.headers['Accept'], 'application/vnd.github+json', 'GET Accept 头');
    ok(!/token=tok/.test(calls[0].url), 'Token 不在 URL');
}

// ---------- 4. save：三方合并 / 冲突 / createOnly / doc.replace / 重试 ----------
{
    let remote = JSON.parse(JSON.stringify(FIXTURE));
    let patches = 0;
    const ctx = createCtx(mkFetch(async (url, init) => {
        if (init.method === 'PATCH') {
            patches += 1;
            const body = JSON.parse(init.body);
            remote = JSON.parse(body.files['data.json'].content);
            return resp({ updated_at: 'T2', history: [{ version: 'v2' }] });
        }
        return resp({ files: { 'data.json': { content: JSON.stringify(remote) } }, updated_at: 'T1', history: [{ version: 'v1' }] });
    }));
    const Z = ctx.ZCFI;
    const base = JSON.parse(JSON.stringify(remote));

    // 4.1 普通字段更新 + schemaVersion 补写
    let r = await Z.save({ token: 't', gistId: 'g', filename: 'data.json', baseDoc: base, ops: [{ type: 'node.upsert', code: 'A002', originalCode: 'A002', fields: { remark: 'hello' } }] });
    eq(r.data.products.A002.remark, 'hello', 'save 应用字段');
    eq(r.data.schemaVersion, 1, 'save 写入 schemaVersion');
    ok(patches >= 1, 'save 产生 PATCH');

    // 4.2 createOnly：远端已有但 base 无 → CODE_EXISTS（模拟两端同时新增同一编码）
    remote.products.A099 = { name: '其它设备刚建的', items: [] };
    try {
        await Z.save({ token: 't', gistId: 'g', filename: 'data.json', baseDoc: base, ops: [{ type: 'node.upsert', code: 'A099', createOnly: true, fields: { name: 'x' } }] });
        ok(false, 'createOnly 冲突应抛 CODE_EXISTS');
    } catch (e) {
        eq(e.code, 'CODE_EXISTS', 'createOnly 冲突抛 CODE_EXISTS（并发新增不覆盖）');
    }
    delete remote.products.A099;

    // 4.3 doc.replace：远端(base 之后)被改 → 必须产生冲突，取消则中止
    let conflictSeen = null;
    const baseForReplace = JSON.parse(JSON.stringify(remote));
    remote.products.A002.name = '别人改的';
    try {
        await Z.save({
            token: 't', gistId: 'g', filename: 'data.json', baseDoc: baseForReplace,
            ops: [{ type: 'doc.replace', doc: { products: { ONLY: { name: '恢复' } } } }],
            onConflict: async (conflicts) => { conflictSeen = conflicts; return null; },
        });
        ok(false, 'doc.replace 冲突取消应中止');
    } catch (e) {
        eq(e.code, 'CONFLICT_ABORTED', 'doc.replace 远端变更产生冲突（H-4）');
        ok(conflictSeen && conflictSeen[0].kind === 'doc-replace', 'doc.replace 冲突 kind=doc-replace');
    }

    // 4.4 GET 失败自动重试
    let attempts = 0;
    const ctx2 = createCtx(mkFetch(async (url, init) => {
        if (init.method === 'PATCH') return resp({ updated_at: 'T', history: [{ version: 'v' }] });
        attempts += 1;
        if (attempts === 1) return resp({ message: 'boom' }, 502);
        return resp({ files: { 'data.json': { content: JSON.stringify(FIXTURE) } }, updated_at: 'T', history: [{ version: 'v' }] });
    }));
    const r2 = await ctx2.ZCFI.save({ token: 't', gistId: 'g', filename: 'data.json', baseDoc: JSON.parse(JSON.stringify(FIXTURE)), maxAttempts: 3, ops: [{ type: 'node.upsert', code: 'A002', fields: { remark: 'retry' } }] });
    ok(attempts >= 2 && r2.attempts === 2, 'save 对 GET 502 自动重试（M-2）');
}

// ---------- 5. 截断与严格读取 ----------
{
    const truncated = { write: 0 };
    const ctx = createCtx(mkFetch(async (url, init) => {
        if (url.includes('raw')) return resp('{"products":{"R":{"name":"raw"}}}');
        return resp({ files: { 'data.json': { content: '{"products":{', size: 2000000, truncated: true, raw_url: 'https://gist.githubusercontent.com/x/raw' } }, updated_at: 'T', history: [{ version: 'v' }] });
    }));
    const r = await ctx.ZCFI.get('t', 'g', 'data.json');
    eq(Object.keys(r.data.products), ['R'], 'truncated → raw_url 拉全量（既有能力保留）');

    const ctx2 = createCtx(mkFetch(async () => resp({ files: { 'data.json': { content: '{bad-json', size: 10 } }, updated_at: 'T', history: [{ version: 'v' }] })));
    try {
        await ctx2.ZCFI.get('t', 'g', 'data.json');
        ok(false, '损坏 JSON 应抛 PARSE');
    } catch (e) { eq(e.code, 'PARSE', '损坏 JSON 抛 PARSE（严格读取）'); }
}

// ---------- 6. 类目条码状态汇总 + applyOps 导出 ----------
{
    const ctx = createCtx(mkFetch(async () => resp({})));
    const Z = ctx.ZCFI;
    const unified = {
        name: '类目', unified: true,
        items: [
            { code: 'N/001', status: '在售' },
            { code: 'N/002', status: '在售' },
        ],
    };
    let agg = Z.aggregateItemStatus(unified);
    eq(agg.label, '全部在售', 'aggregateItemStatus 全部在售');
    eq(agg.total, 2, 'aggregateItemStatus 计数');
    unified.items.push({ code: 'N/003', status: '售出' });
    agg = Z.aggregateItemStatus(unified);
    eq(agg.label, '部分在售', 'aggregateItemStatus 混合 → 部分在售');
    eq(agg.counts['售出'], 1, 'aggregateItemStatus 分状态计数');
    unified.items.push({ code: 'N/004', status: '售出', deletedAt: '2026-01-01T00:00:00Z' });
    agg = Z.aggregateItemStatus(unified);
    eq(agg.total, 3, 'aggregateItemStatus 排除已删除库存');
    eq(Z.aggregateItemStatus({ name: '空', items: [] }).label, '无库存', 'aggregateItemStatus 无库存');
    eq(Z.aggregateItemStatus({ name: '待售', items: [{ code: 'X/1', status: '待售' }] }).label, '全部待售', 'aggregateItemStatus 全部待售');

    // applyOps 导出：可在本地乐观应用
    const work = JSON.parse(JSON.stringify(FIXTURE));
    Z.applyOps(work, [{ type: 'node.upsert', code: 'A002', originalCode: 'A002', fields: { remark: 'optimistic' } }], JSON.parse(JSON.stringify(FIXTURE)), null, []);
    eq(work.products.A002.remark, 'optimistic', 'ZCFI.applyOps 可在本地应用 ops');
    ok(typeof Z.applyOps === 'function', 'ZCFI.applyOps 已导出');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过，${failed.length} 失败`);
if (failed.length) process.exit(1);
