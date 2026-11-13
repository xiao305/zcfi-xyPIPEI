# 变更记录（CHANGELOG）

本项目的页面/数据层均随 GitHub Pages 发布，版本按「核心（js/core.js）+ 功能轮次」记录。
日期格式：`YYYY-MM-DD`。

## [2.3.0] - 2026-11-13

用户体验与数据语义优化。版本：**core v2.3.0 / admin R5 / scan R3**。

### 编码

- **自定义编码支持英文 + 数字混搭，禁止中文**：本级编码段只允许 `[A-Za-z0-9]`，不允许中文/空格/特殊符号；不合规会明确提示。
- **子类/库存只能自定义本级段**：父编码前缀由系统固定展示（只读），例如父 `NN` 下只填 `YO3`，完整编码为 `NN/YO3`。
- **自动编码跟随同级格式**：新增 `inferNextCode()`，同级已有 `NN/YO1`、`NN/YO2` 时新子类默认 `NN/YO3`；`A001/A002` → `A003`；无同级时回退旧默认（`A001` / `B001` / `001`）。

### 类目条码（原“统一条码”）

- 字段语义不变（`unified`），但界面文案改为**类目条码 / 单件条码**。
- 开启类目条码：不记录成本/快递单号/订单号（保存时清除），状态改由类目下商品自动汇总（`全部在售/部分在售/全部售出/部分售出/全部待售/部分待售/无库存`），并加入 `ZCFI.aggregateItemStatus()`。
- 扫码端命中类目条码时展示聚合状态与“类目条码”标识，不再展示成本/单号。

### 保存体验

- 改为**乐观更新 + 后台保存 + 排队合并**：保存后界面立即生效、弹窗立即关闭；连续修改合并为一批写入；顶部显示保存状态；失败回滚并提示，冲突仍走逐字段冲突框。
- 核心新增导出 `ZCFI.applyOps`（供页面在本地乐观应用 ops）。

### 打印

- 修复“刚进后台未检测 → 点打印先提示未连接打印机/已禁用，但实际可用”：改为弹窗打开后先连接，连接完成再判定并启用按钮。
- 实体打印机优先：扩展虚拟打印机识别（PDF/WPS/XPS/OneNote/各种 PDF 虚拟驱动等），默认选实体打印机。

### 验证

- `tools/test-core.mjs` 增加 `aggregateItemStatus` 与 `applyOps` 测试（51 项）；
- admin 内联脚本 `node --check`；Edge 无头冒烟覆盖编码/类目/保存/打印场景。

## [2.2.2] - 2026-11-13

修复「打开/登录后台时浏览器弹出本地网络授权、地址栏变为不安全、打印仍连不上」的问题。页面版本：admin `R4 · v2.2.2` / scan `R3 · v2.2.2`；core 仍为 v2.2.0。

### 修复

- **页面加载/登录时不再请求本机服务**：此前页面加载 1.2s 后会在后台探测 C-Lodop，任何 localhost 请求都会触发浏览器「访问本地网络/其他应用和服务」授权提示；现在只在用户点「打印/系统预览」或显式检测时才加载。
- **确认本机 C-Lodop 8443 证书已过期**（实测 `ERR_CERT_DATE_INVALID`）：这是「8443 地址看似可访问、页面却提示未连接/证书问题」的直接原因。加载顺序改为 **`http://localhost:8000` 优先**（localhost 是浏览器认可的可信来源，HTTPS 页面加载它不构成混合内容），失败再试 `https://localhost.lodop.net:8443`。
- **打印弹窗按需连接**：打开打印弹窗时显示「正在连接本机 C-Lodop…（首次请在浏览器提示中允许本地网络访问）」，连上后自动刷新打印机列表；失败时给出可操作提示（启动 C-Lodop / 允许本地网络 / 升级 C-Lodop 以更新证书）。
- 状态栏初始文案改为「未检测（点打印时自动连接）」，不再在打开页面时误显示未连接。

### 验证

- `tools/test-lodop-loader.mjs` 增加「加载时不自动请求」与「http 优先」断言；
- 端到端（本机真实 C-Lodop）：页面加载阶段零 localhost 请求；模拟点打印后只请求 `http://localhost:8000`、无证书错误、状态「已就绪（5 台打印机）」。

## [2.2.1] - 2026-11-13

修复 v2.2.0 上线后发现的打印服务连接问题。页面版本：admin `R4 · v2.2.1` / scan `R3 · v2.2.1`；core 仍为 v2.2.0。

### 修复

- **C-Lodop 就绪判定错误**：本机服务脚本只定义 `getCLodop()` / `window.CLODOP`，不定义 `getLodop()`；旧实现只查 `getLodop`/`window.CLodop`，所以服务明明可用仍显示「打印服务未连接」。现兼容 `getCLodop()`、`window.CLODOP`、`window.LODOP`，并补 `getLodop()` 别名。
- **HTTPS 页面出现混合内容（地址栏变「不安全」）**：旧实现就绪判定失败后会回退加载 `http://localhost:8000/CLodopFuncs.js`。HTTPS 页面加载 http 脚本属于混合内容，浏览器会标记地址栏不安全。现改为：**HTTPS 页面只加载 `https://localhost.lodop.net:8443`，绝不尝试 http**；HTTP 页面（本机调试）才先试 8000、失败再试 HTTPS。
- **就绪判定改为真实连接**：要求 C-Lodop 的 WebSocket 已连接（`SocketOpened` / `readyState === 1`）且能取到打印机数量；异步连上后通过 `On_CLodop_Opened` 与 `zcfi:lodop-ready` 事件刷新状态和打印机列表。
- **CSP 与 C-Lodop 兼容**：放行 `ws://127.0.0.1:8000`（本机 8000 服务硬编码该地址）及预览所需的本机图片/表单目标；C-Lodop 内部字符串定时器（`setTimeout("...")`）改用定向垫片转函数调用，**不放开 `'unsafe-eval'`**。
- **错误提示更准确**：区分「脚本加载失败（未安装/未启动/证书未信任）」与「脚本已加载但服务连接未建立」，并给出信任证书步骤。

### 验证

- 新增 22 项 loader 单元测试（HTTPS 只请求 https、失败不回退 http、Socket 判定、getCLodop 兼容、旧实现回归）；
- 新增 9 项端到端测试（HTTPS 页面零 `http://localhost:8000` 请求、连接真实本机 C-Lodop 显示「已就绪（5 台打印机）」、HTTP 页面从 8000 连接成功、无 CSP 违规）。

## [2.2.0] - 2026-11-13

统一版本号：**core v2.2.0 / admin R4 / scan R3**，文档更新日期 **2026-11-13**。

### 安全

- **移除硬编码默认 Gist ID**：删除硬编码的默认 Gist ID 常量与两端登录框的默认值，登录页 Gist ID 默认空，必须填写自己的；退出登录/重新登录不再回填公开示例值。
- **扫码库本地化**：`html5-qrcode` 从第三方 CDN 改为自托管 `js/vendor/html5-qrcode.min.js`（锁 2.3.8），站点不再依赖任何外部 CDN。
- **CSP / Referrer-Policy**：`index.html`、`tools/scanner-test.html` 增加 `<meta http-equiv="Content-Security-Policy">` 与 `no-referrer`；根路径改为无内联脚本的导航页。
- **Secret Gist 文案修正**：README / FAQ / 架构说明明确「Secret Gist 不是私有，链接即权限」，补充敏感数据提示、专用账号与 Token 轮换建议、信任边界清单。
- **打印脚本不入库**：`CLodopFuncs.js` 不再提交仓库，改为运行时从本机 C-Lodop 加载，避免把作者本机打印机快照与第三方脚本快照带进公开站点。

### 打印

- 打印/预览返回 `null` / `undefined` / `false` 一律判定为失败并明确报错，不再静默“假成功”。
- 注册 `LODOP.On_Return` 回调，打印结果以状态栏为准；未连接/失败时给出具体提示。
- 打印机列表与索引改为取**本机 C-Lodop 实时列表**，移除作者本机 5 台打印机的静态快照。
- 批量打印实现 `strict` **全有或全无**：复核时存在失效条目则取消整批并列出被跳过项。
- 打印字段为 `null` 时按空串处理（不再抛异常或打出字符串 `"null"`）；预览加 try/catch。

### 数据层（core v2.2.0）

- 修复 `findNodeEntry` 的 `parentCode` 恒为 `null`：复制嵌套节点、子节点自定义编码校验、回收站祖先守卫恢复正确。
- 所有 GitHub 请求使用 `cache: 'no-store'`；GET + apply + PATCH **整体重试**（不再只重试 PATCH），读 body 也受超时约束。
- 403/404 细分：限流 → `RATE_LIMIT`（带 `retryAfter` 与重置提示）、无权限 → `PERMISSION`、文件不存在 → `FILE_MISSING`，文案并列多种可能。
- 根级新增 `schemaVersion`（当前 = `1`），保存/恢复时补写；根级未知字段保留，仅替换 `products`。
- 新增统一凭据工具 `ZCFI.credentials`（`read` / `write` / `clearToken` / `clear`），admin/scan 共用，消除两份实现。
- 新增 `ZCFI.sizeBytes`（`TextEncoder` 真实字节数）与 `ZCFI.deepEqual`（键序无关比较）；`save` 的 `unchanged` 判定不再受 JSON 键序影响。
- `doc.replace` 前先 `GET` 远端并导出真实远端备份（`backup-before-*.json`）；远端与基准不一致时二次确认，避免恢复覆盖其他设备的并发修改。
- `save` 新增 `createOnly` 语义：两端并发新建同码不再静默覆盖。
- 严格读取保持：`EMPTY` / `PARSE` / `SCHEMA` / `TRUNCATED` 一律抛错，`raw_url` 回退失败明确报错，绝不用残缺数据覆盖远端。
- 错误码中文映射补 `SAVE_FAILED` / `BAD_OP` 等。

### 管理后台（admin R4）

- 修复按大类筛选把子类与全部库存隐藏的问题（筛选只隐藏非该大类子树）。
- 修复软删除父节点后顶部/节点汇总仍统计其子库存的问题。
- 本地快照按 `gistId` 隔离，退出登录清理非当前 Gist 快照，列表显示归属。
- 恢复历史版本 / 恢复快照 / 导入前：先从远端拉取最新数据并下载 `backup-before-*.json`。
- 中文输入法组合期间（`isComposing`）不触发全量重渲染，`compositionend` 后再搜索。
- 确认弹窗防重入、执行中不可重复确认；Esc/遮罩关闭与焦点处理；登录与表单 a11y（label/for、对比度）改进。
- 退出与刷新竞态防护；登录 Enter 防并发；打印入口守卫与未知状态样式一致性修复。

### 扫码端（scan R3）

- 数据刷新错误分类：仅 `NETWORK` / `RATE_LIMIT` / `SERVER` 进入离线模式；`AUTH` 强制重新登录；`PARSE`/`SCHEMA`/`TRUNCATED` 明确报错并禁止写入。
- 多标签页：监听 `storage` 同步登录态/退出广播，扫码历史按记录合并写入，不再整键覆盖或误删另一标签的凭据。
- 冲突提示改为**逐字段**选择（展示基准/远端/我的值），不再一键整体覆盖；默认不静默采用本地值。
- 历史按 `gistId` 隔离；退出登录可同时清理本机历史；清空历史的撤销备份在窗口结束/成功后删除。
- “启动中”可取消并有超时；硬件扫码枪焦点与按键缓冲改进；`pagehide`/卸载兜底释放摄像头。

### 站点与文档

- 站点根路径 `index.html` 改为**轻量导航页**：无内联脚本、无 CDN，提供「进入管理后台 /admin」「手机扫码 /scan」两个入口与安全提示。
- 原根路径扫码测试页迁移为 `tools/scanner-test.html`（调试用）：引用本地 `../js/vendor/html5-qrcode.min.js`，加 `noindex` 与 CSP，viewport 允许缩放。
- 删除废弃的 `web-scanner-lib/` 示例目录（其 README 描述的 `src/` 从未存在、示例 CDN 路径失效且含不安全 innerHTML）。
- README / CHANGELOG / docs 全量同步到 v2.2.0；修正旧文档中硬编码的本机绝对路径、`normalizeCode` 描述、标签清单、`validateDocDeep` 等低项。
- 新增 `tools/verify.mjs`（静态/语法/文档一致性校验）与 `.github/workflows/ci.yml`（CI 自动执行），发布门禁不再依赖被忽略的本地测试目录。
- 修正原 R2b/R3 的过期状态标注与“完成后更新 CHANGELOG”类未完成项；补记此前缺失的 R2b / R3 / scan 一致性 / 截断修复条目。

### 历史轮次补记（此前未单独更新 CHANGELOG）

- **R2b（admin，`65b8713`）**：搜索防抖/高亮、节点与库存排序、汇总、复制、添加 N 件、跨节点批量、视图持久化、390px 响应式、渲染性能。
- **R3（admin 打印 v2，`63c9ca8`）**：3 套模板、打印指令顺序与份数、失败反馈、设置记忆、整节点/跨节点批量打印、打印前远端复核、编码大小写检查、未知状态样式。
- **scan 一致性修复（`09afad0`）**：记住登录统一 local/session 凭据、退出清理两处、历史记录标记已删除并拦截。
- **core 截断修复（`a82ea00`）**：Gist 文件被截断且 `raw_url` 回退失败时明确报 `TRUNCATED`，避免把残缺内容当数据。
- **文档终稿（`69116c2`）**：同步 R2b/R3 打印与 scan 一致性修复说明。

### 本轮提交与标签

- 版本基线：`69116c2`（本 CHANGELOG 之前的文档终稿提交）之上的 v2.2.0 变更。
- 备份标签：按发布流程在仓库根目录创建并推送（参见 [发布检查清单](docs/RELEASE-CHECKLIST.md) 与 [备份与恢复](docs/BACKUP-AND-RECOVERY.md)）。

---

## [2.1.0] - 2026-10-21

### 核心 `js/core.js` v2.1.0

- 新增 Gist 历史版本读取 `ZCFI.history()` 与指定版本读取 `ZCFI.getAtRevision()`。
- 保存引擎新增 `doc.replace` 操作，支持整库恢复（仍走「先 GET 远端、再 PATCH」流程）。
- 新增 `ZCFI.validateDocDeep()` 深度数据体检（节点/库存/重复编码/重复单号/字段类型/回收站统计）。
- 新增软删除约定 `ZCFI.isDeleted(entity)`（`deletedAt` 标记）。
- 版本号从 2.0.0 升到 2.1.0。

### 管理后台 R2a

- 数据菜单：导出备份 JSON、导入 JSON、数据体检、Gist 历史版本恢复、本地快照恢复、回收站。
- 回收站：软删除（节点/库存）、恢复、彻底删除；删除父节点会隐藏整棵子树；恢复子项需先恢复父节点。
- 编码规范：自动生成 `A001` / `A001/B001` / `A001/B001/001`；可选自定义编码；节点与库存编码全局唯一校验；改名级联。
- 记住登录：勾选存 `localStorage`，不勾选存 `sessionStorage`；退出时清理两处。
- 删除二次确认：显示影响数量并要求输入编码确认；数据菜单写入前自动本地快照（最多 3 份）。
- 严格加载/只读保护、字段级冲突弹窗、全量 XSS 转义延续 R1。

### 扫码端 R2

- 连续扫码：摄像头常开，详情改底部抽屉；关闭详情/未找到「继续扫描」/关联成功「继续扫下一件」不再重启摄像头，只暂停/恢复解码。
- 页面隐藏（visibilitychange）暂停摄像头，恢复可见时重启；连续模式开关默认开、本机持久化。
- 多匹配：同一订单号/快递号命中多个商品时弹候选列表（类型/名称/编码/匹配字段/状态/快递号），点选进入详情。
- 扫码增强：成功震动、WebAudio 提示音（均可在设置关闭并持久化）、手电筒能力检测（不支持隐藏）、取景框四角动画。
- 相册识别：选择图片后用 `Html5Qrcode.scanFile` 识别，结果走同一扫码流程。
- 数据新鲜度：本地立即匹配 + 30s TTL 后台刷新 + 页面可见刷新 + 手动刷新；顶部「更新于 HH:mm」；断网显示离线缓存提示。
- 软删除过滤：匹配/历史回看/关联都过滤 `deletedAt`，命中已删除商品提示到后台回收站恢复。
- UI：header 收为标题+更多菜单、全可点元素 ≥44px、safe-area、允许缩放、历史按日期分组/可点击回看/清空可撤销、成本显隐状态保持、登录键盘遮挡修复、页脚版本与数据说明。

### 本轮提交与标签

- 核心：`72ecb74 chore(core): 版本号 2.1.0`（前置 `759bdb7 feat(core): 历史版本/整库恢复/深度体检/软删除`）
- 后台 R2a：`6922a6e feat(admin R2a): 数据菜单/回收站/编码规范/记住登录`
- 扫码 R2：`9dc7bcf feat(scan R2): 连续扫码/多匹配/手电筒震动提示音/相册识别/离线刷新/移动端UI`
- 备份标签：`backup-r1-core21`、`backup-r2a`、`backup-r2-scan`
- 详见 `docs/BACKUP-AND-RECOVERY.md`。

---

## [2.0.0] - 2026-10-21

### 核心 `js/core.js` v2.0.0

- 严格 Gist 读取：文件缺失/JSON 损坏/内容截断/结构异常一律报错，绝不静默返回空数据。
- 并发安全保存 `ZCFI.save()`：写前重新 GET 远端 → 在远端副本上应用 ops → 字段级三方合并 → 冲突交给页面 → 串行化 → 网络/5xx 重试。
- 工具：`escapeHtml`、`normalizeStatus/statusClass`、`normalizeCode/sameCode`、文档查询、`clone`、`toast`、`storage`、`downloadJson`。
- 错误码与中文提示 `friendlyError()`；页面改为严格读取 + 只读保护。

### 管理后台 R1

- 接入 core：节点/库存保存改为 ops + 三方合并；修复编辑父节点导致 `children` 被清空的数据丢失 bug。
- 状态统一（已售→售出）、严格加载只读错误态、字段级冲突弹窗、全量 XSS 转义、保存提示/快捷键。
- 删除统计与输入编码二次确认。

### 扫码端 R1

- 接入 core：备注/关联保存改为 ops + 回滚；失败不清空本地状态。
- 全量 XSS 转义；摄像头状态机/扫码锁/2 秒去重；历史记录 localStorage 持久化；状态词统一。

---

## 早期原型（未编号）

- 初始静态页面：admin 商品树 + 标签打印（CLodop），scan 扫码查询。
- admin 已实现「智能冲突检测」雏形（`mergeAndSave`），但仍存在整库覆盖风险；后续由 R1 的 `js/core.js` 取代。

---

## 版本与提交标签

| 版本 | 内容 | 标签 |
| --- | --- | --- |
| 2.2.0 + R4 + R3 | 核心 2.2、后台 R4、扫码 R3、站点导航页与文档终稿 | 发布流程中创建并推送（见发布检查清单） |
| 2.1.0 + R2a + R2b/R2 | 核心 2.1、后台 R2a、扫码 R2 | `backup-r1-core21`、`backup-r2a`、`backup-r2-scan`、`backup-r2b`、`backup-scan-fix`、`backup-r3` |
| 2.0.0 + R1 | 核心 2.0、后台 R1、扫码 R1 | `backup-r1`、`backup-r1-admin` |
| 初始基线 | 原始代码 | `backup-r0` |

> 回滚步骤见 [备份与恢复](docs/BACKUP-AND-RECOVERY.md)；发布检查见 [发布检查清单](docs/RELEASE-CHECKLIST.md)。
