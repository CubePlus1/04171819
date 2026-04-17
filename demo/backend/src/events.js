// WebSocket 广播：所有连接的客户端都能收到工作流事件和卡片事件
import { WebSocketServer } from 'ws';
import { createLogger } from './logger.js';

const log = createLogger('ws');

export function createBroadcaster(httpServer, { path = '/ws' } = {}) {
  const wss = new WebSocketServer({ server: httpServer, path });

  wss.on('connection', (socket, req) => {
    log.info('client connected', { remote: req.socket.remoteAddress, count: wss.clients.size });
    socket.send(JSON.stringify({ type: 'ws.hello', ts: Date.now() }));

    socket.on('close', () => log.info('client left', { count: wss.clients.size }));
    socket.on('error', (err) => log.warn('socket error', { err: err.message }));
  });

  function broadcast(type, payload) {
    const frame = JSON.stringify({ type, ts: Date.now(), payload });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(frame);
      }
    }
  }

  return { wss, broadcast };
}
