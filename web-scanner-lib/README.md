# web-scanner-lib

轻量的浏览器端扫码与记录库（示例实现）。

目标：
- 使用 html5-qrcode 在浏览器中扫描二维码/条形码。
- 将识别记录保存在浏览器的 IndexedDB 中（简单封装）。
- 提供导出 JSON 与可选的 Gist 备份方法（需用户在运行时提供 GitHub Token）。
- 对初学者友好，API 简单：init/start/stop/onDetected/saveRecord/getRecords/exportJSON/syncToGist。

结构：
- src/
  - index.js          主入口（ES module）
  - adapter-html5qrcode.js  html5-qrcode 适配器
  - storage.js        简单 IndexedDB 封装
- examples/
  - basic.html        最小可运行示例（依赖 html5-qrcode 的 CDN）

注意：
- 本库在页面中使用 `https://unpkg.com/html5-qrcode` 来加载扫码功能。你可以改成 zxing-js 或 Quagga2 的适配器（我可以后续帮你加）。
- Gist 同步需要用户在浏览器运行时临时提供 GitHub Personal Access Token（仅需 gist 权限）。请勿把 Token 写入仓库代码中。

使用示例见 examples/basic.html。
