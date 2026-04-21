export class DWSClient {
  constructor(url, { reconnectDelayMs = 5000 } = {}) {
    this.url = url;
    this.reconnectDelayMs = reconnectDelayMs;
    this.ws = null;
    this.onCardGenerated = null;
    this.onFrame = null;
    this.reconnectTimer = null;
    this.closedByUser = false;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.closedByUser = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[Dundao] WS connected');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = (event) => {
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch (error) {
        console.warn('[Dundao] WS parse failed', error);
        return;
      }

      if (typeof this.onFrame === 'function') {
        this.onFrame(frame);
      }

      if (frame?.type === 'card.generated' && typeof this.onCardGenerated === 'function') {
        this.onCardGenerated(frame.payload);
      }
    };

    this.ws.onerror = (error) => {
      console.warn('[Dundao] WS error', error);
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) {
        return;
      }

      console.log('[Dundao] WS closed, reconnect scheduled');
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, this.reconnectDelayMs);
      }
    };
  }

  disconnect() {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
