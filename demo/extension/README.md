# 蹲到了 · Bilibili Tracker Extension

## Load Unpacked

1. 启动后端 `http://localhost:4000` 和前端 `http://localhost:5173`。
2. 打开 `chrome://extensions`。
3. 开启右上角 Developer mode。
4. 选择 `Load unpacked`，指向本目录 `demo/extension/`。
5. 确认 `manifest.json` 无报错，且 service worker 可被 inspect。

## Manual Smoke

1. 打开任意 B 站视频页并保持已登录状态。
2. 发布一条评论或子回复，观察浏览器 Network 中是否出现 `POST http://localhost:4000/api/ingest/comment`。
3. 在 `chrome://extensions` 的 service worker console 中手动运行 `pollMsgfeed()` 与 `pollTopReplies()`，确认后端收到 `/api/ingest/reply` 与 `/api/ingest/top-reply`。
4. 点击 popup 的“历史倒推”和“状态”，确认 `/api/backfill/start` 与 `/api/backfill/status` 可用。
5. 等待 backend 广播 `card.generated`，确认桌面通知出现并能打开 `http://localhost:5173?card_id=...`。
