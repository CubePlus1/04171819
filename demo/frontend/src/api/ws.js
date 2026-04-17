// 轻量 WebSocket 封装：带自动重连 + 手动关闭保护
export function connectWs({ onMessage, onOpen, onClose, onError } = {}) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws`;

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
