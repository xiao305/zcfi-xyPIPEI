# js/vendor —— 本地化的第三方依赖

本目录存放从 npm 包原样复制的前端依赖，**不放业务代码**。本地化原因：

1. 页面同源保存 GitHub Token（`gists` 权限是账号级），CDN 脚本被投毒/域名被劫持即可窃取；
2. `unpkg` 在国内网络下不稳定，扫码页会直接不可用；
3. GitHub Pages 无法下发 `Content-Security-Policy` 响应头，只能靠 `<meta>` CSP 白名单，依赖必须固定来源。

## 清单

| 文件 | 来源 | 版本 | SHA-256 |
| --- | --- | --- | --- |
| `html5-qrcode.min.js` | `https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js`（npm `html5-qrcode@2.3.8`） | 2.3.8 | `660b12437b1d747e3e68b8be0685c08cb728140110ad213f167b14b66f8b1d8e` |

- SHA-384（base64，用于将来若改回 CDN 时的 SRI）：`c9d8RFSL+u3exBOJ4Yp3HUJXS4znl9f+z66d1y54ig+ea249SpqR+w1wyvXz/lk+`
- 文件大小：375,364 字节。

## 升级步骤

1. 从 npm/unpkg 下载同版本以上文件，替换本目录文件；
2. 更新上表的版本与哈希；
3. 更新 `tools/verify.mjs` 中 `js/vendor/html5-qrcode.min.js` 的存在性/语法断言；
4. 在真机（iOS Safari + Android Chrome）回归扫码、相册识别、连续模式、手电筒；
5. 提交信息注明版本与哈希。

## 约束

- 不修改文件内容（包括格式化）；如需修改请先确认上游变更。
- 新增第三方依赖必须同时更新本 README、`tools/verify.mjs` 与 `docs/ARCHITECTURE.md` 的依赖表。
