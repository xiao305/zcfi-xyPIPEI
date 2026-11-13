# admin / scan 一致性只读审查（R2 阶段历史审查快照）

> **状态说明**：本文是 **R2 阶段的历史审查快照（基线 `9dc7bcf`，审查日期 2026-10-21）**，只代表当时代码的状态与建议。
> R2b/R3/R4 与 v2.2.0 已修复其中大部分问题；最新修复状态见下方「当前状态（v2.2.0）」，**不要**把正文中的“未修/建议”当作当前代码现状。
> 历史行号均基于当时基线（`admin.html` = `6922a6e`、`scan.html` = `9dc7bcf`、`js/core.js` = `72ecb74`），后续版本行号已变化。

---

## 当前状态（v2.2.0，2026-11-13）

| 编号 | 原问题 | 状态 | 修复版本 / 提交 |
| --- | --- | --- | --- |
| P1-1 | admin 支持 sessionStorage、scan 只读写 localStorage；退出清理不一致 | ✅ 已修复 | `09afad0`（scan 统一 local/session 凭据与退出清理）；v2.2.0 进一步下沉为 `ZCFI.credentials.read/write/clear/clearToken`，两端共用 |
| P2-1 | 打印导出函数缺少回收站守卫（仅事件层有） | ✅ 已修复 | `63c9ca8`（admin R3：打印守卫 + 打印前远端复核）；v2.2.0 R4 延续 |
| P2-2 | 扫码历史仍渲染已删除商品记录 | ✅ 已修复 | `09afad0`（历史置灰 + 灰色「已删除」徽章，点击拦截） |
| P2-3 | 编码大小写比较策略不一致 | ✅ 已修复（数据入口） | `63c9ca8`（R3 导入/体检：大小写重复为 errors、非大写为 warning）；历史脏数据仍需自行规范化 |
| P2-4 | scan 写入字段在后台列表/树中要打开弹窗才能看全 | ⚠️ 部分解决 | R2b 增加节点/库存行汇总与更多列（订单号/快递/备注摘要/链接数），但完整字段仍需编辑弹窗；后续体验项 |
| P3-1 | 未知状态颜色不一致 + 残留旧状态 CSS | ✅ 已修复 | `63c9ca8`（未知状态样式统一、旧 CSS 清理） |
| P3-2 | 打印预览打开后不重新校验数据 | ✅ 已修复 | `63c9ca8`（R3 打印前重新读远端并按编码复核；v2.2.0 改本机 C-Lodop 实时打印机） |
| P3-3 | 默认 Gist ID 在两端硬编码 | ✅ 已修复 | v2.2.0：移除硬编码默认 Gist ID 与登录框默认值，登录页 Gist ID 默认空 |
| 待确认-1 | 软删除编码是否继续占用 | ✅ 已定 | 保持占用：软删除期间编码不可复用，彻底删除后释放（README/用户手册已写明） |
| 待确认-2 | scan 登录策略 | ✅ 已定 | local/session 双模式 + 「记住登录」开关，**默认不勾选**；v2.2.0 统一凭据工具 |
| 待确认-3 | 历史中的已删除记录隐藏还是标记 | ✅ 已定 | 保留 + 置灰 + 「已删除」徽章 + 点击拦截 |
| 待确认-4 | 后台列表字段可见性 | ⏳ 后续项 | 见 P2-4；需要与表格/响应式一起设计列宽 |
| 待确认-5 | 打印导出函数是否作为公开 API | ✅ 已定 | 保留函数但加 `deletedAt` 守卫，并在打印前统一复核 |

> 结论：P1 与 P2/P3 的**代码一致性缺陷**在 R2b/R3/R4 与 v2.2.0 中已处理；仍留待改进的是展示效率（P2-4）与更长期的结构性项（严格 CSP、字段可见性）。

---

## 一、结论摘要（R2 快照）

- 审查日期：2026-10-21
- 审查范围：`admin.html`、`scan.html`、`js/core.js`（只读；未修改任何页面代码）
- 审查基线：
  - 仓库 HEAD：`9dc7bcf`（scan R2）
  - `admin.html`：HEAD 中 `6922a6e` 的版本（R2a）
  - `scan.html`：`9dc7bcf`（R2）
  - `js/core.js`：`72ecb74`（v2.1.0）
- 历史背景：当时 **admin R2b 正在工作区并行开发**（筛选/排序/汇总等），本文 admin 行号指 **HEAD 已提交版本**，不是当时未提交工作区；R2b 合并后行号已变化，**请勿按本文行号定位当前代码**。
- 本文只报告问题，不修改页面；修复建议供后续任务使用。

| 严重度 | 数量 | 主题 |
| --- | --- | --- |
| P1 | 1 | 凭据在 admin/scan 的 localStorage/sessionStorage 策略不一致，可能自动登录到旧账号/旧 Gist |
| P2 | 4 | 打印导出函数缺少回收站守卫、扫码历史未过滤已删除记录、编码大小写比较策略不一致、scan 写入字段在后台列表不可见 |
| P3 | 3 | 未知状态颜色不一致/残留旧 CSS、打印预览数据不刷新、默认 Gist ID 双处硬编码 |
| 待确认 | 5 | 软删除编码是否应继续占用、session 登录方案、历史是否隐藏已删除、后台字段可见性、打印函数是否作为公开 API |

当时整体判断：**状态词表、软删除主流程、字段写入范围、编码唯一性、打印 UI 入口守卫已经统一**；主要风险集中在「跨页凭据」「打印函数防御层」「历史展示」「编码大小写边缘数据」四处。

---

## 二、P1

### P1-1 凭据存储：admin 支持 sessionStorage，scan 只读写 localStorage；退出清理也不一致

> 当前状态：✅ 已修复（见顶部状态表；`09afad0` + v2.2.0 `ZCFI.credentials`）。以下为 R2 快照原文。

**证据（当时）**

- admin（HEAD `6922a6e`）
  - `L1726-1733`：`readCred()` **优先读 sessionStorage**，再读 localStorage。
  - `L1734-1746`：勾选「记住登录」写 localStorage 并清 sessionStorage；不勾选写 sessionStorage 并清 localStorage。
  - `L1752-1758`：`clearCredentials()` 同时清 localStorage、sessionStorage。
  - `L2693`：登录成功调用 `saveCredentials(..., remember)`。
  - `L4322-4332`：自动登录用 `readCred()`（session 优先）。
- scan（HEAD `9dc7bcf`）
  - `L881`：`STORAGE_KEYS = { github_token, gist_id, gist_filename }`（与 admin 同名）。
  - `L1658-1660`：登录成功 **只用 `Z.storage`（localStorage）** 保存。
  - `L1702-1704`：退出 **只删除 localStorage**，没有删除 sessionStorage。
  - `L3033-3036`：自动登录 **只读 localStorage**，没有 sessionStorage 兜底。
  - 全文件无 `sessionStorage` 引用。

**用户影响（当时可复现场景）**

1. 用户在 admin 取消「记住登录」→ 凭据只在 sessionStorage；打开 scan 不会自动登录，必须重新输入 Token（体验不一致）。
2. 用户在 admin 取消记住（sessionStorage 为旧 Token/旧 Gist），随后在 scan 登录新 Token（写 localStorage，未清 sessionStorage）；再打开 admin 时 `readCred` 优先 sessionStorage → 自动用**旧 Token/旧 Gist**，可能在错误数据集上操作。
3. 用户在 scan 退出 → 只清 localStorage；sessionStorage 仍有凭据，admin 仍会自动登录，退出语义不彻底（共用设备有隐私风险）。

**当时的建议**

- 在 `js/core.js` 增加统一凭据工具（如 `ZCFI.credentials.read/write/clear`，支持 remember 参数），admin/scan 共用；或至少在 scan：
  - 自动登录时 `sessionStorage` 兜底读取；
  - 登录时若写 localStorage，同时清理同名 sessionStorage（或反向保持一致）；
  - 退出时同时清 localStorage + sessionStorage。
- 统一产品策略：scan 是否也提供「记住登录」开关，还是明确「scan 永远本次会话」。确定后写进 README/FAQ。
- 回归用例：admin 取消记住 → scan 自动登录；scan 登录新 Gist → admin 不出现旧 Gist；scan 退出 → admin 不再自动登录。

---

## 三、P2

### P2-1 打印「导出函数」没有回收站守卫，只有事件委托层守卫

> 当前状态：✅ 已修复（`63c9ca8`，admin R3 打印守卫 + 打印前复核）。

**证据（当时）**

- 事件委托层有守卫：
  - admin HEAD `L3012-3015`：`print-node` 检查 `!printNode || Z.isDeleted(printNode)`。
  - admin HEAD `L3020-3024`：`print-item` 检查父节点/库存 `isDeleted`。
  - 批量打印 `L3658-3678`：重新查父节点/库存并过滤已删除。
- 但导出的打印函数本身没有守卫：
  - `L4280-4292`：`window.printNodeLabel = function(code)` 只判断 `!node`，**未判断 `Z.isDeleted(node)`**。
  - `L4294-4308`：`window.printItemLabel` 只判断 `!parent` / `!item`，**未判断父节点/库存 deletedAt**。
- `openPrintPreview` 本身也不校验（`L4109-4171`）。

**影响**

- 正常 UI 路径已守住；但 `window.printNodeLabel/printItemLabel` 是公开全局函数，旧入口、控制台调用、后续新增调用或 R3 打印改造若直接调用，就可能把回收站商品/已删库存打印出来（业务上等于“复活”旧标签）。属于防御层缺口。

**当时的建议**

- 在 `window.printNodeLabel` / `window.printItemLabel` 内部同样加 `Z.isDeleted` 判断并 toast；
- 或在 `openPrintPreview` 入口统一过滤/拒绝已删除项；
- 加一条回归：直接调用导出函数传入已删除 code，断言不打开预览。
- 可与 R3 打印 v2 一起做。

---

### P2-2 扫码历史仍会渲染已删除商品的记录（只在点击时拦截）

> 当前状态：✅ 已修复（`09afad0`：历史置灰 + 「已删除」徽章 + 点击拦截）。

**证据（当时）**

- scan HEAD `L1502-1533` `renderHistory()`：遍历历史，不检查 `item.ref` 对应商品是否已删除，直接渲染记录条目。
- scan HEAD `L1538-1568` `openHistoryEntry()`：点击时才 `Z.findNodeByCode` / `findItem` 并判断 `Z.isDeleted`，删除则 toast「该商品已删除，请到后台回收站恢复」。
- 匹配/详情/关联侧的软删除过滤是完整的（`L1914-1931`、`L1957-2045`、关联入口 `L2508-2510`/`L2686-2688`）。

**影响**

- 历史列表仍出现已删除商品记录：用户点击后才知道不能回看；从“历史是否过滤 deletedAt”角度是**部分覆盖**。
- 历史是本地审计流水，保留记录本身有合理性；问题是没有视觉标识。

**当时的建议**

- 渲染时对 `ref` 已删除/不存在的记录加「已删除」灰色标签或置灰，点击仍提示；
- 或在列表渲染时直接过滤掉已删除记录（但会丢失审计痕迹，需产品确认）；
- 建议采用「保留 + 标记」：史实可追溯，同时明确不可回看。

---

### P2-3 编码比较大小写策略不一致：admin 冲突检测精确匹配 vs core/scan 忽略大小写

> 当前状态：✅ 已修复（数据入口）：`63c9ca8` 起导入/体检把大小写重复作为 errors、非大写提示 warning。

**证据（当时）**

- core：`sameCode()`（`js/core.js` `L103-107`）会 `normalizeCode().toLowerCase()`，即忽略大小写与空白。
- admin：
  - `CODE_RE`（HEAD `L1538-1542`）只允许大写格式（UI 新建/自定义编码受限）。
  - `collectAllCodes()`（`L1846-1855`）用原始 key 建集合。
  - `findCodeCollision()`（`L1887-1891`）用 `set[code]` **精确、区分大小写**。
  - 部分相等判断用 `Z.sameCode`（如 `L3314`、`L3333`、`L3467`、`L3490`），但冲突检测仍是精确集合。
- scan：`findProductMatches()`（`L1974-1981`）用 `Z.sameCode` 对 `code/orderNumber/trackingNumber` 做忽略大小写匹配；`sameUrl` 亦忽略大小写。

**影响（边缘数据）**

- 如果历史/导入的 JSON 中存在 `A001` 与 `a001`（`validateDocDeep` 只按精确 key 查重，不强制编码格式），admin 的冲突检测不会认为冲突；scan 的 `sameCode` 会把两者都当成匹配 → 可能多匹配/歧义。
- UI 正常新建不会产生这种数据，但导入旧 Gist/手工编辑 JSON 可能引入。

**当时的建议**

- 在 `validateDocDeep` 或导入流程增加「编码格式/大小写规范」检查（warning/error），例如统一大写；
- 或把 `collectAllCodes` / `findCodeCollision` 改为大小写归一后的键；
- scan 侧可继续 `sameCode`，但数据入口应保证规范；文档明确「编码建议统一大写、不要手工导入大小写混用数据」。

---

### P2-4 scan 写入的字段在 admin 列表/树中只能部分看到（需打开编辑弹窗）

> 当前状态：⚠️ 部分解决（R2b 增加汇总/列）；完整字段仍需打开编辑弹窗查看，属后续体验项。

**证据（当时）**

- scan 写入范围：
  - 备注：`scan.html` `L2290`（只提交 `remark`）。
  - 关联：`L2523-2538`（`trackingNumber` / `orderNumber` / `qrLinks` / `status`）。
- admin 可编辑全部相关字段：
  - 节点弹窗：`L3254-3261`（name/unified/cost/tracking/order/qrLinks/remark/status）。
  - 库存弹窗：`L3425-3433`（name/cost/tracking/order/qrLinks/remark/status）。
- 但列表/树展示有限：
  - 节点行只显示 orderNumber（`L2925-2933`；无 tracking、remark、qrLinks）。
  - 库存表显示 tracking/order/status（`L2901-2913`；无 remark、qrLinks）。
  - 备注/链接数/完整快递需要打开编辑弹窗。

**影响**

- 扫码端关联的快递单号（节点级）、备注、链接，在后台树/表不能一眼看到；容易重复关联或误以为未关联。
- 不是数据不一致（可编辑、可保存），属于展示/操作效率缺口。

**当时的建议**

- 节点行增加快递/链接数/备注摘要 badge（与订单号 badge 类似，超出省略 + tooltip）；
- 库存表增加「备注/链接数」列或行展开详情；
- 或在树上方增加“详情面板”，选中节点/库存后展示完整字段。
- 需与 R2b 的表格/响应式改版一起设计，避免列过多。

---

## 四、P3

### P3-1 未知状态颜色不一致 + 残留旧状态 CSS

> 当前状态：✅ 已修复（`63c9ca8` 未知状态样式统一、旧 CSS 清理）。

**证据（当时）**

- admin（HEAD）：
  - `L373-375` 仍保留旧 class：`.status-badge.待售/.在售/.售出`（当前 JS 用 `Z.statusClass()` 生成 `status-pending/...`，这些旧规则已无引用）。
  - `L732-735` 新增 `.status-badge.status-unknown` 为**红色**（`#fee2e2/#991b1b`）。
- scan：
  - `L266`：`.status-unknown` 为**灰色**（`#e2e8f0/#475569`）。

**影响**

- 同一未知/历史状态在后台显示红色（像错误），在扫码端显示灰色（中性），语义不一致；旧 CSS 是无用代码。
- 不影响功能。

**当时的建议**

- 统一未知状态视觉（建议中性灰 + “历史值”标识）；
- 删除 admin 旧 `.status-badge.待售` 等规则；R2b 修改 CSS 时顺带清理。

### P3-2 打印预览打开后不重新校验数据，打印前可能打出过期/已删除数据

> 当前状态：✅ 已修复（`63c9ca8` R3 打印前重新读远端并按编码复核）。

**证据（当时）**

- admin HEAD `L4109-4171` `openPrintPreview(dataList)` 把传入的 `dataList` 快照保存到 `window.currentPrintDataList`。
- `L4243-4264` `executePrint()` 直接使用该快照，调用 `buildLodopPrintData` + `LODOP.PRINT()`，**打印前没有重新查 Gist/检查 deletedAt**。
- 若预览打开期间另一台设备删除/修改了商品，预览和打印仍是旧数据。

**影响**

- 概率低（预览到打印时间通常很短），但可能打出已删除/已改名旧标签；库存/编码类错误一旦打印出去较难收回。

**当时的建议**

- 点「直接打印/预览」前按 code 重新从 `gistData` 解析并校验 `Z.isDeleted`；
- 或打开预览时记录 revision，打印前比对 `syncMeta`/远端；R3 打印 v2 适合处理。

### P3-3 默认 Gist ID 在两端硬编码，修改时容易只改一处

> 当前状态：✅ 已修复（v2.2.0 移除硬编码默认 Gist ID 与登录框默认值，登录页 Gist ID 默认空，必须填写自己的）。

**证据（当时）**

- admin HEAD `L1509` 硬编码作者示例 Gist ID；`L4328` 自动登录 fallback 使用。
- scan `L642` 登录框 `value` 带作者示例 Gist ID（HTML 默认值）；`L1660` 左右保存时使用用户输入。
- README 已注明这是默认示例、可改。

**影响（当时）**

- 该默认值是作者真实 Gist ID 且硬编码在公开页面，任何访问者都能读取（严重数据暴露问题，v2.2.0 已移除）。
- 维护者若更换默认 Gist，需要同时改两处，否则新用户默认值不一致；属于配置一致性/可维护性问题。

**当时的建议**

- 抽到 `js/config.js` 或 `js/core.js` 的默认配置（配置项走统一常量），两端引用；
- 或明确“登录框默认值只是示例，不承诺可用”，并保持两端一致。

---

## 五、已核对且一致/无问题的部分（R2 快照）

| 检查项 | 结论 | 关键证据 |
| --- | --- | --- |
| 状态词表统一 | ✅ 以 core 为准，admin 编辑下拉兼容历史值，scan 只读展示也走 core | core `normalizeStatus/statusClass`（`L59-75`）；admin `fillStatusSelect`（HEAD `L1685-1702`）、`normalizeDoc`（`L1705-1715`）；scan `statusBadgeHtml`（`L1070-1074`） |
| scan 写状态 | ✅ 写「售出」，不写「已售」 | scan `L2534-2537` 使用 `Z.STATUS.SOLD` |
| 已售兼容展示 | ✅ 历史「已售」读入后显示「售出」 | core `STATUS_ALIASES`；admin `normalizeDoc`；scan normalize |
| deletedAt：admin 树/搜索/筛选 | ✅ 已删除节点及子树不渲染；搜索只匹配未删除项 | admin HEAD `L2850-2872`、`L2942-2960`、`L2976-2993` |
| deletedAt：admin 统计 | ✅ 有效/含回收站分开统计 | `L1767-1782`、`L2114-2127` |
| deletedAt：admin 编辑/删除/批量 | ✅ 入口均检查回收站 | `L3240-3241`、`L3396-3397`、`L3415-3416`、`L3573-3630`、`L3691-3713` |
| deletedAt：admin 打印 UI | ✅ 节点/库存/批量打印入口均过滤 | `L3012-3024`、`L3658-3678` |
| deletedAt：admin 回收站 | ✅ 节点删除隐藏整棵子树；恢复子项要求父节点先恢复；彻底删除级联 | `L2382-2421`、`L2500-2531`、`L2536-2583` |
| deletedAt：scan 匹配/明细/关联 | ✅ 祖先删除→整棵子树过滤，命中删除项提示回收站 | scan `L1911-1931`、`L1957-2045`、`L1540-1560` |
| deletedAt：scan 历史点击 | ✅ 点击回看前检查删除状态 | scan `L1538-1568` |
| deletedAt：导出/导入/历史版本 | ✅ 有意保留已删除项（属于备份/恢复数据，不应当过滤） | admin HEAD `L2108-2210`（导出/导入）、`L2250-2334`（历史版本恢复） |
| 字段语义/写入范围 | ✅ scan 只写 remark/tracking/order/qrLinks/status；admin 全部可见可编辑（弹窗） | scan `L2290`、`L2523-2538`；admin HEAD `L3254-3261`、`L3425-3433` |
| 编码唯一性 | ✅ admin 全局唯一校验、改名级联、导入 errors 阻止重复；scan 只做匹配 | admin `L1845-1891`、`L3309-3322`、`L3464-3470`；core `validateDocDeep` |
| 编码层级 | ✅ `A001` / `A001/B001` / `A001/B001/001` 规则与生成器一致 | admin `L2778-2823`、`CODE_RE L1538-1542`；scan 匹配编码 |
| 存储键名 | ✅ 凭据键同名；本地快照/历史/设置各自独立无冲突 | admin HEAD `L1508`、`L1532`；scan `L881-884` |
| 登录错误提示 | ✅ 两端都用 `Z.friendlyError` | admin `L2701`；scan `L1674` 附近 |
| 两页数据层 | ✅ 全部走 core 严格读 + 合并保存，无整库直接写 | core `get/save`；admin `saveWithOps`；scan `saveEntityFields` |
| XSS | ✅ 两端渲染均走 `esc`/textContent（本次审查未发现新增直插） | admin 冲突/树/打印 `esc`；scan 历史/详情/候选 `esc` |
| 打印 UI 入口 | ✅ 正常用户路径已拦截回收站项 | 见上「deletedAt：admin 打印 UI」 |

---

## 六、待确认（当时需要产品/Lead 决定，v2.2.0 结论见顶部状态表）

1. **软删除编码是否继续占用？**
   当时 `collectAllCodes()` 包含回收站条目，软删除期间编码不可复用，彻底删除后才释放。**结论**：保持占用，并已在 README/用户手册写明。

2. **scan 的登录策略**
   统一成「永远 localStorage」还是「支持 sessionStorage + 记住登录开关」？**结论**：双模式 + 默认不记住，v2.2.0 统一由 `ZCFI.credentials` 管理。

3. **扫码历史中的已删除记录**
   隐藏 vs 保留并标记「已删除」？**结论**：保留 + 置灰 + 徽章 + 点击拦截（`09afad0`）。

4. **后台列表字段可见性**
   节点 tracking/remark/qrLinks、库存 remark/qrLinks 是否需要上列表？**结论**：部分改善（R2b 汇总/列），完整字段仍需弹窗；后续项。

5. **打印导出函数是否作为公开 API**
   若 `window.printNodeLabel/printItemLabel` 仅供内部，建议不再挂 window 或加守卫。**结论**：保留函数但加 `deletedAt` 守卫，并在打印前统一复核（`63c9ca8`）。

---

## 七、审查方法与限制（历史）

- 方法：只读阅读 + grep 定位（read 工具，UTF-8）；未修改 `admin.html`、`scan.html`、`js/core.js`。
- 本次只审查代码一致性，**未在真实设备/真实 Gist 上执行**；当时 R2 回归测试台覆盖了另一部分行为（scan 14/14）。
- admin R2b 当时在工作区开发、未提交；本文 admin 行号基于 HEAD `6922a6e`，与后续版本不同。**R2b 合并后已按新文件复核并修复 P2-4/P3-1 等项。**
- 未覆盖：真实打印（CLodop/打印机）、真机摄像头、超 1MB Gist、GitHub API 限流下的极端并发。相关文档已标注现场验证。

---

## 八、建议修复顺序（历史，已按 v2.2.0 执行）

1. **P1-1 凭据统一**（两端 + 文档 + 回归；最影响日常）→ `09afad0` + v2.2.0 `ZCFI.credentials`。
2. **P2-1 打印函数守卫**（并入 R3）→ `63c9ca8`。
3. **P3-1 状态样式清理 / P3-3 默认 Gist 常量** → `63c9ca8` / v2.2.0。
4. **P2-2 历史标记** + **P2-4 字段可见性** → `09afad0` / 部分后续。
5. **P2-3 编码大小写**（数据入口校验）→ `63c9ca8`。
6. **P3-2 打印前复核**（R3 打印 v2）→ `63c9ca8`。

> 当前仍存在的项：P2-4 字段可见性（体验）、严格 CSP 需外置脚本（结构性）。修复后请同步更新本文顶部「当前状态」表与 README。
