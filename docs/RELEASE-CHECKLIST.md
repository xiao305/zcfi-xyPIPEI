# 发布检查清单

适用对象：维护者。每次把页面改动发布到 GitHub Pages 前，按本清单执行。
当前基线：`core v2.1.0` + `admin R2a` + `scan R2`；R2b（admin 体验）与 R3（打印 v2）仍在开发。

> ⚠️ 未经用户明确授权，**不要 push 到 GitHub、不要动 `main`、不要删除远端标签**。
> 本仓库当前为本地 `overhaul` 分支开发；发布由用户确认后单独操作。

---

## 0. 发布前信息

| 项 | 填 |
| --- | --- |
| 发布版本/轮次 | 例：R2 scan / R2a admin / R2b admin / R3 |
| 计划 tag | 例：`backup-r2b-admin` |
| 基线 commit | `git rev-parse --short HEAD` |
| 变更文件 | `git status --short` |
| 测试执行人/时间 | |
| 用户是否授权发布 | 是 / 否 |

---

## 1. 备份现场

```powershell
cd "E:\脚本存放\自动扫码系统"
git status --short
git log --oneline -8
git tag --list
```

- [ ] 确认没有未提交的意外改动（特别是不属于本轮的文件）。
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

- [ ] `admin.html` / `scan.html` 提取内联脚本做 `node --check`（测试台/harness 已覆盖一部分；至少保证浏览器无 `pageerror`）。
- [ ] 无真实 Token/Gist 私密内容进入仓库：

  ```powershell
  git grep -n "ghp_" -- .
  git grep -n "github_pat_" -- .
  ```

  已知登录框有默认 Gist ID（`f13d97...`），可保留但 README 已注明为默认示例/可改。
- [ ] 无 `local_dev/`、截图、日志、临时文件被 `git add`。

---

## 3. 自动化回归

在项目根目录：

```powershell
cd "E:\脚本存放\自动扫码系统"

# 1) 页面可加载 + 截图（admin / scan，移动端）
node local_dev\harness.mjs --page scan --mobile --out local_dev\shots\release-scan-mobile.png
node local_dev\harness.mjs --page admin --mobile --out local_dev\shots\release-admin-mobile.png
node local_dev\harness.mjs --page admin --out local_dev\shots\release-admin-desktop.png

# 2) 全量回归（14 条 scan + admin 用例）
node local_dev\tests\run-all.mjs --page scan
node local_dev\tests\run-all.mjs --page admin
# 或一次跑全部
node local_dev\tests\run-all.mjs
```

- [ ] harness 输出 `errors: []`，无 pageerror。
- [ ] scan 用例全绿（当前基线 14/14）。
- [ ] admin 用例全绿（当前基线见 `local_dev/tests/report.json`）。
- [ ] 失败时：先看 `local_dev/tests/report.json` 的断言/堆栈，**不要带失败发布**。

---

## 4. 手工验收（按本轮改动选做）

### 4.1 通用/数据安全

- [ ] admin/scan 都能用 Token + Gist 登录；错误 Token 有 401 中文提示。
- [ ] admin 新增/编辑 node/item，字段正确保存；刷新后仍在。
- [ ] 保存失败（断网/错误 Token）后本地数据未被污染；重试可成功。
- [ ] 两台设备/两个标签页同时改同一字段，出现冲突提示，选择后数据正确。
- [ ] 回收站：删除→隐藏→恢复→可见；彻底删除后编码可复用；父子删除/恢复顺序正确。
- [ ] 导出 JSON → 删除/改乱 → 导入恢复；导入前自动下载当前备份。
- [ ] 数据体检能显示节点/库存/回收站统计与错误项。
- [ ] Gist 历史版本可查看/恢复，恢复前自动备份。
- [ ] 大文件/坏 JSON：只读保护 + 重试入口（可用测试台 fixture 或本地 Gist 小文件模拟）。

### 4.2 admin R2a/R2b

- [ ] 「记住登录」勾选/取消行为符合说明；退出清理凭据。
- [ ] 搜索/筛选/排序/折叠展开（R2b 含）可用；搜索不到已删除项。
- [ ] 批量状态/批量打印只作用于选中且未删除的库存。
- [ ] 节点/库存编辑弹窗字段完整；scan 写入的 remark/tracking/order/qrLinks/status 能看到/改到（当前部分字段需打开弹窗）。
- [ ] 编码自定义规则/全局唯一/改名级联提示正确。

### 4.3 scan R2

- [ ] 连续模式：开始扫码→命中→详情→关闭→继续扫；`start` 次数不增加、摄像头常开。
- [ ] 同一码 2 秒内重复回调只 1 条历史。
- [ ] 多匹配候选列表显示；黄条提示；点选正确商品。
- [ ] 关联快递/订单/链接；已有值替换提示；标记售出；失败可重试。
- [ ] 未找到「继续扫描」、关联成功「继续扫下一件」。
- [ ] 图片识别能调用 scanFile 并进入详情；失败有提示。
- [ ] 手电筒：不支持隐藏、支持可点击；震动/提示音设置生效并持久化。
- [ ] 软删除商品扫不到/提示回收站；历史回看被拦截。
- [ ] 历史按日期分组、点击回看、清空 12 秒内撤销。
- [ ] 页面隐藏/恢复：摄像头暂停/重启；断网离线提示但匹配可用。
- [ ] 手机横竖屏/安全区/44px 按钮/键盘遮挡（登录、备注）检查。

### 4.4 打印（R3 前）

- [ ] C-Lodop 已安装启动，`/admin` 顶部状态「已就绪」。
- [ ] HTTPS 下首次信任 `https://localhost.lodop.net:8443` 证书。
- [ ] 单标签预览/直接打印；批量打印；回收站项被阻止。
- [ ] 份数/模板/字体/纸张在**真实打印机**上验证（现场）。
- [ ] 失败场景：C-Lodop 未启动、证书未信任、无打印机，均有提示。

---

## 5. 文档检查

- [ ] `README.md`：登录、数据模型、日常操作、备份、打印、安全、部署、FAQ 与实际一致。
- [ ] `CHANGELOG.md`：本轮版本、日期、提交/标签、未完成 TODO。
- [ ] `docs/USER-GUIDE.md`、`docs/FAQ.md`、`docs/BACKUP-AND-RECOVERY.md`、`docs/ARCHITECTURE.md`、`docs/CONSISTENCY-REVIEW.md` 已同步。
- [ ] 文档没有真实 Token/Gist 私密数据；默认 Gist ID 已注明「示例/可改」。
- [ ] `docs/CONSISTENCY-REVIEW.md` 中 P1/P2 修复状态更新（或标记“本轮未处理”）。

---

## 6. 提交与标签（需用户授权）

> 当前开发约定：本地 `overhaul` 分支，**不 push**，等用户确认。

建议流程：

```powershell
cd "E:\脚本存放\自动扫码系统"
git status --short
git diff --check
git add README.md CHANGELOG.md docs/ admin.html scan.html js/core.js   # 按本轮实际文件
git commit -m "feat: <轮次/模块> <简述>"
git tag backup-rX-<模块>
git log --oneline -3
git tag --list
```

- [ ] 只 `add` 本轮预期文件（不要带 `local_dev/`、临时文件）。
- [ ] commit 信息写清轮次/模块。
- [ ] tag 命名与历史一致（`backup-r0`、`backup-r1`、`backup-r1-admin`、`backup-r1-core21`、`backup-r2a`、`backup-r2-scan`、`backup-rX-...`）。
- [ ] **push/tag push 必须等用户明确授权**；推送到 `main` 后 GitHub Pages 自动发布。
- [ ] 发布后核对：
  - `https://xypipei.zcfi.cn/`、`/admin`、`/scan` 可访问；
  - `CNAME` 仍为 `xypipei.zcfi.cn`；
  - 浏览器强刷后版本/页脚/功能正确；
  - 手机网络（非本地）扫码可用。

---

## 7. 发布后

- [ ] 记录发布 commit/tag、时间、验证人。
- [ ] 通知用户新功能/注意事项（尤其打印、Token）。
- [ ] 如出现问题，立即按 `docs/BACKUP-AND-RECOVERY.md` 回滚代码/数据，先保数据。
- [ ] 回归发现的问题回流到任务板，不带着问题继续加功能。

---

## 8. 当前已知事项（发布时注意）

- [ ] `docs/CONSISTENCY-REVIEW.md` 的 P1（凭据 session/local 不一致）是否要在本轮修复；未修则 README/FAQ 已说明 workaround。
- [ ] P2 打印导出函数守卫、扫码历史删除标记、编码大小写、字段可见性是否纳入 R2b/R3。
- [ ] R2b/R3 TODO 未完成前，README/CHANGELOG 不要宣称已完成。
- [ ] 真实打印未现场验证前，不要对外承诺打印份数/模板效果。
- [ ] `local_dev/tests` 由 QA 维护；实现者不要随手改测试来“变绿”。