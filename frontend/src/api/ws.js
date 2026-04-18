// 轻量 WebSocket 封装：带自动重连 + 手动关闭保护
//
// Dev（vite :5173）下直连 backend :4000，绕过 vite ws proxy。
// 观察到 vite 的 /ws proxy 在 HMR 频繁重载时会 ECONNRESET · 导致前端
// 永远连不上 · "自动接" 永远启不来。直连解决得一劳永逸 · backend 的
// CORS allowlist 已含 localhost:5173。
// Prod（同域部署）仍按当前 host 拼。
export function connectWs({ onMessage, onOpen, onClose, onError } = {}) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const isLocalDev = location.port === '5173' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const host = isLocalDev ? 'localhost:4000' : location.host;
  const url = `${proto}://${host}/ws`;

  let ws = null;
  let closedByUser = false;
  let retryTimer = null;
  let retryDelay = 1000;

  function open() {
    ws = new WebSocket(url);

    ws.addEventListener('open', () => {
      retryDelay = 1000;
      onOpen?.();
    });

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch (err) {
        onError?.(err);
      }
    });

    ws.addEventListener('close', () => {
      onClose?.();
      if (closedByUser) return;
      retryTimer = setTimeout(open, retryDelay);
      retryDelay = Math.min(retryDelay * 1.6, 8000);
    });

    ws.addEventListener('error', (e) => onError?.(e));
  }

  open();

  return {
    close() {
      closedByUser = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    },
  };
}
