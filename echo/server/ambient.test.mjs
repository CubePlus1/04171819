// 进程级测试：启动一份 server（AMBIENT_INTERVAL_MS=300），连上 GET /api/ambient，
// 断言服务器按节奏自动推出 3 轮 postcard，然后发 idle 事件，且断连后生成器会取消。
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, './server.mjs');

function startServer(env) {
  const port = 4200 + Math.floor(Math.random() * 100);
  const child = spawn('node', [SERVER_PATH], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { child, port, base: `http://localhost:${port}` };
}

function waitForReady(child, timeoutMs = 4000) {
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

async function collectAmbient(base, { signal, maxMs = 8000 }) {
  const resp = await fetch(`${base}/api/ambient`, { signal });
  assert.ok(resp.ok, `GET /api/ambient ok (${resp.status})`);
  const events = [];
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (!raw.trim() || raw.startsWith(':')) continue;
      let event = 'message', data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      try {
        events.push({ event, data: JSON.parse(data) });
      } catch {/* ignore */}
    }
    if (events.some((e) => e.event === 'idle')) break;
  }
  return events;
}

await runCase('ambient · 自动推出 3 轮 postcard + idle', async () => {
  const { child, base } = startServer({ AMBIENT_INTERVAL_MS: '300', AMBIENT_KICKOFF_MS: '100' });
  try {
    await waitForReady(child);
    const ctrl = new AbortController();
    const events = await collectAmbient(base, { signal: ctrl.signal, maxMs: 12000 });
    ctrl.abort();

    const postcards = events.filter((e) => e.event === 'postcard');
    assert.equal(postcards.length, 3, `应收到 3 张明信片，实际 ${postcards.length}`);

    const scripts = new Set(postcards.map((p) => p.data.postcard.kind));
    assert.deepEqual(
      [...scripts].sort(),
      ['product', 'sequel', 'series'].sort(),
      `三种剧本都出现：实际 ${[...scripts].join(',')}`,
    );

    const idle = events.find((e) => e.event === 'idle');
    assert.ok(idle, '收到 idle 事件');
    assert.equal(idle.data.pending, false, 'idle.pending=false');

    // mind 契约：每个 bubble 和 postcard 都必须携带 mind.phase
    const bubbles = events.filter((e) => e.event === 'bubble');
    const missingMind = bubbles.filter((e) => !e.data.mind?.phase);
    assert.equal(missingMind.length, 0, `所有 bubble 都含 mind.phase（缺失 ${missingMind.length}）`);
    const missingPostMind = postcards.filter((e) => !e.data.mind?.phase);
    assert.equal(missingPostMind.length, 0, '所有 postcard 都含 mind.phase');

    // 首轮 happy path 应按 scan/recall/match/seal/emit 顺序出现
    const firstRun = events.slice(0, events.findIndex((e) => e.event === 'postcard') + 1);
    const phases = firstRun
      .filter((e) => e.event === 'bubble' || e.event === 'postcard')
      .map((e) => e.data.mind?.phase);
    assert.deepEqual(
      phases,
      ['scan', 'recall', 'match', 'seal', 'emit'],
      `首轮 mind 相位序列（实际 ${JSON.stringify(phases)}）`,
    );

    // scan 阶段应下发完整 nodes
    const scanBubble = bubbles.find((e) => e.data.mind?.phase === 'scan');
    assert.ok(
      Array.isArray(scanBubble.data.mind.nodes) && scanBubble.data.mind.nodes.length > 0,
      `scan 阶段 mind.nodes 非空（实际 ${scanBubble?.data.mind?.nodes?.length}）`,
    );
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});

await runCase('ambient · 客户端断连 → 服务器生成器被取消', async () => {
  const { child, base } = startServer({ AMBIENT_INTERVAL_MS: '300', AMBIENT_KICKOFF_MS: '100' });
  try {
    await waitForReady(child);
    const ctrl = new AbortController();
    const p = fetch(`${base}/api/ambient`, { signal: ctrl.signal });
    // 让第一条 bubble 过来
    await new Promise((r) => setTimeout(r, 400));
    ctrl.abort();
    await p.catch(() => {/* expected */});

    // 等一下，保证 server 端 abort 已传达
    await new Promise((r) => setTimeout(r, 500));

    // 再次连接，应该还能继续接下去（说明服务器没被卡死）
    const ctrl2 = new AbortController();
    const events = await collectAmbient(base, { signal: ctrl2.signal, maxMs: 8000 });
    ctrl2.abort();
    assert.ok(events.length > 0, '重连后仍能收到事件');
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});

await runCase('ambient · reset 后可以从头开始', async () => {
  const { child, base } = startServer({ AMBIENT_INTERVAL_MS: '300', AMBIENT_KICKOFF_MS: '100' });
  try {
    await waitForReady(child);

    // 第一轮：接完 3 张
    let ctrl = new AbortController();
    const first = await collectAmbient(base, { signal: ctrl.signal, maxMs: 12000 });
    ctrl.abort();
    const firstCards = first.filter((e) => e.event === 'postcard');
    assert.equal(firstCards.length, 3, '第一轮 3 张');

    // reset 重置
    const r = await fetch(`${base}/api/reset`, { method: 'POST' });
    assert.ok(r.ok, 'reset 成功');

    // 第二轮：应该又能接完 3 张
    ctrl = new AbortController();
    const second = await collectAmbient(base, { signal: ctrl.signal, maxMs: 12000 });
    ctrl.abort();
    const secondCards = second.filter((e) => e.event === 'postcard');
    assert.equal(secondCards.length, 3, `第二轮也应 3 张，实际 ${secondCards.length}`);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});

if (process.exitCode) {
  console.error('\n🔥 ambient tests failed');
  process.exit(1);
} else {
  console.log('\n🎉 ambient tests green');
}
