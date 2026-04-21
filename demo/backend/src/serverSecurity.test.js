import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { createBroadcaster } from './events.js';
import { isOriginAllowed, LISTEN_HOST } from './server.js';

function runCase(label, fn) {
  return fn()
    .then(() => console.log('✅', label))
    .catch((err) => {
      console.error('❌', label, '\n   →', err.message);
      process.exitCode = 1;
    });
}

async function withWsServer(run) {
  const httpServer = createServer((_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  const { wss } = createBroadcaster(httpServer, {
    path: '/ws',
    isOriginAllowed,
  });

  await new Promise((resolve) => httpServer.listen(0, LISTEN_HOST, resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to resolve ws test server address');
  }

  try {
    await run(`ws://${LISTEN_HOST}:${address.port}/ws`);
  } finally {
    for (const client of wss.clients) {
      client.terminate();
    }
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve, reject) => httpServer.close((err) => (err ? reject(err) : resolve())));
  }
}

function openWs(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    ws.__frames = [];
    ws.on('message', (raw) => {
      ws.__frames.push(JSON.parse(raw.toString()));
    });
    ws.once('open', () => resolve(ws));
    ws.once('error', (err) => reject(err));
  });
}

async function waitForHello(ws, { attempts = 20, delayMs = 10 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const frame = ws.__frames.find((entry) => entry.type === 'ws.hello');
    if (frame) {
      return frame;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('ws.hello not received in time');
}

await runCase('loopback origin policy rejects missing and LAN origins', async () => {
  assert.equal(LISTEN_HOST, '127.0.0.1');
  assert.equal(isOriginAllowed(undefined), false);
  assert.equal(isOriginAllowed(null), false);
  assert.equal(isOriginAllowed('http://localhost:5173'), true);
  assert.equal(isOriginAllowed('http://127.0.0.1:5173'), true);
  assert.equal(isOriginAllowed('http://192.168.1.8:5173'), false);
});

await runCase('ws verifyClient rejects missing origin and accepts loopback origin', async () => {
  await withWsServer(async (url) => {
    await assert.rejects(openWs(url), /403|Unexpected server response: 403/u);

    const ws = await openWs(url, { origin: 'http://127.0.0.1:5173' });
    const frame = await waitForHello(ws);
    assert.equal(frame.type, 'ws.hello');
    ws.terminate();
  });
});

if (process.exitCode) {
  console.error('\n🔥 server security tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 server security tests green');
}
