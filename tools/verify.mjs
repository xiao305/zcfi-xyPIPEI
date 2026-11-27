#!/usr/bin/env node
/**
 * tools/verify.mjs —— 发布前静态/一致性校验（无第三方依赖，CI 与本地共用）
 *
 * 用法：node tools/verify.mjs            # 全量
 *       node tools/verify.mjs --verbose  # 打印每项检查细节
 *
 * 退出码：0 = 全部通过；1 = 存在失败项。
 *
 * 覆盖：内联脚本语法、core/vendor 语法、禁用模式（CDN、示例 Gist ID、旧路径）、
 *       必需的 CSP/referrer、关键修复标记、版本号一致性、文件结构与存在性。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

const failures = [];
const passes = [];
function ok(msg) { passes.push(msg); if (VERBOSE) console.log('  ok   ' + msg); }
function bad(msg) { failures.push(msg); console.log('  FAIL ' + msg); }
function check(cond, msg) { cond ? ok(msg) : bad(msg); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

const files = {
    admin: 'admin.html',
    scan: 'scan.html',
    index: 'index.html',
    core: 'js/core.js',
    testPage: 'tools/scanner-test.html',
};

console.log('== 1. 语法检查 ==');
for (const [name, rel] of Object.entries(files)) {
    if (!exists(rel)) { bad(`${rel} 不存在`); continue; }
    const text = read(rel);
    if (!rel.endsWith('.html')) {
        runNodeCheck(name, rel, text);
        continue;
    }
    const blocks = extractInlineScripts(text);
    if (!blocks.length) { ok(`${rel} 无内联脚本`); continue; }
    blocks.forEach((code, i) => runNodeCheck(`${name} 内联脚本 #${i + 1}`, `${rel}#script${i + 1}`, code));
}
if (exists('js/vendor/html5-qrcode.min.js')) {
    runNodeCheck('vendor html5-qrcode', 'js/vendor/html5-qrcode.min.js', read('js/vendor/html5-qrcode.min.js'));
} else {
    bad('js/vendor/html5-qrcode.min.js 不存在');
}

function extractInlineScripts(html) {
    const out = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    let m;
    while ((m = re.exec(html))) {
        const attrs = m[1] || '';
        if (/\bsrc\s*=/i.test(attrs)) continue;
        if (/\btype\s*=\s*["'](application\/ld\+json|text\/template)/i.test(attrs)) continue;
        const code = m[2];
        if (code && code.trim()) out.push(code);
    }
    return out;
}

function runNodeCheck(label, rel, code) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcfi-verify-'));
    const file = path.join(dir, 'block.js');
    try {
        fs.writeFileSync(file, code, 'utf8');
        const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        if (r.status === 0) ok(`${label} 语法通过`);
        else bad(`${label} 语法错误：${(r.stderr || '').split('\n').slice(0, 3).join(' ')}`);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

console.log('== 2. 禁用模式（安全/一致性） ==');
const tracked = [
    'admin.html', 'scan.html', 'index.html', 'js/core.js', 'tools/scanner-test.html',
    'README.md', 'CHANGELOG.md', 'docs/ARCHITECTURE.md', 'docs/CONSISTENCY-REVIEW.md',
    'docs/BACKUP-AND-RECOVERY.md', 'docs/RELEASE-CHECKLIST.md', 'docs/FAQ.md', 'docs/USER-GUIDE.md',
];
const forbidden = [
    { re: /unpkg\.com/i, msg: '仍引用 unpkg CDN（应本地化 js/vendor）' },
    { re: /f13d97c430522e4851afbf3cd2331e14/, msg: '仍存在示例 Gist ID（必须为 0 处）' },
    { re: /<script[^>]+src=["']CLodopFuncs\.js/i, msg: '仍从仓库加载 CLodopFuncs.js（应运行时加载本机服务）' },
    { re: /脚本存放/, msg: '仍存在过期本地路径 E:\\脚本存放' },
    { re: /user-scalable=no/i, msg: '仍禁用页面缩放（可访问性）' },
    { re: /DEFAULT_GIST_ID\s*=\s*['"][0-9a-f]{20,}/, msg: '仍硬编码默认 Gist ID' },
    { re: /setTimeout\(function \(\) \{ ensureLodopLoaded\(\); \}/, msg: '页面加载时仍自动探测 C-Lodop（v2.2.2 应改为按需）' },
];
for (const rel of tracked) {
    if (!exists(rel)) continue;
    const text = read(rel);
    for (const f of forbidden) {
        if (f.re.test(text)) bad(`${rel}: ${f.msg}`);
    }
}
if (!failures.some((x) => x.includes('仍'))) ok('禁用模式全部为 0 命中');

console.log('== 3. 必需标记（本次修复项） ==');
const requirements = [
    ['admin.html', /Content-Security-Policy/, 'admin 缺少 CSP meta'],
    ['admin.html', /name="referrer"/, 'admin 缺少 referrer meta'],
    ['scan.html', /Content-Security-Policy/, 'scan 缺少 CSP meta'],
    ['scan.html', /js\/vendor\/html5-qrcode\.min\.js/, 'scan 未使用本地扫码库'],
    ['index.html', /Content-Security-Policy/, 'index 缺少 CSP meta'],
    ['js/core.js', /VERSION = '2\.4\.0'/, 'core 版本不是 2.4.0'],
    ['js/core.js', /cache = 'no-store'/, 'core 未禁用 HTTP 缓存'],
    ['js/core.js', /credentials/, 'core 缺少 credentials 统一凭据'],
    ['js/core.js', /SCHEMA_VERSION/, 'core 缺少 schemaVersion'],
    ['js/core.js', /createOnly/, 'core 缺少 createOnly 语义'],
    ['js/core.js', /doc-replace/, 'core 缺少 doc.replace 冲突检测'],
    ['admin.html', /credentials/, 'admin 未使用 ZCFI.credentials'],
    ['admin.html', /isComposing/, 'admin 搜索缺 IME 保护'],
    ['admin.html', /On_Return/, 'admin 未处理打印异步结果'],
    ['admin.html', /getCLodop/, 'admin 未兼容本机脚本的 getCLodop()'],
    ['admin.html', /__zcfiLodopShim/, 'admin 缺少 C-Lodop 字符串定时器兼容垫片'],
    ['admin.html', /var urls = \[LODOP_HTTP_URL, LODOP_HTTPS_URL\]/, 'admin 未采用 http 优先加载 C-Lodop'],
    ['admin.html', /未检测（点打印/, 'admin 状态栏未改为按需连接'],
    ['admin.html', /aggregateItemStatus/, 'admin 未使用类目状态汇总'],
    ['admin.html', /类目条码/, 'admin 未改名类目条码'],
    ['admin.html', /inferNextCode/, 'admin 未实现同级编码推断'],
    ['admin.html', /tpl-50x40-full/, 'admin 缺少 50*40 模板'],
    ['admin.html', /tpl-50x30-inbound/, 'admin 缺少入库 50*30 模板'],
    ['admin.html', /tpl-40x30-inbound/, 'admin 缺少入库 40*30 模板'],
    ['admin.html', /tpl-50x40-inbound/, 'admin 缺少入库 50*40 模板'],
    ['admin.html', /resolveBarcodeBoxWidth/, 'admin 缺少条码对象宽标定逻辑'],
    ['admin.html', /BARCODE_WIDTH_ANCHORS/, 'admin 缺少条码长度锚点标定表'],
    ['admin.html', /tree-action-menu/, 'admin 缺少 ⋮ 操作菜单'],
    ['admin.html', /btn-text/, 'admin 缺少 text-button 样式'],
    ['admin.html', /batch-actions-global/, 'admin 缺少批量按钮显隐容器'],
    ['admin.html', /has-selection/, 'admin 缺少批量按钮显示状态'],
    ['admin.html', /chevron/, 'admin 缺少 chevron 展开图标'],
    ['admin.html', /cubic-bezier\(0\.4, 0, 0\.2, 1\)/, 'admin 缺少 0.2s 展开动画曲线'],
    ['admin.html', /border-left: 1px solid #e2e8f0/, 'admin 缺少 1px 浅灰引导线'],
    ['admin.html', /children-inner/, 'admin 缺少 children 动画内层'],
    ['admin.html', /grid-template-rows/, 'admin 缺少树展开高度动画'],
    ['admin.html', /prefers-reduced-motion/, 'admin 缺少 reduced-motion 适配'],
    ['admin.html', /favicon\.svg/, 'admin 缺少 favicon.svg 引用'],
    ['admin.html', /brand-line/, 'admin 缺少页脚品牌组合'],
    ['scan.html', /favicon\.svg/, 'scan 缺少 favicon.svg 引用'],
    ['scan.html', /brand-line/, 'scan 缺少页脚品牌组合'],
    ['index.html', /favicon\.svg/, 'index 缺少 favicon.svg 引用'],
    ['index.html', /brand-line/, 'index 缺少页脚品牌组合'],
    ['admin.html', /top-main/, 'admin 顶栏缺少标题+品牌行容器'],
    ['admin.html', /w: \[/, 'admin 缺少按长度条码宽度表'],
    ['admin.html', /findRecycleConflict/, 'admin 缺少回收站编码冲突检测'],
    ['admin.html', /自动识别（由库存汇总）/, 'admin 缺少自动识别状态选项'],
    ['admin.html', /rotate-cw/, 'admin 缺少顺时针刷新图标'],
    ['admin.html', /text-size-adjust/, 'admin 缺少品牌字体缩放锁定'],
    ['admin.html', /href="https:\/\/zcfi\.cn\/"/, 'admin 品牌 logo 缺少跳转链接'],
    ['admin.html', /brand-line--header/, 'admin 顶栏缺少品牌组合'],
    ['admin.html', /login-box[\s\S]*?brand-line/, 'admin 登录页缺少品牌组合'],
    ['scan.html', /login-box[\s\S]*?brand-line/, 'scan 登录页缺少品牌组合'],
    ['admin.html', /brand-logo[\s\S]*?16px/, 'admin 品牌 logo 未放大到 16px'],
    ['admin.html', /customTextSize/, 'admin 缺少自定义文本字号'],
    ['admin.html', /customText/, 'admin 缺少自定义文本设置'],
    ['admin.html', /codeTextMode/, 'admin 缺少编码文字设置'],
    ['admin.html', /labelCategory/, 'admin 缺少入库/出库分类'],
    ['admin.html', /条码区域/, 'admin 预览缺少条码区域占位'],
    ['admin.html', /ADD_PRINT_TEXT/, 'admin 未使用 LODOP 原生文本'],
    ['admin.html', /ShowBarText/, 'admin 未关闭条码文字'],
    ['scan.html', /aggregateItemStatus/, 'scan 未展示类目聚合状态'],
    ['admin.html', /ws:\/\/127\.0\.0\.1:8000/, 'admin CSP 未放行 ws://127.0.0.1:8000'],
    ['admin.html', /zcfi:lodop-ready/, 'admin 缺少 C-Lodop 就绪事件'],
    ['admin.html', /localhost\.lodop\.net:8443/, 'admin 未运行时加载本机 C-Lodop'],
    ['admin.html', /createOnly/, 'admin 新增操作未传 createOnly'],
    ['scan.html', /credentials/, 'scan 未使用 ZCFI.credentials'],
    ['scan.html', /pagehide/, 'scan 缺少卸载兜底'],
    ['tools/scanner-test.html', /js\/vendor\/html5-qrcode\.min\.js/, '调试页未使用本地扫码库'],
];
for (const [rel, re, msg] of requirements) {
    if (!exists(rel)) { bad(`${rel} 不存在（${msg}）`); continue; }
    check(re.test(read(rel)), msg);
}

console.log('== 4. 版本一致性 ==');
const versionFiles = ['README.md', 'CHANGELOG.md', 'docs/ARCHITECTURE.md', 'docs/RELEASE-CHECKLIST.md'];
for (const rel of versionFiles) {
    if (!exists(rel)) { bad(`${rel} 不存在`); continue; }
    check(/2\.4\.0/.test(read(rel)), `${rel} 未提及 v2.4.0`);
}
check(/2\.4\.0/.test(read('js/core.js')), 'core 未标记 2.4.0');
{
    const cspMeta = (read('admin.html').match(/Content-Security-Policy" content="([^"]*)"/) || [null, ''])[1];
    check(!/unsafe-eval/.test(cspMeta), 'admin CSP 不应放开 unsafe-eval');
}
check(/R5 · v2\.4\.0/.test(read('admin.html')), 'admin 未标记 R5 · v2.4.0');
check(/R3 · v2\.4\.0/.test(read('scan.html')), 'scan 未标记 R3 · v2.4.0');
check(/\[2\.4\.0\]/.test(read('CHANGELOG.md')), 'CHANGELOG 缺少 [2.4.0] 条目');

console.log('== 5. 文件结构与存在性 ==');
check(!exists('CLodopFuncs.js'), 'CLodopFuncs.js 仍被提交（应删除，运行时加载）');
check(!exists('web-scanner-lib'), 'web-scanner-lib/ 仍存在（已废弃，应删除）');
check(exists('js/vendor/html5-qrcode.min.js'), '缺少本地扫码库 js/vendor/html5-qrcode.min.js');
check(exists('js/vendor/README.md'), '缺少 vendor 依赖说明 js/vendor/README.md');
check(exists('tools/scanner-test.html'), '缺少 tools/scanner-test.html（调试页）');
check(exists('tools/test-core.mjs'), '缺少 tools/test-core.mjs（core 单元测试）');
check(exists('tools/test-lodop-loader.mjs'), '缺少 tools/test-lodop-loader.mjs（C-Lodop loader 单元测试）');
check(exists('tools/test-merge-render.mjs'), '缺少 tools/test-merge-render.mjs（合单视图渲染单元测试）');
check(exists('.github/workflows/ci.yml'), '缺少 CI 配置 .github/workflows/ci.yml');

for (const rel of ['admin.html', 'scan.html', 'index.html']) {
    const text = read(rel);
    check(/<html[\s>]/i.test(text) && /<\/html>/i.test(text), `${rel} HTML 结构不完整`);
    check(/<title>[^<]+<\/title>/i.test(text), `${rel} 缺少 <title>`);
    check(/<meta\s+charset=["']?utf-8/i.test(text), `${rel} 缺少 UTF-8 charset`);
}
check(!/<script\b[^>]*>[\s\S]*?<\/script>/i.test(read('index.html')), 'index.html 不应包含内联脚本（导航页）');

console.log('== 6. 数据文件体积 ==');
const size = (rel) => (exists(rel) ? fs.statSync(path.join(ROOT, rel)).size : -1);
for (const rel of ['admin.html', 'scan.html', 'js/core.js', 'js/vendor/html5-qrcode.min.js']) {
    const s = size(rel);
    if (s < 0) bad(`${rel} 不存在`);
    else ok(`${rel} = ${(s / 1024).toFixed(1)} KB`);
}

const total = passes.length + failures.length;
console.log(`\n结果：${passes.length}/${total} 通过，${failures.length} 失败`);
if (failures.length) {
    console.log('失败项：');
    failures.forEach((f) => console.log(' - ' + f));
    process.exit(1);
}
console.log('全部通过 ✅');
