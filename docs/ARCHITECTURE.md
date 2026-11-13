# 架构说明

本文面向维护者/开发者，说明页面、数据层和 GitHub Gist 的关系。最终用户请读 [用户手册](USER-GUIDE.md)。

当前基线（2026-11-13 最终）：

- 核心：`js/core.js` **v2.2.0**
- 管理后台：**R4**（R2b `65b8713` + R3 `63c9ca8` + 本轮 R4 修复）
- 扫码端：**R3**（R2 `9dc7bcf` + 一致性修复 `09afad0` + 本轮 R3 修复）
- 站点：GitHub Pages 静态站，自定义域名 `xypipei.zcfi.cn`；根路径为导航页，`/admin`、`/scan` 为功能入口
- 文档与代码同步日期：**2026-11-13**
- 页面版本：**v2.2.2**（admin `R4 · v2.2.2` / scan `R3 · v2.2.2`；v2.2.2：打印服务改为按需连接、`http://localhost:8000` 优先以绕开 8443 过期证书；v2.2.1：C-Lodop 连接判定修复）

---

## 1. 总览

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  手机浏览器 /scan (scan.html) │        │ 电脑浏览器 /admin (admin.html)│
│  - 扫码/相册识别/连续模式      │        │ - 商品树/编辑/批量/回收站     │
│  - 查商品/关联单号/标售出      │        │ - 导出导入/体检/历史/快照     │
│  - 本机历史/设置              │        │ - 标签打印（本机 C-Lodop）    │
└───────────────┬──────────────┘        └───────────────┬──────────────┘
                │                                        │
                └──────────────┬─────────────────────────┘
                               ▼
                    ┌────────────────────┐
                    │   js/core.js       │
                    │  ZCFI.* 共享数据层  │
                    │ 读/存/合并/凭据/转义 │
                    └─────────┬──────────┘
                              │ HTTPS + GitHub Token（仅 Authorization 头）
                              ▼
                    ┌────────────────────┐
                    │  GitHub Gist       │
                    │  data.json         │
                    │  {schemaVersion,   │
                    │   products: ... }  │
                    └────────────────────┘

站点根路径 `/`：index.html 导航页（纯静态、无脚本），只做入口选择与安全提示。
```

外部依赖：

| 依赖 | 用途 | 位置 |
| --- | --- | --- |
| `html5-qrcode` | 摄像头/图片扫码 | **本地** `js/vendor/html5-qrcode.min.js`（自托管，锁 `2.3.8`；来源与 SHA-256 见 `js/vendor/README.md`，CI 校验哈希） |
| `js/core.js` | 共享数据层（读/存/合并/凭据/转义） | 仓库本地，v2.2.0 |
| `CLodopFuncs.js` | 加载本机 C-Lodop 打印服务 | **运行时从本机加载，不入库**。**优先 `http://localhost:8000/CLodopFuncs.js`**（localhost 属可信来源，不构成混合内容；可绕开 8443 可能过期的证书），失败再试 `https://localhost.lodop.net:8443`。**页面加载时不主动连接**，仅点打印/预览时按需加载 |
| GitHub API | Gist 读写/历史 | `api.github.com` |
| Gist raw | 大文件回退读取 | `gist.githubusercontent.com` |

没有后端/数据库；浏览器的 `fetch` 直接访问 GitHub API。**站点不再从任何 CDN 加载脚本。**

---

## 2. 数据模型

根对象（`schemaVersion` 为根级结构版本，当前 = `1`）：

```json
{
  "schemaVersion": 1,
  "products": { "A001": { ... } }
}
```

节点：

```json
{
  "name": "string",
  "unified": true,
  "cost": 1200,
  "trackingNumber": "string?",
  "orderNumber": "string?",
  "remark": "string?",
  "qrLinks": ["https://..."],
  "status": "待售|在售|售出 (历史别名: 已售等)",
  "deletedAt": "ISO 时间?",
  "children": { "A001/B001": { ...节点... } },
  "items": [ { "code": "A001/B001/001", ...库存字段... } ]
}
```

- 节点 key 即节点编码（`A001`、`A001/B001`）。
- 库存 `code` 为完整编码，且必须在父节点 `items` 中。
- 状态词表由 `ZCFI.STATUS` / `normalizeStatus` 统一；`已售`、`已卖出` 等历史别名读入后会归一为 `售出`。
- `deletedAt` 为软删除标记；值存在即视为在回收站。
- 字段级 diff 使用 `NODE_DIFF_FIELDS` / `ITEM_DIFF_FIELDS`（admin.html），包含 `deletedAt`。

### 2.1 `schemaVersion` 与未知根字段

- `schemaVersion` 位于**根对象**，当前为 `1`；缺失视为旧数据（未标记），读取不报错，保存时补写当前版本。
- 恢复/导入走 `doc.replace`：只替换 `products`（以及 `schemaVersion`），**远端根级未知字段一律保留**，不会被整库覆盖清掉。
- 后续若升级结构：在 core 内增加迁移函数，读取/保存时按 `schemaVersion` 幂等迁移；迁移前的数据先导出备份。

---

## 3. `js/core.js` API 一览（v2.2.0）

### 3.1 状态/工具

| API | 说明 |
| --- | --- |
| `ZCFI.VERSION` | 核心版本（当前 `2.2.0`） |
| `ZCFI.SCHEMA_VERSION` | 数据结构版本（当前 `1`） |
| `ZCFI.STATUS` / `STATUS_LIST` | `待售/在售/售出` |
| `ZCFI.normalizeStatus(v)` | 历史别名归一 |
| `ZCFI.statusClass(v)` | 返回 `status-pending/onsale/sold/unknown` |
| `ZCFI.escapeHtml(v)` / `escapeAttr(v)` | HTML 转义（所有页面渲染必须用） |
| `ZCFI.normalizeCode/sameCode` | 编码归一：去除零宽字符与**所有空白（含全角空格）**，忽略大小写比较 |
| `ZCFI.normalizeQuery` | 搜索词归一 |
| `ZCFI.normalizeUrl/sameUrl/isHttpUrl` | 链接比较/识别 |
| `ZCFI.clone/valuesEqual` | 深拷贝/相等（`valuesEqual` 基于 `deepEqual`） |
| `ZCFI.deepEqual(a, b)` | 深比较，**键序无关**；用于保存 `unchanged` 判定等 |
| `ZCFI.sizeBytes(value)` | 按 `TextEncoder` 计算的 UTF-8 **真实字节数**（中文不再被低估） |
| `ZCFI.isPlainObject` | 普通对象判断 |
| `ZCFI.friendlyError(err)` | 错误码 → 中文提示 |
| `ZCFI.isRetryableError(err)` | 是否可重试（网络/5xx 等） |
| `ZCFI.storage` | 带 try/catch 的 localStorage/sessionStorage 封装 |
| `ZCFI.credentials` | 统一凭据（见 3.2） |
| `ZCFI.formatDateTime/formatTime` | 时间格式化 |
| `ZCFI.downloadJson(name, data)` | 浏览器下载 JSON |
| `ZCFI.toast(msg, opts)` | 轻量 toast |

### 3.2 凭据 `ZCFI.credentials`

| 方法 | 说明 |
| --- | --- |
| `read()` | 返回 `{token, gistId, filename, remember}`；读取时 sessionStorage 优先、localStorage 兜底 |
| `write(token, gistId, filename, remember)` | `remember=true` 写 localStorage 并清 sessionStorage；否则写 sessionStorage 并清 localStorage；返回实际生效的 remember |
| `clearToken()` | 只清 Token，保留 Gist ID/文件名（便于重新登录） |
| `clear()` | 清除全部登录凭据（两处存储） |

> admin 与 scan 共用这一份实现；退出登录由页面调用 `clear()`，并按需清理本机历史/快照。

### 3.3 文档查询

| API | 说明 |
| --- | --- |
| `getProducts(doc)` | 取 `products` |
| `findNodeByCode(docOrProducts, code)` | 递归查节点（**不判断软删除**） |
| `findNodeEntry(doc, code)` | 返回 `{container,key,node,parentCode}`；**非顶层节点返回正确的 `parentCode`**（v2.2.0 修复） |
| `findParentNode(doc, code)` | 查父节点（基于正确的 `parentCode`） |
| `findItem(node, itemCode)` | 在节点 items 中查库存 |
| `walk(doc, cb)` | 深度遍历所有节点（包含已删除） |
| `countDescendants(node)` | 统计子节点/库存数量 |
| `validateDoc(data)` / `validateDocDeep(data)` | 基础结构校验 / 深度体检 |
| `isDeleted(entity)` | `!!entity.deletedAt` |

> 注意：`findNodeByCode` 等查询**不会**自动过滤回收站；页面在业务层用 `isDeleted()` 判断。扫码端在 `findProductMatches()` 中按「祖先删除则整棵子树删除」过滤。`findNodeEntry` 的 `parentCode` 修复后，复制嵌套节点、子节点自定义编码校验、回收站祖先守卫都正确。

### 3.4 Gist 读写

```js
const r = await ZCFI.get(token, gistId, filename);
// r = { data, updatedAt, revision, size }
// 失败抛错：FILE_MISSING / PARSE / SCHEMA / TRUNCATED / EMPTY / AUTH / PERMISSION / RATE_LIMIT / NETWORK / SERVER

const h = await ZCFI.history(token, gistId);        // 历史版本列表
const rev = await ZCFI.getAtRevision(token, gistId, sha, filename); // 指定版本内容
await ZCFI.patch(token, gistId, filename, doc);     // 直接整库写入（谨慎，仅特殊场景）
```

- 所有 GitHub 请求统一 `cache: 'no-store'`，避免浏览器缓存把旧副本当作「写前最新」。
- 错误码：`403` 且限流 → `RATE_LIMIT`（带 `retryAfter`，来自 `Retry-After` / `X-RateLimit-Reset`）；`403` 非限流 → `PERMISSION`；`404` → `FILE_MISSING`（文案并列「Gist 不存在/文件名不存在/Token 无 gist 权限」三种可能）；`401` → `AUTH`。
- `EMPTY/PARSE/SCHEMA/TRUNCATED` 一律抛错，页面进入只读保护，绝不用残缺数据覆盖远端。

### 3.5 保存引擎 `ZCFI.save()`

```js
const result = await ZCFI.save({
  token, gistId, filename,
  baseDoc,          // 上次成功读取/保存的完整文档快照（三方合并基准）
  ops: [ ... ],     // 本次要做的修改
  onConflict,       // async (conflicts) => ['mine'|'theirs', ...] | null
  onRetry,          // async (err, attempt) => {}
  maxAttempts       // 默认 3（网络/5xx 重试，GET+apply+PATCH 整体重试）
});
// result = { data, updatedAt, revision, conflicts, unchanged, attempts }
```

支持的 ops：

| type | 必填 | 说明 |
| --- | --- | --- |
| `node.upsert` | `code`、`fields` | 新增/修改节点；`parentCode`（新增时）；`originalCode`（改名）；`baseNode` 可选；新建支持 `createOnly`：远端已存在同码则报冲突而不是静默覆盖 |
| `item.upsert` | `parentCode`、`code`、`fields` | 新增/修改库存；`originalCode`、`baseItem` 可选 |
| `node.delete` | `code` | 删除节点（含子树） |
| `item.delete` | `parentCode`、`code` | 删除库存 |
| `doc.replace` | `doc` | 恢复备份/历史版本：用 `doc.products` 替换当前 products，保留远端根级未知字段；**会走冲突确认**（见 4.3） |

`fields` 只传**实际变化的字段**；`undefined` 表示清空该字段。

---

## 4. 保存流程（三方合并）

### 4.1 常规保存

```
页面：本地 gistData（展示） + baseDoc（上次成功快照）
   │  用户在弹窗/抽屉修改 → 只算 changed fields → 构造 ops
   ▼
ZCFI.save()
   │ 1. 同 gist+file 串行化（同页/多请求排队）
   │ 2. 每次保存前重新 GET 远端最新文档（cache:'no-store'）
   │ 3. clone 远端文档为 work，把 ops 应用到 work 上
   │ 4. 每个字段以 baseDoc 为基准做三方比较：
   │      remote == base            → 应用 mine
   │      remote == mine            → 无冲突
   │      remote != base && != mine → 生成 conflict
   │ 5. 有冲突 → 页面 onConflict 逐字段选择；重新应用 work
   │ 6. 无冲突/解决后 → PATCH work（紧凑 JSON）
   │ 7. 网络/5xx 可重试：GET + apply + PATCH 整体重试（重试会重新 GET + 重放 ops）
   ▼
返回 result.data（远端合并后的完整文档）
页面：gistData = result.data；baseDoc = clone(result.data)
```

设计目标：

1. **绝不整库覆盖**：写前必须 GET 远端，只把本次 ops 应用到远端副本上。
2. **字段级冲突**：只比较本次改动字段，避免无关字段误报。
3. **幂等重试**：重试重新 GET，不会叠加同一次修改。
4. **严格读取**：读取异常直接抛错，页面进入只读保护，避免用空/残缺数据覆盖。
5. **并发新建保护**：`createOnly` 防止两端同时生成同一编码时静默覆盖。

### 4.2 扫码端保存特点

- 扫码端 `saveEntityFields()` 用 `maxAttempts: 1` + 页面「重试保存」按钮（避免自动重试与用户点击语义混淆）。
- 关联保存只提交 `trackingNumber` / `orderNumber` / `qrLinks` / `status` 中实际变化的字段。
- 备注保存只提交 `remark`。
- 冲突时逐字段对话框（展示基准/远端/我的值），默认不静默采用本地值。
- 失败时不修改本地 `gistData`，保持 UI 与内存一致。

### 4.3 整库恢复/导入（`doc.replace`）

- 恢复历史版本、恢复本地快照、导入 JSON 都走 `doc.replace`。
- 执行前页面先 `ZCFI.get()` **拉取远端真实最新数据**并下载 `backup-before-<时间>.json`（不是内存里的旧副本）。
- 若远端与页面 `baseDoc` 不一致（其他设备有并发修改），弹确认「远端有 N 处会丢失的改动，是否继续」；不复用常规冲突逐字段 UI。
- `applyDocReplace` 只替换 `products` 与 `schemaVersion`，保留根级未知字段。
- 导入前先跑 `validateDocDeep`，errors 阻止导入。

---

## 5. 软删除（回收站）约定

- 删除 = 给节点/库存加 `deletedAt`（软删除），数据仍在 Gist。
- 普通列表/搜索/统计/打印/扫码都不显示已删除项；**汇总不统计已删子树**（R4 修复）。
- **节点删除会隐藏整棵子树**（子孙不单独加 `deletedAt`，但祖先删除即视为删除）。
- 恢复节点：清除该节点 `deletedAt`，子树中之前单独删除的项仍保持删除状态。
- 恢复库存：要求父节点不在回收站；祖先守卫基于正确的 `parentCode`（v2.2.0 修复）。
- 彻底删除：真正从文档移除；节点会级联删除子节点/库存。
- 编码全局唯一校验**包含回收站中的项**：软删除期间编码仍被占用，彻底删除后才释放。
- 数据体检/统计会区分「含回收站」与「有效」数量。

---

## 6. 页面职责边界

| 能力 | admin.html | scan.html |
| --- | --- | --- |
| 登录（Token/Gist） | ✅ 可选记住（local/session，**默认不勾选**） | ✅ 可选记住（local/session，**默认不勾选**） |
| 商品树/搜索/筛选/排序/汇总 | ✅（R2b 起，R4 修筛选/汇总） | 只读查询（按编码/单号/链接匹配） |
| 新增/编辑/删除/复制/添加 N 件/回收站 | ✅ | ❌（只能备注/关联/标售出） |
| 批量状态/批量打印/跨节点批量 | ✅ | ❌ |
| 导出/导入/体检/历史版本/本地快照 | ✅ | ❌ |
| 连续扫码/相册识别/手电筒/震动提示音 | ❌ | ✅ |
| 关联快递/订单/链接 | ✅（编辑弹窗手填） | ✅（扫码/手动，逐字段冲突） |
| 历史记录 | Gist 历史版本 | 本机扫码流水（localStorage，按 gistId 隔离，含已删除标记） |
| 打印（本机 C-Lodop，3 模板/份数/设置记忆/打印前复核/strict） | ✅（R3+R4） | ❌ |

两端共享 `js/core.js`，因此状态词表、转义、Gist 读写、保存合并、凭据、软删除判断、错误提示保持一致。

---

## 7. 本地存储键

| 键 | 页面 | 内容 |
| --- | --- | --- |
| `github_token` / `gist_id` / `gist_filename` | 两端 | 登录凭据；由 `ZCFI.credentials` 统一读写，默认只写 sessionStorage，勾选记住后才写 localStorage |
| `zcfi_admin_snapshots_v1` | admin | 自动本地快照（最多 3 份，**按 gistId 分桶隔离**，退出清理非当前 Gist） |
| `zcfi_admin_view_v1` | admin | 搜索/筛选/排序/展开视图记忆（含 gistId 命名空间） |
| `zcfi_print_settings_v1` | admin | 打印模板/打印机/份数/预览偏好 |
| `zcfi_scan_history_v1` | scan | 扫码历史（最近 200 条，含 ref，按 gistId 隔离） |
| `zcfi_scan_history_backup_v1` | scan | 清空历史撤销备份（最近 20 条，撤销窗口结束/成功后删除） |
| `zcfi_scan_settings_v1` | scan | 连续模式/震动/提示音设置 |

> 凭据读取均以 sessionStorage 优先、localStorage 兜底；退出同时清理两处。详见 [一致性审查（历史报告）](CONSISTENCY-REVIEW.md)。

---

## 8. 安全边界（v2.2.0 重写）

### 8.1 基本事实

- **Secret Gist 不是私有仓库**：Secret 只是「不公开列出」；拿到链接的人**无需登录**即可读取内容。**链接即权限。**
- **无后端、无服务端鉴权**：页面直接请求 GitHub API；拿到同一 Token + Gist ID 的人即可读写。
- **Token 只在浏览器内存与（可选）本机存储**；请求时仅放在 `Authorization` 头，不进 URL、日志、Gist、导出、快照。
- `gists` 权限是**账号级**的：Token 泄露 = 该账号下**所有** Gist 可读写。

### 8.2 信任边界清单

| 目的地 | 何时访问 | 能接触到什么 | 风险与说明 |
| --- | --- | --- | --- |
| `api.github.com` | 登录、读取、保存、历史版本 | Token（仅 `Authorization` 头）、Gist 内容 | GitHub 官方 API；Token 不进 URL/Gist/日志。泄露即可读写账号全部 Gist |
| `gist.githubusercontent.com` | 大文件（>1 MB）`raw_url` 回退 | 公开/Secret Gist 的 raw 内容 | 无需 Token 即可读取；Secret Gist 的 raw 链接同样可被拿到链接者读取 |
| `https://localhost.lodop.net:8443` / `http://localhost:8000` | 打印（仅点打印/预览时才访问） | 标签数据（名称/编码/单号等） | **本机** C-Lodop 服务，运行时加载的第三方脚本通道；只应在本机使用。**优先 http://localhost:8000**（localhost 属可信来源，不构成混合内容；可绕开 8443 可能过期的证书），失败再试 https:8443。页面加载/登录时**不发起**本机请求 |
| CDN（原第三方脚本源） | — | — | **已移除**：`html5-qrcode` 自托管到 `js/vendor/`，站点不再从 CDN 加载脚本 |

### 8.3 CSP 现状与残留

- `index.html`：纯静态、**无内联脚本**，CSP 为 `default-src 'self'; script-src 'self'; ...`。
- `tools/scanner-test.html`：调试页允许内联脚本（`script-src 'self' 'unsafe-inline'`），扫码库引用本地 `../js/vendor/html5-qrcode.min.js`。
- `admin.html` / `scan.html`：仍是单文件内联脚本，CSP 需要 `'unsafe-inline'`；**严格 CSP 需先外置内联脚本/样式，属后续项**（未完成，别在文档里宣称已严格化）。
- `admin.html` 的 CSP 白名单还包含本机打印所需来源：`script-src ... https://localhost.lodop.net:8443 http://localhost:8000`、`connect-src ... wss://localhost.lodop.net:8443 ws://localhost:8000 ws://127.0.0.1:8000`、`img-src` 与 `form-action` 同上。**未放开 `'unsafe-eval'`**：C-Lodop 内部字符串定时器由页面定向垫片转成函数调用（包装 `window.setTimeout`，只识别 `On_CLodop_Opened` / `OpenWebSocket` 两种）。
- 三页均建议/已配置 `Referrer-Policy: no-referrer`（GitHub Pages 不能下发响应头，用 `<meta name="referrer">` 落地）。

### 8.4 数据渲染与 XSS

- 所有 Gist/扫码内容渲染前必须 `escapeHtml`/`textContent`；禁止直接拼接 innerHTML（现有页面已审计）。
- 备注、名称、链接、扫码文本均按纯文本展示；图片识别在本机完成，不上传。

### 8.5 运维建议

- Token：Fine-grained 只勾 Gist 读写（或 Classic 只勾 `gist`）；专用账号；定期轮换；怀疑泄露立即 Revoke。
- 共用设备：默认不勾「记住登录」，用完退出；扫码端可同时清理本机历史。
- 备份：定期手动导出 JSON；恢复/导入前系统会自动下载 `backup-before-*.json`。

---

## 9. 已知限制 / 后续

- **Secret Gist 非私有**：无法阻止拿到链接者读取；敏感数据不应放 Gist。
- **内联脚本导致 CSP 需 `'unsafe-inline'`**：admin/scan 尚未外置脚本，严格 CSP 是后续项。
- Gist 单文件约 1 MB 限制；超大数据的拆分/压缩策略尚未实现；>1.5 MB 自动快照跳过。
- **本机 C-Lodop 8443 证书可能过期**（实测 `ERR_CERT_DATE_INVALID`）：页面优先 `http://localhost:8000`；两地址都失败时升级/重装 C-Lodop。
- **浏览器本地网络授权（LNA）**：页面加载/登录时不请求本机服务，仅点打印时按需连接并触发授权提示。
- 打印必须在本机安装并启动 C-Lodop，效果受本机 C-Lodop/打印机/驱动影响，需**真实打印机现场验收**；内置 canvas 预览只是示意图。
- 扫码历史仅本机，不跨设备同步；按 gistId 隔离，退出可清理。
- 编码大小写/重复：后台导入/体检会拦截大小写重复、提示非大写；历史遗留数据仍建议规范化。
- 没有 Service Worker/PWA 离线包。
- 没有多用户账号/权限体系，依赖共用 Token 的信任模型。
- R2b 搜索为保持展开/滚动性能，未命中节点可能保留在 DOM 中（隐藏 class 控制显示）。
- 后台列表字段可见性（节点 tracking/remark/qrLinks、库存 remark/qrLinks）仍需打开弹窗查看，属后续体验项。
- 真机打印与用户真实 Gist 数据验收仍需现场完成。

相关审查问题与修复状态见 [docs/CONSISTENCY-REVIEW.md](CONSISTENCY-REVIEW.md)（R2 阶段历史快照 + 当前状态表）。
