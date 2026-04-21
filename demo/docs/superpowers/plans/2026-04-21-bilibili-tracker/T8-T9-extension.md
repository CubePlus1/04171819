# Bilibili Tracker v0.3.0 · Extension Sub-Plan (T8-T9)

> Parent plan: ../2026-04-21-bilibili-tracker.md
> Spec reference: ../../specs/2026-04-21-bilibili-tracker-design.md §5.1, §7.1, §7.3

## Task T8: Extension MV3 skeleton

Files to create in `demo/extension/`:
- `manifest.json`
- `content_script.js`
- `service_worker.js`
- `popup.html`
- `popup.js`
- `ws_client.js`
- `README.md`

### T8.1 manifest.json
- [ ] Step 1 Write `demo/extension/manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "蹲到了 · Bilibili Tracker",
  "version": "0.3.0",
  "description": "监控 B 站评论与回复，自动生成履约卡片",
  "permissions": ["cookies", "storage", "notifications", "alarms"],
  "host_permissions": [
    "*://*.bilibili.com/*",
    "http://localhost:4000/*"
  ],
  "background": {
    "service_worker": "service_worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["*://*.bilibili.com/*"],
      "js": ["content_script.js"],
      "run_at": "document_start",
      "all_frames": true
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icon.png",
      "48": "icon.png",
      "128": "icon.png"
    }
  },
  "icons": {
    "16": "icon.png",
    "48": "icon.png",
    "128": "icon.png"
  }
}
```
- [ ] Step 2 放置占位 icon.png（MV3 要求 action.default_icon 存在）· 选一种：
  - 方案 A（最省事）：`curl -L -o demo/extension/icon.png https://www.bilibili.com/favicon.ico` （拉 B 站 favicon 当占位；仅本地开发，后续自备 brand icon）
  - 方案 B：`printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=' | base64 -D > demo/extension/icon.png` （1x1 透明 PNG）
- [ ] Step 3 chrome://extensions → 开发者模式 → load unpacked → select `demo/extension/` → verify no manifest error.
- [ ] Step 4 Commit: `chore(bilibili): T8.1·manifest init 插件清单初始化`
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

### T8.2 content_script XHR + fetch hook
- [ ] Step 1 Write `demo/extension/content_script.js` (hook logic):
```javascript
(function() {
  console.log('[Dundao] Content script injected');

  const INGEST_URL = 'http://localhost:4000/api/ingest/comment';

  // Helper to extract aid/rpid from Bilibili response
  function handleBilibiliResponse(url, responseText) {
    try {
      const data = JSON.parse(responseText);
      if (data.code !== 0) return;

      // Match /x/v2/reply/add or /x/v2/reply/reply/add
      if (url.includes('/x/v2/reply/add') || url.includes('/x/v2/reply/reply/add')) {
        const rpid = data.data.rpid || (data.data.reply && data.data.reply.rpid);
        const aid = new URLSearchParams(window.location.search).get('aid') || 
                    (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.aid);

        if (!rpid) return;

        // Note: content and target_creator info might need to be scraped from DOM 
        // as they aren't always in the response. For v0.3.0 we prioritize rpid/aid.
        const payload = {
          aid: parseInt(aid),
          rpid: parseInt(rpid),
          content: document.querySelector('.reply-box-textarea')?.value || '(hooked)',
          video_title: document.title.replace('_哔哩哔哩_bilibili', ''),
          occurred_at: new Date().toISOString()
        };

        fetch(INGEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(err => console.warn('[Dundao] Ingest failed', err));
      }
    } catch (e) {
      console.warn('[Dundao] Hook parsing error', e);
    }
  }

  // 1. Hook XMLHttpRequest
  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;

  XHR.open = function(method, url) {
    this._url = url;
    return open.apply(this, arguments);
  };

  XHR.send = function(postData) {
    this.addEventListener('load', function() {
      if (this._url.includes('bilibili.com/x/v2/reply/')) {
        handleBilibiliResponse(this._url, this.responseText);
      }
    });
    return send.apply(this, arguments);
  };

  // 2. Hook fetch
  const nativeFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const url = typeof args[0] === 'string' ? args[0] : args[0].url;
    
    if (url.includes('bilibili.com/x/v2/reply/')) {
      const clone = response.clone();
      clone.text().then(text => handleBilibiliResponse(url, text));
    }
    return response;
  };
})();
```
- [ ] Step 2 Manual smoke — reload extension, open a B 站 video, post a comment, check Network tab for `ingest/comment` call and backend logs.
- [ ] Step 3 Commit: `feat(bilibili): T8.2·hook XHR/fetch hook 注入`
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

### T8.3 service_worker chrome.alarms (msgfeed 15m, top-replies 30m)

> 架构要点：service_worker 直接调 B 站公开 API（`host_permissions` 已允许），做字段 normalize 后 POST 到 backend 的 `/api/ingest/reply` / `/api/ingest/top-reply`。**不调 backend 的 poll / trigger 端点（那些不存在）**。

- [ ] Step 1 Write `demo/extension/service_worker.js`:
```javascript
const BACKEND_URL = 'http://localhost:4000';
const BILI_API = 'https://api.bilibili.com';
const RATE_LIMIT_MS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('msgfeed-poll', { periodInMinutes: 15 });
  chrome.alarms.create('top-reply-poll', { periodInMinutes: 30 });
  console.log('[Dundao] Alarms scheduled');
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'msgfeed-poll') pollMsgfeed();
  if (alarm.name === 'top-reply-poll') pollTopReplies();
});

async function getSessData() {
  const cookie = await chrome.cookies.get({ url: 'https://www.bilibili.com', name: 'SESSDATA' });
  return cookie ? cookie.value : null;
}

// 防御性 normalize：B 站 msgfeed item 字段存在多版本 shape
function normalizeMsgfeedItem(item) {
  const inner = item.item ?? {};
  const user = item.user ?? {};
  const ctimeSec = item.reply_time ?? item.ctime ?? (Date.now() / 1000);
  return {
    source: 'L1',
    replying_to_rpid: inner.source_id ?? item.source_id ?? null,
    rpid: inner.target_id ?? inner.subject_id ?? null,
    replier_mid: user.mid ?? null,
    replier_name: user.nickname ?? null,
    content: inner.target_reply_content ?? inner.detail_text ?? '',
    like_count: inner.like ?? 0,
    is_up: Boolean(inner.is_up),
    is_top: Boolean(inner.is_top),
    aid: inner.business_id ?? inner.business ?? null,
    occurred_at: new Date(ctimeSec * 1000).toISOString(),
  };
}

async function pollMsgfeed() {
  const sessdata = await getSessData();
  if (!sessdata) {
    console.warn('[Dundao] msgfeed: SESSDATA absent, skip');
    return;
  }
  try {
    const resp = await fetch(`${BILI_API}/x/msgfeed/reply?platform=web`, {
      credentials: 'include',
    });
    const data = await resp.json();
    if (data.code !== 0) {
      console.warn('[Dundao] msgfeed returned code', data.code, data.message);
      return;
    }
    const items = data.data?.items ?? [];
    for (const it of items) {
      const payload = normalizeMsgfeedItem(it);
      if (!payload.rpid || !payload.replying_to_rpid) continue;
      await fetch(`${BACKEND_URL}/api/ingest/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => console.warn('[Dundao] ingest/reply failed', err));
      await sleep(RATE_LIMIT_MS);
    }
    console.log('[Dundao] msgfeed poll done · items=', items.length);
  } catch (e) {
    console.error('[Dundao] msgfeed poll failed', e);
  }
}

async function pollTopReplies() {
  try {
    // 1. 从 backend 拿 pending intent 的 aid 列表
    const resp = await fetch(`${BACKEND_URL}/api/my-comments?filter=pending`);
    const { items = [] } = await resp.json();
    const aids = Array.from(
      new Set(items.map((x) => x.aid).filter(Boolean)),
    ).slice(0, 10);

    // 2. 对每个 aid 调 B 站 sort=2 top replies
    for (const aid of aids) {
      const r = await fetch(
        `${BILI_API}/x/v2/reply?type=1&oid=${aid}&sort=2&ps=20`,
        { credentials: 'include' },
      );
      const d = await r.json();
      if (d.code !== 0) {
        console.warn('[Dundao] top-reply aid=', aid, 'code=', d.code);
        await sleep(RATE_LIMIT_MS);
        continue;
      }
      const upperMid = d.data?.upper?.mid;
      const batch = (d.data?.replies ?? []).map((reply) => ({
        rpid: reply.rpid,
        replier_mid: reply.mid,
        replier_name: reply.member?.uname,
        content: reply.content?.message ?? '',
        like_count: reply.like ?? 0,
        is_up: upperMid != null && reply.mid === upperMid,
        is_top: Boolean(reply.top),
        occurred_at: new Date(((reply.ctime ?? Date.now() / 1000)) * 1000).toISOString(),
      }));
      await fetch(`${BACKEND_URL}/api/ingest/top-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'L2', aid, batch }),
      }).catch((err) => console.warn('[Dundao] ingest/top-reply failed', err));
      await sleep(RATE_LIMIT_MS);
    }
    console.log('[Dundao] top-reply poll done · aids=', aids.length);
  } catch (e) {
    console.error('[Dundao] top-reply poll failed', e);
  }
}
```
- [ ] Step 2 Smoke — chrome://extensions → find extension → inspect service worker → Console 里手动跑 `pollMsgfeed()` 和 `pollTopReplies()`，观察 `[Dundao]` log 和 backend server.js 日志里的 `[ingest] reply` / `[ingest] top-reply`。
- [ ] Step 3 Commit:
  ```bash
  cd /Users/sevencolor/code/0BKHDD/.worktrees/dundao-bilibili
  git add demo/extension/service_worker.js
  git commit -m "$(cat <<'EOF'
  feat(bilibili): T8.3·service_worker alarms 直调 B 站 API

  SW 绕 backend 直接 fetch msgfeed/reply 和 视频 sort=2 replies（host_permissions 允许），
  字段 normalize 后 POST 到 /api/ingest/reply 和 /api/ingest/top-reply。
  backend 不做 polling 入口，只做接入 + 判真。

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

### T8.4 service_worker chrome.notifications + WS client
- [ ] Step 1 Write `demo/extension/ws_client.js`:
```javascript
export class DWSClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.onCardGenerated = null;
  }

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => console.log('[Dundao] WS Connected');
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'card.generated' && this.onCardGenerated) {
        this.onCardGenerated(msg.payload);
      }
    };
    this.ws.onclose = () => {
      console.log('[Dundao] WS Closed, reconnecting...');
      setTimeout(() => this.connect(), 5000);
    };
  }
}
```
- [ ] Step 2 Extend `demo/extension/service_worker.js`:
```javascript
import { DWSClient } from './ws_client.js';

const wsClient = new DWSClient('ws://localhost:4000/ws');
wsClient.onCardGenerated = (card) => {
  chrome.notifications.create(`card-${card.id}`, {
    type: 'basic',
    iconUrl: 'icon.png',
    title: '蹲到了新卡',
    message: card.pages[0]?.context_line || '点击查看详情',
    priority: 2
  });
};

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('card-')) {
    const cardId = id.replace('card-', '');
    chrome.tabs.create({ url: `http://localhost:5173?card_id=${cardId}` });
  }
});

wsClient.connect();
```
- [ ] Step 3 Smoke — Backend sends `card.generated` event via WS (can use a script to trigger), expect notification.
- [ ] Step 4 Commit: `feat(bilibili): T8.4·ws-notif WebSocket 与通知联通`
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

### T8.5 popup.html "backfill" entry
- [ ] Step 1 Write `demo/extension/popup.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { width: 200px; padding: 10px; font-family: sans-serif; }
    button { width: 100%; margin-bottom: 8px; padding: 8px; cursor: pointer; }
    #status { font-size: 12px; color: #666; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h3>蹲到了 · Tracker</h3>
  <button id="btnOpen">打开主视图</button>
  <button id="btnBackfill">历史倒推</button>
  <button id="btnStatus">状态面板</button>
  <div id="status">Ready.</div>
  <script src="popup.js"></script>
</body>
</html>
```
- [ ] Step 2 Write `demo/extension/popup.js`:
```javascript
document.getElementById('btnOpen').onclick = () => {
  chrome.tabs.create({ url: 'http://localhost:5173' });
};

document.getElementById('btnBackfill').onclick = async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.innerText = '正在获取 SESSDATA...';
  
  const cookie = await chrome.cookies.get({ url: 'https://www.bilibili.com', name: 'SESSDATA' });
  if (!cookie) {
    statusDiv.innerText = '错误: 请先登录 B 站';
    return;
  }

  statusDiv.innerText = '正在启动倒推...';
  try {
    const resp = await fetch('http://localhost:4000/api/backfill/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessdata: cookie.value })
    });
    const res = await resp.json();
    statusDiv.innerText = res.ok ? '倒推已启动，请在主视图查看进度' : `失败: ${res.reason}`;
  } catch (e) {
    statusDiv.innerText = '后端连接失败';
  }
};

document.getElementById('btnStatus').onclick = async () => {
  const statusDiv = document.getElementById('status');
  try {
    const resp = await fetch('http://localhost:4000/api/status');
    const res = await resp.json();
    statusDiv.innerText = JSON.stringify(res, null, 2);
  } catch (e) {
    statusDiv.innerText = '后端离线';
  }
};
```
- [ ] Step 3 Commit: `feat(bilibili): T8.5·popup 插件弹窗控制面板`
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

## Task T9: C2 badge DOM injection

### T9.1 MutationObserver

> 按 spec §10 R5：Observer scope 只观察 `.reply-warp` / `.reply-list` 子树（不是 `document.body`），避免重型 B 站 DOM 性能问题。观察对象不一定一开始就存在 —— 用"等待 root 出现"的策略。

- [ ] Step 1 Add MutationObserver to `demo/extension/content_script.js`:
```javascript
// ===== T9.1: MutationObserver (narrow scope) =====

let pendingRpids = new Set();
let debounceTimer = null;
let replyObserver = null;

function attachReplyObserver() {
  // B 站评论 root 候选 · 挑第一个命中的
  const root =
    document.querySelector('.reply-warp') ||
    document.querySelector('.reply-list') ||
    document.querySelector('#comment') ||
    null;

  if (!root) return false;
  if (replyObserver) return true; // already attached

  replyObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const items = node.classList?.contains('reply-item')
          ? [node]
          : node.querySelectorAll?.('.reply-item') ?? [];
        items.forEach((item) => {
          const rpid = item.getAttribute('data-id') || item.getAttribute('data-rpid');
          if (rpid) {
            pendingRpids.add(rpid);
            scheduleFetchMarks();
          }
        });
      }
    }
  });
  replyObserver.observe(root, { childList: true, subtree: true });

  // 首次 mount 时扫一次现有 .reply-item（Observer 只吃增量）
  root.querySelectorAll('.reply-item').forEach((item) => {
    const rpid = item.getAttribute('data-id') || item.getAttribute('data-rpid');
    if (rpid) pendingRpids.add(rpid);
  });
  if (pendingRpids.size > 0) scheduleFetchMarks();

  console.log('[Dundao] reply observer attached on', root.className || root.id);
  return true;
}

// 页面加载早期 root 还未 mount · 用一个轻量 interval 轮询到出现为止
function bootReplyObserver() {
  if (attachReplyObserver()) return;
  const pollId = setInterval(() => {
    if (attachReplyObserver()) clearInterval(pollId);
  }, 1000);
  // 最长等 60s，超时就放弃（不是 B 站视频页）
  setTimeout(() => clearInterval(pollId), 60000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootReplyObserver);
} else {
  bootReplyObserver();
}

function scheduleFetchMarks() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchMarks, 500);
}
```

### T9.2 Batch /api/marks fetch
- [ ] Step 1 Implement `fetchMarks` in `demo/extension/content_script.js`:
```javascript
const MARKS_CACHE = new Map();

async function fetchMarks() {
  const rpids = Array.from(pendingRpids).filter(id => !MARKS_CACHE.has(id));
  pendingRpids.clear();
  if (rpids.length === 0) return;

  try {
    const resp = await fetch(`http://localhost:4000/api/marks?rpids=${rpids.join(',')}`);
    const { marks } = await resp.json();
    
    Object.keys(marks).forEach(rpid => {
      MARKS_CACHE.set(rpid, marks[rpid]);
      injectBadge(rpid, marks[rpid]);
    });
  } catch (e) {
    console.warn('[Dundao] Marks fetch failed', e);
  }
}
```

### T9.3 Inject ✅/⏳ badge
- [ ] Step 1 Implement `injectBadge` and styles in `demo/extension/content_script.js`:
```javascript
const style = document.createElement('style');
style.textContent = `
  .dundao-badge {
    display: inline-flex;
    align-items: center;
    background: #f0f7ff;
    color: #008ac5;
    border: 1px solid #cce4ff;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 12px;
    margin-left: 8px;
    cursor: pointer;
    vertical-align: middle;
  }
  .dundao-badge:hover { background: #e0efff; }
  .dundao-badge.pending { color: #ffa500; border-color: #ffe4b5; background: #fffaf0; }
`;
document.head.appendChild(style);

function injectBadge(rpid, info) {
  if (!info.has_my_comment) return;

  const selector = `.reply-item[data-id="${rpid}"], .reply-item[data-rpid="${rpid}"]`;
  const el = document.querySelector(selector);
  if (!el) return;

  const infoArea = el.querySelector('.info') || el.querySelector('.reply-info');
  if (!infoArea || el.querySelector('.dundao-badge')) return;

  const badge = document.createElement('span');
  badge.className = 'dundao-badge' + (info.fulfilled ? '' : ' pending');
  badge.innerText = info.fulfilled ? '✅ 已答' : '⏳ 等待中';
  badge.onclick = (e) => {
    e.stopPropagation();
    const url = info.card_id ? `http://localhost:5173?card_id=${info.card_id}` : 'http://localhost:5173';
    window.open(url, '_blank');
  };

  infoArea.appendChild(badge);
}
```
- [ ] Step 2 Manual smoke — open a B 站 video page where you have commented, scroll to comments, verify badges appear and are clickable.
- [ ] Step 3 Commit: `feat(bilibili): T9.3·badge C2 徽章注入实现`
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

## Self-Review

**Spec coverage**：
- [x] spec §5.1 · manifest.json + content_script + service_worker + popup — T8.1 / T8.2+T9 / T8.3+T8.4 / T8.5
- [x] spec §5.1 · XHR hook at document_start — T8.2 `run_at: document_start`
- [x] spec §5.1 · MutationObserver narrow scope + 500ms debounce — T9.1 / T9.2
- [x] spec §7.1 · POST /api/ingest/comment — T8.2
- [x] spec §7.1 · POST /api/ingest/reply + /api/ingest/top-reply — T8.3
- [x] spec §7.1 · GET /api/marks?rpids=... — T9.2
- [x] spec §7.2 · WS `card.generated` 消费 → chrome.notifications — T8.4

**Placeholder scan**：
- [x] 每个 code block 都是完整可粘贴的 JS/HTML/JSON
- [x] 无 `...` / `TBD` / `similar to above`
- [x] 每 Task 末尾都有 commit step（T8.1/T8.2/T8.3/T8.4/T8.5/T9.3 共 6 次提交）

**Type consistency**：
- `SIGNAL_SOURCE = 'hook'` · T8.2 content_script 发 ingest/comment 不显式带 source（backend 根据路由默认填 `'hook'`）
- `ACTION_SOURCE = 'L1'` / `'L2'` · T8.3 service_worker 显式带 source 字段，匹配 spec §7.1 payload
- `RATE_LIMIT_MS = 1000` · T8.3 `sleep(RATE_LIMIT_MS)` 与父 plan 常量一致
- B 站字段命名防御：`normalizeMsgfeedItem` 对 `item.source_id` / `item.target_id` / `inner.business_id` 做 fallback，覆盖 spec §10 R1

**Extension gaps**：
- manifest `all_frames: true` 会让 iframe 内也注入 content_script · B 站 embed iframe 较少，接受
- icon.png 用 favicon 或 1x1 透明占位 · 品牌 icon 留 v0.3.1
- MV3 service_worker `type: "module"` · 允许 import `ws_client.js` · 注意：WebSocket 在 SW 里可用，但 SW 会在 idle 30s 后休眠，导致 WS 断开；T8.4 的 auto-reconnect 兜底应对

DONE: T8-T9-extension.md written.
