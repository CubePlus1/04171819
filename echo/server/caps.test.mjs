// 并发流 / rate-limit 的进程级测试：spawn 一份带特定 env 的 server，测完即杀
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, './server.mjs');

function startServer(env) {
  const port = 4100 + Math.floor(Math.random() * 100);
  const child = spawn('node', [SERVER_PATH], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { child, port, base: `http://localhost:${port}` };
}

async function waitForReady(child, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server not ready')), timeoutMs);
    child.stdout.on('data', (b) => {
      if (b.toString().includes('listening on')) {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

async function runCase(label, fn) {
  try {
    await fn();
    console.log('✅', label);
  } catch (err) {
    console.error('❌', label, '\n  →', err.message);
    process.exitCode = 1;
  }
}

await runCase('per-ip 并发上限 · MAX_STREAMS_PER_IP=1', async () => {
  const { child, base } = startServer({ MAX_STREAMS_PER_IP: '1' });
  try {
    await waitForReady(child);
    const s1 = fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '蹲链接姐妹们 上衣链接求！' }),
    });
    await new Promise((r) => setTimeout(r, 80));
    const s2 = await fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '蹲后续 爷爷真帅' }),
    });
    assert.equal(s2.status, 429, `second should be 429, got ${s2.status}`);
    const body = await s2.json();
    assert.equal(body.error, 'too-many-streams');
    assert.equal(body.scope, 'ip');
    await s1.then((r) => r.body?.cancel?.());
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});

await runCase('rate-limit 溢出 · RL_CAP=1 RL_REFILL=0.01', async () => {
  const { child, base } = startServer({ RL_CAP: '1', RL_REFILL: '0.01' });
  try {
    await waitForReady(child);
    const r1 = await fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '蹲链接姐妹们 上衣链接求！' }),
    });
    // drain r1 body so it doesn't hold the stream
    const reader = r1.body.getReader();
    while (!(await reader.read()).done) {}
    const r2 = await fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '蹲后续 爷爷真帅' }),
    });
    assert.equal(r2.status, 429, `second should be 429, got ${r2.status}`);
    const body = await r2.json();
    assert.equal(body.error, 'rate-limited');
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});

await runCase('SIGTERM 活跃流下仍能快速退出', async () => {
  const { child, base } = startServer({});
  try {
    await waitForReady(child);
    const active = fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '蹲链接姐妹们 上衣链接求！' }),
    });
    // 等第一个 chunk
    const resp = await active;
    const reader = resp.body.getReader();
    await reader.read();
    const t0 = Date.now();
    child.kill('SIGTERM');
    await once(child, 'exit');
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 3000, `SIGTERM exit in <3s, got ${elapsed}ms`);
  } finally {
    // 兜底
    if (!child.killed) child.kill('SIGKILL');
  }
});

if (process.exitCode) {
  console.error('\n🔥 echo caps tests failed');
  process.exit(1);
} else {
  console.log('\n🎉 echo caps tests green');
}
