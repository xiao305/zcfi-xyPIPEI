# 变更记录（CHANGELOG）

本项目的页面/数据层均随 GitHub Pages 发布，版本按「核心（js/core.js）+ 功能轮次」记录。
日期格式：`YYYY-MM-DD`。

## [2.3.12] - 2026-11-17

顶栏品牌位置与条码长编码标定。页面版本 **R5 · v2.3.12**（core v2.3.0 不变）。

### 顶栏品牌

- 品牌从「按钮上方单独一列」改为与 **h1「商品管理」同一水平线、内容区最右侧**（品牌与 h1 中线差实测 0.2px、右缘距内容区 0px）；操作按钮另起一行右对齐；
- 结构：`.top-bar > .top-main(h1/sub/summary + brand) + .actions`；移除 `.top-right` 与残留 `.title-row`；≤768px 自动换行不溢出；
- 品牌保持 v2.3.11：可点击跳转 zcfi.cn、hover 不变色/无下划线、focus-visible 轮廓、16px/13px 样式冻结。

### 条码 1..60 字符密集标定

- 用户实测 `MM/CHIIKAWA/FS/YUCI48`（21 字符）仍错位：旧 `BARCODE_WIDTH_ANCHORS` 只有 4/18/29/48 四档，21 字符落到 18 档（W=39），实际墨迹 45.03mm → 溢出对象框 → 真机重锚位错位。
- 用真实 C-Lodop PREVIEW + PrintWindow 抓取 + 像素量测，对 6 种条码高度（8.5/9.5/12/13/14/17）× 长度 1..35 逐 1、36..60 逐 2 共 **648 格**标定（Round A/B/C/D），0 溢出；
- `BARCODE_WIDTH_ANCHORS` 改为 `{高度:{paperWidth,cap,w[0..60]}}`，运行时按 `String(code).length` 精确查表（未实测奇数档取相邻较大值，>60 饱和到纸宽-4），W clamp [8, paperWidth-4]、`left=(paperWidth-W)/2`；
- 21 字符：h14/h12/h13/h17 → W=46、ink=45.03、左1.59/右3.38、Δ1.79；h9.5 → W=31/ink29.4；40mm 纸 h8.5 → W=35/ink34.44；
- 50/60 字符（h14）：W=40/44、ink38.68/42.91、Δ2.14/1.89，均不溢出；40mm 纸建议编码 ≤30 字符（更长折行压缩、可读性下降）。

### 验证

- 三页内联脚本 `node --check` 全过（3 页 / 9077 行）；
- `local_dev/_fix-ui/smoke.mjs`：**91/91**（原 84 项无回归；新增顶栏同行最右、密集表 6 高度×61 档、21 字符 h14=46 / h8.5=35、50mm 21 字符 W≥45.03、40mm W≤36、60 字符 W≤46、7 模板几何自检）；
- `fix-smoke` 34/34；标定数据 `local_dev/_artifacts/v2312/final-table.csv`、`report.md`。

## [2.3.11] - 2026-11-16

品牌标识定稿：顶栏最右、恢复跳转、样式冻结。页面版本 **R5 · v2.3.11**（core v2.3.0 不变）。

### 变更

- **后台顶栏品牌位置**：从「商品管理」标题旁移除，移到顶栏**最右侧**（`.top-right`：品牌在上、操作按钮在下、右对齐）；清理 `.title-row` 及其 CSS/移动端规则；≤768px 自动铺满、右对齐、不溢出。
- **恢复点击跳转**：三页所有品牌 logo 恢复为 `<a href="https://zcfi.cn/" target="_blank" rel="noopener noreferrer">`（admin 3 处 / scan 2 处 / index 1 处），点击新窗口跳转；hover 显式锁定原样式（`color:#4a6fa5; text-decoration:none`），不变蓝/不下划线；仅键盘 `:focus-visible` 保留绿色 outline。
- **品牌样式冻结（防系统字体缩放）**：`.brand-line` 固定字体栈（PingFang SC / Microsoft YaHei 等）、`font-size:16px/line-height:20px`、`white-space:nowrap`、`-webkit-text-size-adjust:100% !important; text-size-adjust:100% !important`；logo（16px/700/0.2px）、出品（13px/500/6px）、竖线（1px/1.6em/opacity .25）关键属性全部 px + `!important`；三页 `html,body` 增加 text-size-adjust 兜底。
- 三页版本同步 v2.3.11（admin `R5 · v2.3.11` / scan `R3 · v2.3.11` / index `v2.3.11`）。

### 验证

- 三页内联脚本 `node --check` 全过（3 页 / 9062 行）；
- `local_dev/_fix-ui/smoke.mjs`：**84/84**（原 79 项无回归；新增：三页 logo 均为 `a` 且 href/target/rel 正确、admin 无 `.title-row`、品牌位于 `.top-right` 且右对齐（内容区 1px）、hover 前后 computed color/text-decoration 一致、样式冻结（16/20/13px、nowrap、text-size-adjust 声明）、焦点轮廓、版本号）；
- `fix-smoke` 34/34。

## [2.3.10] - 2026-11-15

「zcfi.cn | 出品」品牌标识优化。页面版本 **R5 · v2.3.10**（core v2.3.0 不变）。

### 变更

- **整体放大**：logo 13px → **16px**、「出品」12px → **13px**（letter-spacing 6px 保留）、竖线 1.5em → **1.6em**、间距 10px → **12px**；页脚/顶栏/登录页统一规格。
- **去交互**：移除 hover/focus 变蓝 + 下划线与 `text-decoration` 规则；品牌由 `<a>` 改为非交互 `<span>`（无 cursor:pointer、悬停无任何变化），保留容器 aria-label。
- **顶栏**：admin 顶栏 `<h1>📦 商品管理</h1>` → `商品管理`（去掉 📦），h1 旁加入品牌组合（`.title-row` flex 居中，窄屏自动换行）。
- **登录页**：admin 与 scan 的 `.login-box` 底部（`#login-error` 之后）加入同款品牌，居中、`margin-top:14px`。
- 三页版本同步 v2.3.10（admin `R5 · v2.3.10` / scan `R3 · v2.3.10` / index `v2.3.10`）。

### 验证

- 三页内联脚本 `node --check` 全过（3 页 / 9062 行）；
- `local_dev/_fix-ui/smoke.mjs`：**79/79**（新增：三页 logo 16px/出品 13px/竖线 1.6em/gap 12px、无 `brand-logo:hover` 规则、`.brand-line a` 数量 0、顶栏 h1 无 📦 + `.brand-line` 存在、admin/scan 登录页品牌存在、版本号）；
- `fix-smoke` 34/34。

## [2.3.9] - 2026-11-15

节点树展开动画、全站 favicon 与页脚品牌组合。页面版本 **R5 · v2.3.9**（core v2.3.0 不变）。

### 节点树展开/收起动画

- `.tree-node .children` 改为 CSS grid 高度动画：收起 `grid-template-rows:0fr; opacity:0; visibility:hidden`，展开 `1fr; opacity:1; visibility:visible`；
  过渡 `grid-template-rows .25s cubic-bezier(.4,0,.2,1), opacity .2s ease, visibility .25s`；
- 两个 children 块（子类 / 库存表）均包 `.children-inner`（overflow:hidden; min-height:0）避免动画中截断；动画结束完整显示；
- 收起后内部内容不可聚焦；覆盖单节点/子类/库存表/两者、展开全部、折叠全部、搜索自动展开、连续快速点击；
- `@media (prefers-reduced-motion: reduce)` 下关闭 children/chevron/name/toggle 动画。

### 全站 favicon

- 新增仓库根 `favicon.svg`（来源 https://zcfi.cn/favicon/favicon.svg，自托管）；三页统一
  `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`（admin/scan 替换原 data: 图标，index 新增）。

### 页脚品牌（Qwen 变体 1 · 竖线分隔）

- 三页页脚加入「zcfi.cn | 出品」：logo（#4a6fa5，点号 #4fc3a1）+ 1px 竖线（opacity .25）+ 「出品」（letter-spacing 6px，#94a3b8）；
- admin/scan 版本行上方、index 版本行前，间距 7-8px；hover/focus-visible 轻微反馈；
- 版本号同步：admin `R5 · v2.3.9`、scan `R3 · v2.3.9`、index `v2.3.9`。

### 验证

- 三页内联脚本 `node --check` 全部通过（3 页 / 9062 行）；
- `local_dev/_fix-ui/smoke.mjs`：**72/72**（新增：动画 grid/transition、收起不可聚焦、展开全部/折叠全部、搜索自动展开、快速点击、reduced-motion、移动端；三页 favicon 200 + svg、品牌竖线 1px/opacity .25、出品 letter-spacing 6px、版本号）；
- `fix-smoke` 34/34。

## [2.3.8] - 2026-11-14

节点树展开图标与交互精修（大厂品质感）。页面版本 **R5 · v2.3.8**（core v2.3.0 / scan R3 不变）。

### 图标与动画

- 实心「▼」文本改为**内联 SVG chevron-right**（14×14、stroke=currentColor、round caps）；收起指向右、展开时 `transform: rotate(90deg)` 指向下；
- SVG 加 `transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)`，展开/收起平滑旋转；toggle 容器 20×20 inline-flex 居中（移动端 44×44）。

### 交互反馈

- 整行 `cursor:pointer` + `hover` 背景 `#f8fafc`（移除旧白底/左边框/阴影）；
- **点击标题区**（名称/编码/状态/统计/空白）即可展开收起，按钮/⋮/表单控件/复选框除外；`[data-action]` 先分发避免重复 toggle；
- toggle/名称 `:active { transform: scale(0.94) }` 轻微按压反馈（transition .12s）；
- 点击「编辑」「⋮」不会误切换展开；双击库存行编辑逻辑不变。

### 层级与对齐

- 层级引导线改为 **1px solid `#e2e8f0`**，去掉虚线/2px；每级固定 **24px** 缩进（margin-left 12 + padding-left 12），展开时 children 块首尾相接、连线连续；
- `.node-content` 桌面端 flex + align-items:center + nowrap（≤768px 恢复 wrap）；图标/名称/编码/状态/统计/操作按钮中线差实测 0px。

### 信息层级

- 节点统计文字（`node-summary`）降为辅助信息：`#94a3b8` / 11px；数字高亮保留但整体更浅（在售 #059669 / 待售 #d97706 / 售出 #94a3b8），名称与状态仍是第一层级。

### 验证

- `local_dev/_fix-ui/smoke.mjs`：45/45 通过（SVG/90° 旋转矩阵/0.2s 过渡/点击 name 与统计区切换/编辑与 ⋮ 不切换/hover 背景/引导线 1px #e2e8f0/24px 缩进/中线差 0px/summary 颜色字号/无 pageerror）；
- `fix-smoke` 34/34；内联脚本 `node --check` 2/2。

### 工程约定

- 本项目所有本地产物统一放在项目内 `local_dev/`（截图 `local_dev/_artifacts/screenshots/`），不写公共目录。

## [2.3.7] - 2026-11-14

管理后台界面降噪与渐进式披露重构。页面版本 **R5 · v2.3.7**（core v2.3.0 / scan R3 不变）。

### 视觉降噪

- 移除节点行「类目/单件」徽章、📋 订单号徽章，以及聚合状态为「无库存」时的状态标签；
- 树/表格内所有实心彩色按钮改为 **text-button**（透明底灰字，hover 才浅底+下划线，删除类 hover 变红），图标按钮带 aria-label；
- 状态标签统一为轻量浅底+文字（11px / 1px 8px / 圆角 6px：待售浅琥珀、在售浅绿、售出浅灰），不再是大色块。

### 渐进式披露

- 节点行只保留「编辑」「打印标签」，其余（添加子类/添加库存、复制节点、打印全部库存、删除）收进 **⋮ 菜单**；
- 库存行只保留「编辑」「打印标签」，其余（复制、复制编码、删除）收进 ⋮ 菜单；
- 菜单为 body 级 fixed 浮层（按按钮定位、上下翻转），同一时间只开一个；点菜单项/点外部/Esc/滚动/缩放/重新渲染均关闭；支持 role=menu/menuitem、方向键/Home/End/Esc 与焦点还原；菜单项复用原 data-action 语义。

### 数据呈现

- 节点行 5 个汇总胶囊合并为一段灰色紧凑文本：`子类:1 库存:3（在售2, 待售1）`；状态项仅 >0 显示，数字轻微着色（无背景块）；全 0 显示 `子类:0 库存:0`；title 保留完整明细。

### 样式与批量操作

- 节点/库存操作列 `min-width:150px` + `white-space:nowrap`，按钮不再折行；td/th padding 压到 8px 10px，保持横向滚动与 390px/44px 触控兼容；
- 顶部「跨节点批量改状态/批量打印」默认隐藏（opacity/max-height/pointer-events + transition），勾选任意库存后加 `has-selection` 平滑显示并解除 inert，取消后隐藏。

### 验证

- 新增 `local_dev/_fix-ui/smoke.mjs`：35/35 通过（降噪文本/徽章、汇总格式、行内 3 按钮、菜单打开与全部关闭方式、键盘、菜单动作复用、操作列 nowrap、状态标签尺寸、批量条显隐、390px、无 pageerror）；
- 既有 `fix-smoke` 34/34；内联脚本 `node --check` 2/2。

## [2.3.6] - 2026-11-14

修复长编码（如 29 字符）条码错位。页面版本 **R5 · v2.3.6**（core v2.3.0 / scan R3 不变）。

### 根因

- PDF417 墨迹宽度随**编码长度跳档**：实测 50*30 默认（h14）18 字符 ≈38.6mm、29 字符 ≈45mm。
- v2.3.5 按“≤6 / ≤15 / >15”粗分档，29 字符仍用 39mm 对象框 → **墨迹溢出对象框**，真机裁切/重锚定后错位（用户复现：`XICHA/HWD261113/XK` 正常、`XICHA/HWD261113/XK/261113/XY1` 错位）。

### 修复

- 新增 `BARCODE_WIDTH_ANCHORS`（条码高度 → 编码长度锚点 4 / 18 / 29 / 48 字符 → 实测对象宽 W），按 `String(code).length` 取最近锚点；用户形状编码实测标定。
- 运行时 `W` clamp 到 `[8, paperWidth−4]`，`left=(paperWidth−W)/2`，打印与页面内预览同源；几何自检按 4 个长度样本（4/18/29/43 字符）校验 2mm 安全区。
- 29 字符在 50mm 纸 h14/h12/h13 → W=46（墨迹 45.0mm ≤ 46），不再溢出；18 字符维持 W=39（正常）。

### 验证

- 真实 C-Lodop 6.5.6.6：7 套模板 × 用户两条编码（18/29 字符）共 14 组合；11 个 |左−右| ≤1.5mm（多数 0.64/1.49），3 个受 PDF417 列数档位量化限制（2.13~2.34mm，已达可达最优），无溢出/裁切。
- 43 字符样本：50mm 纸可居中（W=32/31，墨迹 30.0~30.2mm）；40mm 纸建议用“最后一级编码”。
- 内联 `node --check` 2/2；`fix-smoke` 34/34；templateIndex/设置兼容 14/14；几何自检通过。

## [2.3.5] - 2026-11-14

修复真机打印条码偏右/尺寸异常（此前已发布 v2.3.4：2mm 安全区与对象框居中），并完成条码墨迹居中标定。页面版本 **R5 · v2.3.5**（core v2.3.0 / scan R3 不变）。

### 根因

- v2.3.2~v2.3.3 按“预估墨迹宽”反推 `ADD_PRINT_BARCODE` 的左边界，导致**对象框右边界越过纸张**（如 50mm 纸 left≈5.65 + width 46 = 51.65；40mm 纸 width 42 > 40）。C-Lodop 预览容忍越界，真机驱动会裁切/重锚定，表现为**偏右、尺寸异常**（用户实机反馈）。

### 修复

- **条码几何重做**：删除“预估墨迹宽反推 x”路径；先用真实 C-Lodop 预览做逐档标定（7 套模板 × 短/中/长编码，6 种高度 × W 逐 mm 扫描），得到“条码高度 × 编码长度档 → 实测墨迹宽”表（`BARCODE_BOX_WIDTH_BY_HEIGHT`）。
- 打印与页面内预览统一：`W = resolveBarcodeBoxWidth(...)`，`left = (paperWidth − W) / 2`，即**对象框宽≈墨迹宽且水平居中**；实测 14 个组合左右留白差 **≤1.06mm**（默认模板从 7.87mm 降到 0.64mm）。
- **2mm 打印安全区**：所有文字/条码打印项限制在 `2mm .. paperWidth−2mm`，模板几何自检 + 打印期 clamp（越界 console.warn）。
- 40\*30 两套在 36mm 上限内以“居中优先”选 W=26（墨迹约 26.1mm），40\*30 高度保持 8.5mm 宽扁。
- 自定义文本保持 v2.3.4 行为：2mm 安全区、多行、底边不越过「内部编码」行底线、超长缩 5pt 后截断。

### 验证

- 内联脚本 `node --check` 2/2；`fix-smoke` 34/34；templateIndex/设置兼容 14/14；模板几何自检通过；
- 真实 C-Lodop 6.5.6.6 + HPRT N31BT 逐模板截图：7 套 × 短/长编码共 14 组合全部 |左−右| ≤1.06mm；对象框全部在 2mm 安全区。

## [2.3.3] - 2026-11-14

标签功能增强：50*40 入库模板、40*30 条码宽扁化、自定义文本区。页面版本 **R5 · v2.3.3**（core v2.3.0 / scan R3 不变）。

### 新增

- **50\*40 入库模板**（第 7 套）：`50*40 入库 编码+名称+大条码`（50×40mm，内部编码 + 名称 10pt + 大 PDF417，不含订单号/快递单号）；条码 y=19.5/h13、宽 46mm 居中，上下留白均衡。
- **自定义文本区（仅“仅内部编码”模式）**：`printSettings.customText`（≤24 字符，超长截断提示）+ `customTextSize`（5/6/7/8pt，默认 6）。labelOnly 时编码行 **左「内部编码」左对齐 + 右自定义文本右对齐**同排垂直居中；右边界留 1.5mm 安全边距，超宽先降到 5pt 再截断加省略号；last/full 模式不显示。预览/打印/卡片三处一致。

### 修复/优化

- **40\*30 全系条码宽扁化**：`40*30 编码+订单号` 与 `40*30 入库` 的 PDF417 对象改为 42×8.5mm（y16.5，底部 5mm）。真实 C-Lodop 实测：短编码墨迹 38.9×8.3mm（宽高比 4.67）、长编码 30.2×8.3mm（3.62），居中偏差 ≤0.43mm；旧版同数据为 26×16mm、比例 1.6。
- 自定义文本不再压边：右侧实测留白 2.13mm（6pt 日期 / 8pt 门店名），8pt 超长文本自动 5pt + 省略号（右侧留白 4.26mm）。

### 验证

- 真实 C-Lodop 6.5.6.6 + HPRT N31BT：40\*30 改前/改后对比、新 50\*40 入库、labelOnly+自定义文本（6pt/8pt/超长）均实打与预览一致；
- 内联脚本 `node --check` 2/2；`fix-smoke` 34/34；templateIndex/设置兼容 14/14 通过。

## [2.3.2] - 2026-11-14

标签功能增强：编码文字可选、模板按入库/出库分类、条码居中、名称字号规范。页面版本 **R5 · v2.3.2**（core v2.3.0 / scan R3 不变）。

### 新增

- **编码文字设置（三选一，设置记忆）**：`printSettings.codeTextMode`
  - `last`（默认）：`内部编码：<最后一级>`；
  - `full`：`内部编码：<完整编码>`（超长自动缩小字号保持单行）；
  - `labelOnly`：只显示「内部编码」四个字，编码值只在条码中。
  对所有模板的编码文字元素生效，预览/打印/卡片缩略图一致。
- **模板按 公共 / 入库 / 出库 分类**（共 6 套）：
  - 公共：50\*30 内部编码（设计不变，入库/出库均可用）；
  - 新增入库模板（不含订单号/快递单号）：`50*30 入库 编码+名称+条码`、`40*30 入库 编码+条码`；
  - 出库：50\*30 编码+名称+快递单号、40\*30 编码+订单号、50\*40 编码+名称+快递单号+大条码。
  打印弹窗顶部「入库 / 出库」切换并记忆；切换分类时自动回退到公共模板；旧 `templateIndex` 0–3 兼容。
- **商品名称规格统一**：所有模板名称 10pt、黑体、居中、单行优先（超宽自动缩小到 6pt 下限），减少一行溢出。
- **条码居中**：页面内预览条码框按纸张居中；真实打印按实测 PDF417 墨迹宽度计算 `ADD_PRINT_BARCODE` 的 x，实测 6 个用例墨迹中心偏差 ≤0.21mm（50mm）/ -0.11mm（40mm）。
- **预览简化**：内置预览不再画假 PDF417 纹理，改为虚线框 + 「条码区域」+ 小字「实际条码由 C-Lodop 生成」；模板卡片缩略图同源。

### 修复（打印）

- 编码文字改用整张纸宽文本框 + 按 LODOP 原生文本宽度系数（粗体约 ×1.15）保守选字号，避免「内部编码：A001/B001/001」折行并与静态行重叠（full 模式实测 9pt 单行、last 模式 15.5pt）。

### 验证

- 真实 C-Lodop 6.5.6.6 + HPRT N31BT 系统预览：公共模板 last/full/labelOnly、入库 50\*30/40\*30、出库 50\*40 共 6 组用例全部文字完整、条码正立居中；
- 内联脚本 `node --check` 2/2；`fix-smoke` 34/34；templateIndex/设置兼容 11/11 通过。

## [2.3.1] - 2026-11-14

修复标签实际打印与页面内预览差异，并新增 50*40 模板。版本：**core v2.3.0 / admin R5 / scan R3**，页面版本 v2.3.1。

### 修复（打印）

- **文字被裁断**：实测 C-Lodop 的 `ADD_PRINT_HTM` 渲染会把动态字号放大（50*30 默认模板的「内部编码: A001」被打成「内部编码：A00」并裁断）。单行字段（内部编码/快递单号/订单号/静态说明）改用 **`ADD_PRINT_TEXT` + `FontSize(pt)`** 原生文本；原生文本顶部对齐，按 `(元素高 − 字号em)/2` 手动垂直居中；只有名称字段保留 HTM（flex 居中、`word-break:break-all`、`line-height:1.15`、`overflow:hidden`）。
- **PDF417 被旋转**：删除 `SET_PRINT_STYLEA(0,"Horient",2)` 与 `Alignment`（Horient=2 会重锚定打印项导致条码竖条化），仅保留 `ShowBarText=0`；条码正立、无文字。
- **字号校准**：改用隐藏 DOM 测量（与打印同 font-family/weight），并把 LODOP 会把半角冒号/空格按全角渲染的差异归一化处理，可用宽 ×0.92 安全系数、下限 6pt、上限取元素高度；50mm 宽下「内部编码：A001」实打 16pt 完整显示。
- **页面内预览与打印同源**：预览改为 mm 坐标 + pt 字号 + `transform:scale` 渲染（单行 SimHei、多行 YaHei/SimHei 字体栈，与打印一致）；条码改为 2D PDF417 风格占位（按实测约 82% 宽/92% 高、左对齐），并保留「示意图」说明。

### 新增

- **50\*40 模板**：`50*40 编码+名称+快递单号+大条码`（内部编码 / 名称 / 快递单号 / 更大 PDF417），模板共 4 套；模板卡片一行 4 张、窄屏自动换行，旧 `templateIndex` 0–2 兼容（默认仍为第 1 套）。

### 验证

- 真实 C-Lodop 6.5.6.6 + HPRT N31BT 系统预览逐模板比对：50*30 默认与 50*40 均完整显示、PDF417 正立、位置/字号与页面内预览一致（code 宽度实测 38.5mm vs 预览 39.6mm，偏差 2.8%）。
- 内联脚本 `node --check` 2/2；`fix-smoke` 34/34 无 pageerror；`templateIndex` 兼容 7/7。

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
