# 架构说明

本文面向维护者/开发者，说明页面、数据层和 GitHub Gist 的关系。最终用户请读 [用户手册](USER-GUIDE.md)。

当前基线（2026-10-21 最终）：

- 核心：`js/core.js` **v2.1.0**
- 管理后台：**R3**（R2b 提交 `65b8713` + R3 提交 `63c9ca8`）
- 扫码端：**R2 + 一致性修复**（`9dc7bcf` + `09afad0`）
- 站点：GitHub Pages 静态站，自定义域名 `xypipei.zcfi.cn`

---

## 1. 总览

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  手机浏览器 /scan (scan.html) │        │ 电脑浏览器 /admin (admin.html)│
│  - 扫码/相册识别/连续模式      │        │ - 商品树/编辑/批量/回收站     │
│  - 查商品/关联单号/标售出      │        │ - 导出导入/体检/历史/快照     │
│  - 本机历史/设置              │        │ - 标签打印（CLodop）          │
└───────────────┬──────────────┘        └───────────────┬──────────────┘
                │                                        │
                └──────────────┬─────────────────────────┘
                               ▼
                    ┌────────────────────┐
                    │   js/core.js       │
                    │  ZCFI.* 共享数据层  │
                    │  读/存/合并/转义    │
                    └─────────┬──────────┘
                              │ HTTPS + GitHub Token
                              ▼
                    ┌────────────────────┐
                    │  GitHub Gist       │
                    │  data.json         │
                    │  { products: ... } │
                    └────────────────────┘
```

外部依赖：

| 依赖 | 用途 | 位置 |
| --- | --- | --- |
| `html5-qrcode@2.3.8` | 摄像头/图片扫码 | CDN（unpkg） |
| `js/core.js` | 共享数据层 | 仓库本地 |
| `CLodopFuncs.js` | 加载本机 C-Lodop 打印服务 | 仓库本地 + 本机 C-Lodop |
| GitHub API | Gist 读写/历史 | `api.github.com` |

没有后端/数据库；浏览器的 `fetch` 直接访问 GitHub API。

---

## 2. 数据模型

根对象：

```json
{ "products": { "A001": { ... } } }
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

---

## 3. `js/core.js` API 一览

### 3.1 状态/工具

| API | 说明 |
| --- | --- |
| `ZCFI.VERSION` | 核心版本（当前 `2.1.0`） |
| `ZCFI.STATUS` / `STATUS_LIST` | `待售/在售/售出` |
| `ZCFI.normalizeStatus(v)` | 历史别名归一 |
| `ZCFI.statusClass(v)` | 返回 `status-pending/onsale/sold/unknown` |
| `ZCFI.escapeHtml(v)` / `escapeAttr(v)` | HTML 转义（所有页面渲染必须用） |
| `ZCFI.normalizeCode/sameCode` | 编码去空白/零宽，忽略大小写比较 |
| `ZCFI.normalizeQuery` | 搜索词归一 |
| `ZCFI.normalizeUrl/sameUrl/isHttpUrl` | 链接比较/识别 |
| `ZCFI.clone/valuesEqual/isPlainObject` | 深拷贝/相等/普通对象 |
| `ZCFI.friendlyError(err)` | 错误码 → 中文提示 |
| `ZCFI.storage` | 带 try/catch 的 localStorage 封装 |
| `ZCFI.formatDateTime/formatTime` | 时间格式化 |
| `ZCFI.downloadJson(name, data)` | 浏览器下载 JSON |
| `ZCFI.toast(msg, opts)` | 轻量 toast |

### 3.2 文档查询

| API | 说明 |
| --- | --- |
| `getProducts(doc)` | 取 `products` |
| `findNodeByCode(docOrProducts, code)` | 递归查节点（**不判断软删除**） |
| `findNodeEntry(doc, code)` | 返回 `{container,key,node,parentCode}` |
| `findParentNode(doc, code)` | 查父节点 |
| `findItem(node, itemCode)` | 在节点 items 中查库存 |
| `walk(doc, cb)` | 深度遍历所有节点（包含已删除） |
| `countDescendants(node)` | 统计子节点/库存数量 |
| `validateDoc(data)` / `validateDocDeep(data)` | 基础结构校验 / 深度体检 |
| `isDeleted(entity)` | `!!entity.deletedAt` |

> 注意：`findNodeByCode` 等查询**不会**自动过滤回收站；页面在业务层用 `isDeleted()` 判断。扫码端在 `findProductMatches()` 中按「祖先删除则整棵子树删除」过滤。

### 3.3 Gist 读写

```js
const r = await ZCFI.get(token, gistId, filename);
// r = { data, updatedAt, revision, size }
// 失败抛错：FILE_MISSING / PARSE / SCHEMA / TRUNCATED / EMPTY / AUTH / NETWORK / RATE_LIMIT

const h = await ZCFI.history(token, gistId);        // 历史版本列表
const rev = await ZCFI.getAtRevision(token, gistId, sha, filename); // 指定版本内容
await ZCFI.patch(token, gistId, filename, doc);     // 直接整库写入（谨慎，仅特殊场景）
```

### 3.4 保存引擎 `ZCFI.save()`

```js
const result = await ZCFI.save({
  token, gistId, filename,
  baseDoc,          // 上次成功读取/保存的完整文档快照（三方合并基准）
  ops: [ ... ],     // 本次要做的修改
  onConflict,       // async (conflicts) => ['mine'|'theirs', ...] | null
  onRetry,          // async (err, attempt) => {}
  maxAttempts       // 默认 3（网络/5xx 重试）
});
// result = { data, updatedAt, revision, conflicts, unchanged, attempts }
```

支持的 ops：

| type | 必填 | 说明 |
| --- | --- | --- |
| `node.upsert` | `code`、`fields` | 新增/修改节点；`parentCode`（新增时）；`originalCode`（改名）；`baseNode` 可选 |
| `item.upsert` | `parentCode`、`code`、`fields` | 新增/修改库存；`originalCode`、`baseItem` 可选 |
| `node.delete` | `code` | 删除节点（含子树） |
| `item.delete` | `parentCode`、`code` | 删除库存 |
| `doc.replace` | `doc` | 恢复备份/历史版本：用 `doc.products` 替换当前 products，保留远端根级未知字段 |

`fields` 只传**实际变化的字段**；`undefined` 表示清空该字段。

---

## 4. 保存流程（三方合并）

```
页面：本地 gistData（展示） + baseDoc（上次成功快照）
   │  用户在弹窗/抽屉修改 → 只算 changed fields → 构造 ops
   ▼
ZCFI.save()
   │ 1. 同 gist+file 串行化（同页/多请求排队）
   │ 2. 每次保存前重新 GET 远端最新文档
   │ 3. clone 远端文档为 work，把 ops 应用到 work 上
   │ 4. 每个字段以 baseDoc 为基准做三方比较：
   │      remote == base            → 应用 mine
   │      remote == mine            → 无冲突
   │      remote != base && != mine → 生成 conflict
   │ 5. 有冲突 → 页面 onConflict 选择；重新应用 work
   │ 6. 无冲突/解决后 → PATCH work（紧凑 JSON）
   │ 7. 网络/5xx 可重试（重试会重新 GET + 重放 ops）
   ▼
返回 result.data（远端合并后的完整文档）
页面：gistData = result.data；baseDoc = clone(result.data)
```

设计目标：

1. **绝不整库覆盖**：写前必须 GET 远端，只把本次 ops 应用到远端副本上。
2. **字段级冲突**：只比较本次改动字段，避免无关字段误报。
3. **幂等重试**：重试重新 GET，不会叠加同一次修改。
4. **严格读取**：读取异常直接抛错，页面进入只读保护，避免用空/残缺数据覆盖。

扫码端保存特点：

- 扫码端 `saveEntityFields()` 用 `maxAttempts: 1` + 页面「重试保存」按钮（避免自动重试与用户点击语义混淆）。
- 关联保存只提交 `trackingNumber` / `orderNumber` / `qrLinks` / `status` 中实际变化的字段。
- 备注保存只提交 `remark`。
- 失败时不修改本地 `gistData`，保持 UI 与内存一致。

---

## 5. 软删除（回收站）约定

- 删除 = 给节点/库存加 `deletedAt`（软删除），数据仍在 Gist。
- 普通列表/搜索/统计/打印/扫码都不显示已删除项。
- **节点删除会隐藏整棵子树**（子孙不单独加 `deletedAt`，但祖先删除即视为删除）。
- 恢复节点：清除该节点 `deletedAt`，子树中之前单独删除的项仍保持删除状态。
- 恢复库存：要求父节点不在回收站。
- 彻底删除：真正从文档移除；节点会级联删除子节点/库存。
- 编码全局唯一校验**包含回收站中的项**：软删除期间编码仍被占用，彻底删除后才释放。
- 数据体检/统计会区分「含回收站」与「有效」数量。

---

## 6. 页面职责边界

| 能力 | admin.html | scan.html |
| --- | --- | --- |
| 登录（Token/Gist） | ✅ 可选记住（local/session，默认勾选） | ✅ 可选记住（local/session，默认勾选） |
| 商品树/搜索/筛选/排序/汇总 | ✅（R2b） | 只读查询（按编码/单号/链接匹配） |
| 新增/编辑/删除/复制/添加 N 件/回收站 | ✅ | ❌（只能备注/关联/标售出） |
| 批量状态/批量打印/跨节点批量 | ✅ | ❌ |
| 导出/导入/体检/历史版本/本地快照 | ✅ | ❌ |
| 连续扫码/相册识别/手电筒/震动提示音 | ❌ | ✅ |
| 关联快递/订单/链接 | ✅（编辑弹窗手填） | ✅（扫码/手动） |
| 历史记录 | Gist 历史版本 | 本机扫码流水（localStorage，含已删除标记） |
| 打印（CLodop，3 模板/份数/设置记忆/打印前复核） | ✅（R3） | ❌ |

两端共享 `js/core.js`，因此状态词表、转义、Gist 读写、保存合并、软删除判断、错误提示保持一致。

---

## 7. 本地存储键

| 键 | 页面 | 内容 |
| --- | --- | --- |
| `github_token` / `gist_id` / `gist_filename` | 两端 | 登录凭据；默认勾选写 localStorage，取消后写 sessionStorage |
| `zcfi_admin_snapshots_v1` | admin | 自动本地快照（最多 3 份） |
| `zcfi_admin_view_v1` | admin | 搜索/筛选/排序/展开视图记忆 |
| `zcfi_print_settings_v1` | admin | 打印模板/打印机/份数/预览偏好 |
| `zcfi_scan_history_v1` | scan | 扫码历史（最近 200 条，含 ref） |
| `zcfi_scan_history_backup_v1` | scan | 清空历史撤销备份（最近 20 条） |
| `zcfi_scan_settings_v1` | scan | 连续模式/震动/提示音设置 |

> 凭据读取均以 sessionStorage 优先、localStorage 兜底；退出同时清理两处（R2b/09afad0 起两端一致）。详见 [一致性审查](CONSISTENCY-REVIEW.md)。

---

## 8. 安全边界

- Token 仅保存在本机浏览器；页面无后端，不会经第三方服务器转发。
- Token 建议 Fine-grained 只勾 Gist 读写。
- 所有 Gist/扫码内容渲染前必须 `escapeHtml`/`textContent`；禁止直接拼接 innerHTML（现有页面已审计）。
- HTML 内容（备注、名称、链接、扫码文本）均按纯文本展示。
- 照片识别在本机完成，不上传。
- Gist 建议 Secret；公开 Gist 的地址可被发现，但写入仍需 Token。
- 无服务端鉴权：拿到同一 Token + Gist ID 的人即可读写，团队使用需自行管理 Token。

---

## 9. 已知限制 / 后续

- Gist 单文件约 1 MB 限制；超大数据的拆分/压缩策略尚未实现。
- 打印效果受本机 C-Lodop/打印机/驱动影响，需**真实打印机现场验收**；内置 canvas 预览只是示意图。
- 扫码历史仅本机，不跨设备同步；已删除商品记录会显示「已删除」徽章但保留审计痕迹。
- 编码大小写/重复：后台导入/体检会拦截大小写重复、提示非大写；历史遗留数据仍建议规范化。
- 默认 Gist ID 在两端登录框硬编码为示例值（P3-3 未修，可接受；使用自己的 Gist 时必须改）。
- R2b 搜索为保持展开/滚动性能，未命中节点可能保留在 DOM 中（隐藏 class 控制显示）。
- 没有 Service Worker/PWA 离线包。
- 没有多用户账号/权限体系，依赖共用 Token 的信任模型。
- 真机打印与用户真实 Gist 数据验收仍待完成。

相关审查问题与修复状态见 [docs/CONSISTENCY-REVIEW.md](CONSISTENCY-REVIEW.md)。