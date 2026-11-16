# 发布检查清单

适用对象：维护者。每次把页面改动发布到 GitHub Pages 前，按本清单执行。
当前基线：**`core v2.3.0` + `admin R5` + `scan R3`**（站点版本号 **v2.3.11**，文档更新日期 2026-11-16）。

> ⚠️ 未经用户明确授权，**不要 push 到 GitHub、不要动 `main`、不要删除远端标签**。
> 发布由用户确认后按第 6 节流程执行；tag 与 commit 在授权后推送。

---

## 0. 发布前信息

| 项 | 填 |
| --- | --- |
| 发布版本 | `v2.2.0`（core 2.2.0 / admin R4 / scan R3） |
| 计划 tag | 例：`backup-r4` / `backup-v2.2.0` |
| 基线 commit | `git rev-parse --short HEAD` |
| 变更文件 | `git status --short` |
| 测试执行人/时间 | |
| 用户是否授权发布 | 是 / 否 |

---

## 1. 备份现场

**在仓库根目录执行**：

```powershell
git status --short
git log --oneline -8
git tag --list
```

- [ ] 确认没有未提交的意外改动（特别是不属于本轮的文件）：目标改动只应包含 `index.html`、`tools/`、`README.md`、`CHANGELOG.md`、`docs/*.md`、`js/core.js`、`js/vendor/`、删除的废弃目录等本轮文件。
- [ ] 把本轮会改的文件复制到 `local_dev/backups/`：

  ```powershell
  Copy-Item admin.html "local_dev\backups\$(Get-Date -Format yyyyMMdd-HHmmss)-rX-before-admin.html"
  Copy-Item scan.html  "local_dev\backups\$(Get-Date -Format yyyyMMdd-HHmmss)-rX-before-scan.html"
  Copy-Item js\core.js "local_dev\backups\$(Get-Date -Format yyyyMMdd-HHmmss)-rX-before-core.js"
  ```

- [ ] 确认 `local_dev/` 在 `.gitignore` 中，不会被提交。
- [ ] 当前数据已在后台「导出备份 JSON」一次（发布前数据安全第一）。

---

## 2. 代码/静态检查

- [ ] `js/core.js` 有语法错误时页面直接不可用：

  ```powershell
  node --check js\core.js
  ```

- [ ] `admin.html` / `scan.html` 提取内联脚本做语法检查（`tools/verify.mjs` 已覆盖一部分）；至少保证浏览器无 `pageerror`。
- [ ] 无真实 Token/Gist 私密内容进入仓库：

  ```powershell
  git grep -n "ghp_" -- .
  git grep -n "github_pat_" -- .
  ```

  仓库中**不应再有**任何示例 Gist ID 或硬编码的默认 Gist ID 常量。
- [ ] 无 `local_dev/`、截图、日志、临时文件被 `git add`。

---

## 3. 自动化校验（仓库门禁）

在**仓库根目录**执行：

```powershell
node tools/verify.mjs
node tools/test-core.mjs
node tools/test-lodop-loader.mjs
```

`tools/verify.mjs` 做静态/语法/文档一致性校验，包括但不限于：

- `js/core.js` 的 `node --check` 语法检查；
- `index.html` / `tools/scanner-test.html` 的 HTML 结构（标签闭合）检查；
- `index.html` 无内联 `<script>`、无 CDN 引用，CSP/referrer meta 存在；
- `admin.html` / `scan.html` / 站点中无第三方 CDN 引用，扫码库引用本地 `js/vendor/`；
- 登录页/仓库中无示例 Gist ID、无硬编码默认 Gist ID；
- README / ARCHITECTURE / CHANGELOG / RELEASE-CHECKLIST 的版本一致性（站点 v2.3.11 / core v2.3.0 / R5 / R3）；
- 文档中无硬编码的本机绝对路径（旧版本地路径写法）与过期状态表述。

CI：`.github/workflows/ci.yml` 在 push/PR 时自动执行 `node tools/verify.mjs`、`node tools/test-core.mjs`、`node tools/test-lodop-loader.mjs`，并校验 `js/vendor/html5-qrcode.min.js` 的 SHA-256、拒绝跟踪 `local_dev/` 与超过 2 MB 的文件。**CI 不绿不得发布**。

- [ ] `node tools/verify.mjs` 全部通过（退出码 0）。
- [ ] `node tools/test-core.mjs` 与 `node tools/test-lodop-loader.mjs` 全部通过（退出码 0）。
- [ ] `.github/workflows/ci.yml` 在最近一次 push/PR 上为绿。
- [ ] 失败时先修校验/修复代码，**不要带失败发布**（不要为了变绿去删校验项）。

---

## 4. 手工验收（按本轮改动选做）

### 4.1 通用/数据安全

- [ ] admin/scan 都能用 Token + Gist 登录；错误 Token 有 401 中文提示。
- [ ] 登录页 Gist ID **默认为空**，留空不能登录；填写自己的 Gist 后可登录。
- [ ] admin 新增/编辑 node/item，字段正确保存；刷新后仍在。
- [ ] 保存失败（断网/错误 Token）后本地数据未被污染；重试可成功。
- [ ] 两台设备/两个标签页同时改同一字段，出现冲突提示，选择后数据正确。
- [ ] 回收站：删除→隐藏→恢复→可见；彻底删除后编码可复用；父子删除/恢复顺序正确。
- [ ] 导出 JSON → 删除/改乱 → 导入恢复；导入前自动下载 `backup-before-*.json`。
- [ ] 恢复历史版本/快照前，先自动拉远端并下载真实备份；远端有并发修改时有二次确认。
- [ ] 数据体检能显示节点/库存/回收站统计与错误项。
- [ ] 大文件/坏 JSON：只读保护 + 重试入口（可用测试台 fixture 或本地 Gist 小文件模拟）。

### 4.2 admin R2a/R2b/R4

- [ ] 「记住登录」默认不勾选；勾选/取消行为符合说明；退出清理凭据。
- [ ] 搜索/筛选/排序/折叠展开可用；搜索不到已删除项；**中文输入法组合期间不闪烁/不重渲染**。
- [ ] 按大类筛选能看到子类与库存；软删除父节点后汇总不含其子库存。
- [ ] 批量状态/批量打印只作用于选中且未删除的库存。
- [ ] 本地快照按 Gist ID 隔离；换账号/退出后不显示其他 Gist 快照。
- [ ] 节点/库存编辑弹窗字段完整；scan 写入的 remark/tracking/order/qrLinks/status 能看到/改到。
- [ ] 编码自定义规则/全局唯一/改名级联提示正确；复制嵌套节点落在正确父节点下。
- [ ] 确认弹窗防重入、Esc/遮罩/焦点行为正常；a11y（label/for、对比度、可聚焦）。

### 4.3 scan R2/R3

- [ ] 连续模式：开始扫码→命中→详情→关闭→继续扫；`start` 次数不增加、摄像头常开。
- [ ] 同一码 2 秒内重复回调只 1 条历史。
- [ ] 多匹配候选列表显示；黄条提示；点选正确商品。
- [ ] 关联快递/订单/链接；已有值替换提示；标记售出；失败可重试。
- [ ] 冲突弹窗为**逐字段**选择（基准/远端/我的），不会一键整体覆盖。
- [ ] 未找到「继续扫描」、关联成功「继续扫下一件」。
- [ ] 图片识别能调用 scanFile 并进入详情；失败有提示。
- [ ] 手电筒：不支持隐藏、支持可点击；震动/提示音设置生效并持久化。
- [ ] 软删除商品扫不到/提示回收站；历史回看被拦截且显示「已删除」徽章。
- [ ] 历史按日期分组、点击回看、清空 12 秒内撤销。
- [ ] 多标签页：登录/退出/历史同步；退出可同时清本机历史。
- [ ] 错误分类：断网显示离线；401 要求重登；坏数据明确报错且禁止写。
- [ ] 手机横竖屏/安全区/44px 按钮/键盘遮挡（登录、备注）检查。

### 4.4 打印（真机验收必须现场做）

- [ ] C-Lodop 已安装启动，`/admin` 顶部状态「已就绪」。
- [ ] HTTPS 下首次信任 `https://localhost.lodop.net:8443` 证书。
- [ ] 页面从本机服务加载 `CLodopFuncs.js`（仓库无本地快照）；打印机下拉为**当前机器**的真实打印机。
- [ ] 单标签预览/直接打印；批量打印；回收站项被阻止。
- [ ] 份数/模板/字体/纸张在**真实打印机**上验证（现场）。
- [ ] 失败场景：C-Lodop 未启动、证书未信任、无打印机、`On_Return` 返回失败，均有明确提示，不会假成功。
- [ ] 批量打印 strict：复核失效时取消整批并列出被跳过条目。

---

## 5. 文档检查

- [ ] `README.md`：登录、数据模型、日常操作、备份、打印、安全、部署、FAQ 与实际一致。
- [ ] `CHANGELOG.md`：`[2.2.0] - 2026-11-13` 已记录安全/打印/数据层/admin/scan/站点/文档变更，历史条目保留。
- [ ] `docs/USER-GUIDE.md`、`docs/FAQ.md`、`docs/BACKUP-AND-RECOVERY.md`、`docs/ARCHITECTURE.md`、`docs/CONSISTENCY-REVIEW.md`（历史快照 + 当前状态表）已同步。
- [ ] 文档没有真实 Token/Gist 私密数据；**登录页/文档中没有示例 Gist ID**。
- [ ] 文档与代码版本一致：`v2.2.0` / `admin R4` / `scan R3`，日期 2026-11-13。
- [ ] 文档中没有过期状态（例如 R2b/R3 仍在开发、未完成）与硬编码本机绝对路径。

---

## 6. 提交与标签（需用户授权）

> 发布由用户确认后执行；tag 与 commit 在授权后推送。

建议流程（**在仓库根目录执行**）：

```powershell
git status --short
git diff --check
git add index.html tools README.md CHANGELOG.md docs/ js/core.js js/vendor   # 按本轮实际文件
git commit -m "feat: v2.2.0 <本轮简述>"
git tag backup-rX-<模块>
git log --oneline -3
git tag --list
```

- [ ] 只 `add` 本轮预期文件（不要带 `local_dev/`、临时文件）。
- [ ] commit 信息写清版本/轮次（例：`feat: v2.2.0 安全/打印/数据层/站点入口与文档终稿`）。
- [ ] tag 命名与历史一致（`backup-r0`、`backup-r1`、`backup-r1-admin`、`backup-r1-core21`、`backup-r2a`、`backup-r2-scan`、`backup-r2b`、`backup-scan-fix`、`backup-r3`、`backup-docs`、`backup-rX-...`）。
- [ ] **push/tag push 必须等用户明确授权**；推送到 `main` 后 GitHub Pages 自动发布。
- [ ] 发布后核对：
  - `https://xypipei.zcfi.cn/` 为**导航页**（无内联脚本、可跳转 `/admin`、`/scan`）；
  - `https://xypipei.zcfi.cn/admin`、`/scan` 可访问；
  - `CNAME` 仍为 `xypipei.zcfi.cn`；
  - 浏览器强刷后版本/页脚/功能正确；
  - 手机网络（非本地）扫码可用。

### 发布前最后确认（安全项）

- [ ] **登录页无示例 Gist ID / 无硬编码默认 Gist ID**（查看 admin.html、scan.html 源码或 `node tools/verify.mjs`）。
- [ ] **无 CDN 引用**：仓库中不存在第三方脚本 CDN 地址，扫码库为 `js/vendor/html5-qrcode.min.js`。
- [ ] **CSP 存在**：`index.html`、`tools/scanner-test.html` 含 `<meta http-equiv="Content-Security-Policy">`；admin/scan 的 CSP 现状已在文档注明（仍含 `'unsafe-inline'`）。
- [ ] 仓库中没有 `CLodopFuncs.js` 快照；打印脚本运行时从本机加载。
- [ ] **页面加载/登录时不请求本机服务**：打开 `admin.html`（未点打印）后 DevTools Network 中不应出现任何 localhost/127.0.0.1 请求，也不应弹出「访问本地网络/设备」授权。
- [ ] **打印按需连接**：点打印/预览后才请求本机服务（优先 `http://localhost:8000`），允许本地网络后状态变「已就绪」。
- [ ] **编码/类目条码回归**：自定义编码只接受英文+数字；子类只改本级；同级已有 `NN/YO1`、`NN/YO2` 时新增子类默认 `NN/YO3`；类目条码节点无成本/快递/订单且状态为汇总值。
- [ ] **保存体验**：连续两次编辑后弹窗立即关闭、顶部出现保存指示，最终远端数据包含两次修改。
- [ ] **打印排版**：7 套模板（公共/入库/出库，含 50\*40 入库）在 C-Lodop 系统预览中文字完整不截断、PDF417 正立居中；40\*30 条码宽扁；页面内预览与实打位置/字号基本一致。
- [ ] **自定义文本**：编码文字=仅“内部编码”时，自定义文本（5/6/7/8pt）右对齐不裁字、支持多行且底边不越过编码行底线；其他模式不显示。
- [ ] **条码居中（真机）**：7 套模板在真机上条码水平居中（预览左右留白差 ≤1.06mm），且文字/条码均在 2mm 安全区内。
- [ ] **长编码**：用 18 字符与 29 字符（如 `XICHA/HWD261113/XK`、`XICHA/HWD261113/XK/261113/XY1`）各打一张，条码不溢出/不错位；40mm 纸超长编码已提示用“最后一级编码”。
- [ ] **界面降噪**：节点行无「类目/单件/无库存」标签；行内只有「编辑/打印标签」+ ⋮ 菜单；状态标签为浅底小标签；勾选库存后跨节点批量按钮才出现。
- [ ] **节点树交互**：SVG 展开图标随展开旋转 90°；整行 hover 浅灰；点击标题展开收起；1px 引导线/24px 缩进；统计文字为辅助色。
- [ ] **v2.3.9**：节点展开/收起有 0.25s 平滑动画（reduced-motion 下关闭）；三页 favicon 为 `/favicon.svg`；页脚显示「zcfi.cn | 出品」。
- [ ] **v2.3.10**：品牌 logo 16px/出品 13px；无 hover 变蓝/下划线；admin 顶栏（无 📦）与 admin/scan 登录页均显示品牌。
- [ ] **v2.3.11**：后台顶栏品牌位于最右侧；点击 logo 可跳转 zcfi.cn 且 hover 样式不变；手机系统字体调大后品牌字号不变。
- [ ] **编码文字三模式**：最后一级 / 完整编码 / 仅“内部编码”在实打与预览中均正确、不裁断。
- [ ] **入库模板**：仅出现在「入库」分组，且不含订单号/快递单号字段。
- [ ] **打印服务就绪**：已装 C-Lodop 的机器上，admin 顶部显示「✅ 打印服务已就绪（N 台打印机）」；未安装时明确提示证书/未启动，不误报。
- [ ] **备份 tag 已推送**：本次发布 tag 已创建并已推送到远端（`git ls-remote --tags origin` 可见），远端有可回滚点。

---

## 7. 发布后

- [ ] 记录发布 commit/tag、时间、验证人。
- [ ] 通知用户新功能/注意事项（尤其打印、Token、Secret Gist 非私有）。
- [ ] 如出现问题，立即按 `docs/BACKUP-AND-RECOVERY.md` 回滚代码/数据，先保数据。
- [ ] 回归发现的问题回流到任务板，不带着问题继续加功能。

---

## 8. 当前已知事项（发布时注意）

- [ ] 真实打印未现场验证前，不要对外承诺打印份数/模板效果。
- [ ] **Secret Gist 不是私有**：宣传/文档不要暗示“Secret 就安全”；敏感数据不入 Gist。
- [ ] admin/scan 仍是内联脚本，CSP 含 `'unsafe-inline'`；严格 CSP 属后续项，不要宣称已严格化。
- [ ] 打印脚本协议规则：HTTPS 页面只允许 `https://localhost.lodop.net:8443`，**禁止**回退 `http://localhost:8000`（会触发混合内容）；CSP 也**不应**加入 `'unsafe-eval'`（C-Lodop 字符串定时器已由页面垫片处理）。
- [ ] 后台列表字段可见性（P2-4）仍有提升空间，属后续体验项。
- [ ] `local_dev/` 是本地目录，**不得**作为发布门禁；门禁以 `node tools/verify.mjs` + CI 为准。
- [ ] `.github/workflows/ci.yml` 与 `tools/verify.mjs` 的校验项如调整，必须在本清单与 README 同步更新。
