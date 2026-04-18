// 端到端冒烟：走 primary ambient 路径 + 保留 /api/comment 遗留路径回归
import WebSocket from 'ws';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
const ORIGIN = process.env.SMOKE_ORIGIN ?? 'http://localhost:5173';

function assert(cond, msg) {
  if (!cond) {
    console.error('❌', msg);
    process.exitCode = 1;
    throw new Error(msg);
  } else {
    console.log('✅', msg);
  }
}

async function resetDemo() {
  const res = await fetch(`${BASE}/api/reset`, { method: 'POST', headers: { Origin: ORIGIN } });
  assert(res.ok, 'reset endpoint 返回 2xx');
}

function waitForFrames(ws, { matchEnd, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const frames = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.removeListener('message', onMsg);
      reject(new Error('frame wait timeout'));
    }, timeoutMs);

    function onMsg(raw) {
      try {
        const msg = JSON.parse(raw.toString());
        frames.push(msg);
        if (matchEnd(msg)) {
          settled = true;
          clearTimeout(timer);
          ws.removeListener('message', onMsg);
          resolve(frames);
        }
      } catch (err) {
        settled = true;
        clearTimeout(timer);
        ws.removeListener('message', onMsg);
        reject(err);
      }
    }
    ws.on('message', onMsg);
  });
}

function openWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, { origin: ORIGIN });
    const timer = setTimeout(() => reject(new Error('ws open timeout')), 5000);
    ws.once('open', () => { clearTimeout(timer); resolve(ws); });
    ws.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function ambientTick(body = {}) {
  const r = await fetch(`${BASE}/api/ambient/tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

async function main() {
  console.log('== smoke:', BASE);
  await resetDemo();

  const boot = await (await fetch(`${BASE}/api/bootstrap`)).json();
  assert(boot.user?.id === 'demo-user', 'bootstrap 含 demo-user');
  assert(Array.isArray(boot.triggers) && boot.triggers.length === 3, 'bootstrap 含 3 个剧本触发器');
  assert(boot.pending === true, 'bootstrap.pending=true（还有未履约信号）');
  assert(boot.history.length >= 3, 'bootstrap 含 >=3 历史信号');
  assert(boot.feed.length >= 6, 'bootstrap 含 >=6 填充信息流');
  assert(boot.cards.length === 0, 'bootstrap 初始卡片为空');

  const ws = await openWs();
  await waitForFrames(ws, { matchEnd: (m) => m.type === 'ws.hello' });

  // ========== Primary path · ambient tick 按 topic 精确触发 ==========
  const SCRIPTS = [
    { topic: 'storage-haul',        expectScript: 'A', expectPages: ['P1', 'P2'] },
    { topic: 'missing-bf',          expectScript: 'B', expectPages: ['P1', 'P3'] },
    { topic: 'editing-transition',  expectScript: 'C', expectPages: ['P1', 'P2', 'P3'] },
  ];

  for (const tc of SCRIPTS) {
    console.log(`\n-- ambient topic=${tc.topic}`);
    const waitFrames = waitForFrames(ws, { matchEnd: (m) => m.type === 'workflow.end' });
    const { status, body: r } = await ambientTick({ topic: tc.topic });
    assert(status === 200, `ambient tick 200（实际 ${status}）`);
    assert(r.ok === true, `ambient ok`);
    assert(typeof r.runId === 'string' && r.runId.startsWith('run_'), `ambient 响应含 runId`);

    const frames = await waitFrames;
    const run = frames.filter((f) => f.type === 'workflow.step' && f.payload.run_id === r.runId);
    const steps = run.map((f) => f.payload.step);
    assert(JSON.stringify(steps) === JSON.stringify([1, 2, 3, 4, 5]),
      `收到 5 步（实际 ${JSON.stringify(steps)}）`);
    assert(run.every((f) => f.payload.ambient === true), '所有 step 都带 ambient:true 标记');

    // 每一条 workflow.step 都必须带 mind.phase（契约）
    const phasesActual = run.map((f) => f.payload.mind?.phase);
    const phasesExpect = ['scan', 'recall', 'match', 'seal', 'emit'];
    assert(
      JSON.stringify(phasesActual) === JSON.stringify(phasesExpect),
      `mind.phase 序列正确（实际 ${JSON.stringify(phasesActual)}）`,
    );
    const scanFrame = run.find((f) => f.payload.step === 1);
    assert(
      Array.isArray(scanFrame?.payload.mind?.nodes) && scanFrame.payload.mind.nodes.length > 0,
      `mind.nodes 在 step 1 下发完整快照（实际 ${scanFrame?.payload.mind?.nodes?.length}）`,
    );
    const matchFrame = run.find((f) => f.payload.step === 3);
    assert(
      matchFrame?.payload.mind?.focus_signal_id?.startsWith('signal:') &&
        matchFrame?.payload.mind?.focus_action_id?.startsWith('action:'),
      'match 阶段携带 focus_signal_id / focus_action_id',
    );

    const cardFrame = frames.find((f) => f.type === 'card.generated' && f.payload.run_id === r.runId);
    assert(!!cardFrame, `topic=${tc.topic} · 收到 card.generated`);
    const card = cardFrame.payload.card;
    assert(card.script_id === tc.expectScript,
      `topic=${tc.topic} · script ${tc.expectScript}（实际 ${card.script_id}）`);
    assert(JSON.stringify(card.pages.map((p) => p.id)) === JSON.stringify(tc.expectPages),
      `topic=${tc.topic} · 页面 ${JSON.stringify(tc.expectPages)}`);
    assert(card.pages[0].context_line?.startsWith('你'), 'P1 情景锚点以 "你" 开头');
  }

  // Figma 三场景 · 三张卡接完后所有 topic 都履约 · pending 应为 false
  const afterThree = await (await fetch(`${BASE}/api/bootstrap`)).json();
  assert(afterThree.pending === false, '3 topic 接完后 pending=false');
  assert(afterThree.cards.length === 3, '当前 bootstrap 返回 3 张卡片');

  // ========== 再 tick 一次应 no-match（已全部履约）==========
  const drainR = await ambientTick({});
  assert(drainR.body.ok === false, 'drain 后再 ambient tick ok=false');
  assert(drainR.body.reason === 'no-match',
    `drain 后 reason=no-match（实际 ${drainR.body.reason}）`);

  // ========== 自动 ambient（无 topic）· reset 后应能挑到第一条 ==========
  await resetDemo();
  const auto = await ambientTick({});
  assert(auto.body.ok === true, 'ambient · 无参数时能挑到下一条');
  assert(typeof auto.body.pending === 'boolean', 'ambient 响应含 pending 标记');

  // ========== 并发去重 · 同 topic 两条并发应只落一张卡 ==========
  await resetDemo();
  const [concA, concB] = await Promise.all([
    ambientTick({ topic: 'storage-haul' }),
    ambientTick({ topic: 'storage-haul' }),
  ]);
  const okCount = [concA, concB].filter((r) => r.body.ok).length;
  const dupReasons = [concA, concB].filter((r) => !r.body.ok).map((r) => r.body.reason);
  assert(okCount === 1, `并发去重 · 仅 1 条成功（实际 ${okCount}）`);
  assert(dupReasons.includes('signal-already-fulfilled'),
    '并发去重 · 失败方 reason=signal-already-fulfilled');

  // ========== 边界 · 非法 JSON / evil origin / 413 ==========
  const junk = await fetch(`${BASE}/api/ambient/tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: '{not json',
  });
  assert(junk.status === 400, '非法 JSON 返回 400');
  assert((junk.headers.get('content-type') || '').includes('application/json'),
    '非法 JSON 返回 application/json');

  const evil = await fetch(`${BASE}/api/bootstrap`, { headers: { Origin: 'https://evil.example.com' } });
  assert(evil.status === 500 || evil.status === 403,
    `恶意 origin 被拒（status=${evil.status}）`);
  const acao = evil.headers.get('access-control-allow-origin');
  assert(!acao || !acao.includes('evil.example.com'), '恶意 origin 不在 ACAO');

  // ========== 遗留 /api/comment 路径仍可用（不做硬性回归，只确保不 500） ==========
  await resetDemo();
  const legacy = await fetch(`${BASE}/api/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ text: '求链接姐妹们' }),
  });
  assert(legacy.ok, '/api/comment 遗留路径仍 200');
  const legacyBody = await legacy.json();
  assert(legacyBody.ok === true, '/api/comment 遗留路径 ok=true');

  ws.close();
  console.log('\n🎉 smoke all green');
}

main().catch((err) => {
  console.error('\n🔥 smoke failed:', err.message);
  process.exitCode = 1;
});
