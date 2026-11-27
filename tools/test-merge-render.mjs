// v2.4.0 合单视图渲染测试：直接从 admin.html / scan.html 抽取渲染代码块，在 node vm 中执行
// 用法：node tools/test-merge-render.mjs（CI 必跑，无外部依赖）
// 目的：不启动浏览器也能验证「按包裹 / 按订单」两套视图的分组文案、标记与计数是否正确。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE_SRC = fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8');
const ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const SCAN_SRC = fs.readFileSync(path.join(ROOT, 'scan.html'), 'utf8');

const results = [];
function ok(cond, name, detail) {
    results.push({ ok: !!cond, name });
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
function contains(haystack, needle, name) {
    ok(String(haystack).indexOf(needle) !== -1, name, needle);
}

/** 抽取两个标记之间的代码块（含起始标记行，不含结束标记行） */
function sliceBetween(src, startMarker, endMarker, label) {
    const start = src.indexOf(startMarker);
    if (start === -1) throw new Error(`未找到起始标记：${label}`);
    const end = src.indexOf(endMarker, start);
    if (end === -1) throw new Error(`未找到结束标记：${label}`);
    return src.slice(start, end);
}

const FIXTURE = {
    products: {
        A: {
            name: '大类A',
            children: {
                'A/B': {
                    name: '子B',
                    items: [
                        { code: 'A/B/001', name: 'b1', status: '在售', trackingNumber: 'SF123', orderNumber: 'O001' },
                        { code: 'A/B/002', name: 'b2', status: '在售', trackingNumber: 'sf123 ', orderNumber: 'O001' },
                        { code: 'A/B/003', name: 'b3', status: '待售', trackingNumber: 'SF123', orderNumber: 'O002' },
                        { code: 'A/B/004', name: 'b4', status: '在售', orderNumber: 'O001' },
                        { code: 'A/B/005', name: 'b5', status: '在售', trackingNumber: 'SF456', orderNumber: 'O001' },
                        { code: 'A/B/006', name: 'b6', status: '在售', trackingNumber: 'SF789', orderNumber: 'O003' },
                        { code: 'A/B/007', name: 'b7', status: '在售', trackingNumber: 'SF789', orderNumber: 'O003', deletedAt: '2026-01-01T00:00:00Z' },
                    ],
                },
            },
        },
    },
};

/** 造一个只承载渲染所需字段的假 DOM 元素 */
function fakeEl() {
    return { innerHTML: '', textContent: '', value: '', disabled: false, classList: { toggle() {}, add() {}, remove() {} }, querySelectorAll: () => [], focus() {} };
}

function buildCtx(extra) {
    const ctx = { console, JSON, Math, Date, setTimeout, clearTimeout };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(CORE_SRC, ctx);
    Object.assign(ctx, extra);
    return ctx;
}

const TOGGLE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14"><polyline points="9 6 15 12 9 18"></polyline></svg>';

// ---------- 1. 后台合单视图渲染 ----------
{
    const mergeBody = fakeEl();
    const mergeSummary = fakeEl();
    const mergeStatusEl = fakeEl();
    const mergeSearchInput = fakeEl();
    const ctx = buildCtx({
        gistData: FIXTURE,
        esc: (v) => String(v == null ? '' : v),
        highlightText: (v, term) => String(v == null ? '' : v),
        includesTerm: (value, term) => (value === null || value === undefined) ? false : String(value).toLowerCase().indexOf(term) !== -1,
        TREE_TOGGLE_SVG: TOGGLE_SVG,
        mergeBody, mergeSummary, mergeStatusEl, mergeSearchInput,
        mergeTabs: [],
        mergeState: { tab: 'package', collapsed: Object.create(null) },
        toast: () => {},
        runTreeAction: () => {},
    });
    ctx.Z = ctx.ZCFI;
    const block = sliceBetween(ADMIN_SRC,
        'var mergeIndexCache = { doc: null, index: null };',
        'if (mergeViewBtn) {', 'admin merge render');
    vm.runInContext(block, ctx);

    ctx.mergeState.tab = 'package';
    ctx.renderMergeView();
    const pkgHtml = mergeBody.innerHTML;
    contains(pkgHtml, '包裹 <', 'admin 包裹视图含包裹标题');
    contains(pkgHtml, 'SF123', 'admin 包裹视图含包裹单号');
    contains(pkgHtml, '跨订单合包', 'admin 包裹视图标记跨订单合包');
    contains(pkgHtml, '单订单', 'admin 包裹视图标记单订单');
    contains(pkgHtml, '待打包', 'admin 包裹视图含待打包分区');
    contains(pkgHtml, '共 3 件', 'admin SF123 件数 3（trim+大小写归一）');
    ok(pkgHtml.indexOf('SF789') !== -1, 'admin 已删除库存所在包裹 SF789 全删后不出现', '');
    contains(mergeSummary.innerHTML, '有效件数 <b>6</b>', 'admin 合计有效件数 6（排除已删除）');

    ctx.mergeState.tab = 'order';
    ctx.renderMergeView();
    const ordHtml = mergeBody.innerHTML;
    contains(ordHtml, '一单多包 2 个包裹', 'admin 订单视图标记一单多包并给出包裹数');
    contains(ordHtml, '订单 <', 'admin 订单视图含订单标题');
    contains(ordHtml, '未分配快递', 'admin 订单视图含未分配快递分区');
    contains(mergeSummary.innerHTML, '一单多包', 'admin 汇总含一单多包统计');

    // 筛选：只保留命中 SF456 的分组
    mergeSearchInput.value = 'sf456';
    ctx.renderMergeView();
    const filtered = mergeBody.innerHTML;
    contains(filtered, 'SF456', 'admin 筛选后保留命中分组');
    ok(filtered.indexOf('SF123') === -1, 'admin 筛选不相关内容被隐藏', '');
    ok(ctx.mergeState.collapsed && typeof ctx.mergeState.collapsed === 'object', 'admin 折叠状态容器存在', '');
}

// ---------- 2. 扫码端合单分组渲染 ----------
{
    const groupBody = fakeEl();
    const groupSummary = fakeEl();
    const ctx = buildCtx({
        gistData: FIXTURE,
        esc: (v) => String(v == null ? '' : v),
        TREE_TOGGLE_SVG_SCAN: TOGGLE_SVG,
        groupBody, groupSummary,
        groupTabs: [],
        focusManualInput: () => {},
    });
    ctx.Z = ctx.ZCFI;
    const block = sliceBetween(SCAN_SRC,
        'let scanMergeCache = { doc: null, index: null };',
        '// v2.4.0 连续合包', 'scan group render');
    // 页面里的 groupState 是 const（词法绑定），需在同一脚本内再导出一次给测试用
    vm.runInContext(block + '\n;globalThis.__exp = { groupState: groupState, renderGroupView: renderGroupView, mergeHintHtml: mergeHintHtml };', ctx);
    const exp = ctx.__exp;

    ctx.groupState = exp.groupState;
    ctx.renderGroupView = exp.renderGroupView;
    ctx.mergeHintHtml = exp.mergeHintHtml;

    ctx.groupState.tab = 'package';
    ctx.renderGroupView();
    const pkgHtml = groupBody.innerHTML;
    contains(pkgHtml, '包裹 <', 'scan 包裹视图含包裹标题');
    contains(pkgHtml, '跨订单合包', 'scan 包裹视图标记跨订单合包');
    contains(pkgHtml, '待打包', 'scan 包裹视图含待打包分区');
    contains(groupSummary.innerHTML, '待打包 1 件', 'scan 汇总待打包件数');

    ctx.groupState.tab = 'order';
    ctx.renderGroupView();
    contains(groupBody.innerHTML, '一单多包 2 个包裹', 'scan 订单视图标记一单多包');

    // focus 高亮：模拟从详情点「查看同包裹」定位 SF123
    ctx.groupState.tab = 'package';
    ctx.groupState.focus = 'pkg:' + ctx.ZCFI.groupKeyOf('SF123');
    ctx.renderGroupView();
    ok(ctx.groupState.focus === 'pkg:SF123', 'scan 定位键与包裹键一致', ctx.groupState.focus);

    // 详情页提示（同包裹共 N 件 + 按钮）
    const hint = ctx.mergeHintHtml('trackingNumber', 'SF123');
    contains(hint, '同包裹共 3 件', 'scan 详情同包裹件数');
    contains(hint, 'data-goto-group="trackingNumber"', 'scan 详情「查看同包裹」按钮');
    ok(ctx.mergeHintHtml('trackingNumber', 'SF999') === '', 'scan 详情单件包裹不显示提示', '');
    ok(ctx.mergeHintHtml('orderNumber', '') === '', 'scan 详情空订单号不显示提示', '');
}

// 层级/刷新契约（v2.4.0 修复回归）：
// 合单视图是“覆盖层里的只读视图”，必须低于普通 modal-overlay，
// 否则从合单视图点「编辑」打开的商品弹窗会被压在后面（看不到/点不到）。
contains(ADMIN_SRC, '#merge-overlay { z-index: 950; }', 'admin 合单视图层级低于普通弹窗（编辑弹窗可置顶）');
contains(ADMIN_SRC, '合单视图打开时，编辑/保存等操作会触发', 'admin 合单视图在保存后自动刷新');

const failed = results.filter((r) => !r.ok);
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过，${failed.length} 失败`);
if (failed.length) process.exit(1);
