// 端到端冒烟测试：启动后端进程外的客户端 —— 走 HTTP + WS 完整链路
// 使用：node src/smoke.js （前提：node src/server.js 已启动）
import WebSocket from 'ws';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';

const CASES = [
  { script: 'A', text: '蹲链接姐妹们 上衣链接求！', expectPages: ['P1', 'P2'] },
  { script: 'B', text: '一个月前按稍后再看 忘了看', expectPages: ['P1', 'P3'] },
  { script: 'C', text: '蹲后续 爷爷真帅',           expectPages: ['P1', 'P2', 'P3'] },
];

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
  const res = await fetch(`${BASE}/api/reset`, { method: 'POST' });
  assert(res.ok, 'reset endpoint 返回 2xx');
}

function waitForFrames(ws, { matchEnd }) {
  return new Promise((resolve, reject) => {
    const frames = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.removeListener('message', onMsg);
      reject(new Error('frame wait timeout'));
    }, 15000);

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
    const ws = new WebSocket(WS_URL);
    const timer = setTimeout(() => reject(new Error('ws open timeout')), 5000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  console.log('== smoke:', BASE);
  await resetDemo();

  // Bootstrap 检查
  const boot = await (await fetch(`${BASE}/api/bootstrap`)).json();
  assert(boot.user?.id === 'demo-user', 'bootstrap 含 demo-user');
  assert(boot.presets?.length >= 3, 'bootstrap 含 >=3 预设评论');
  assert(boot.history?.length >= 5, 'bootstrap 含 >=5 历史信号');
  assert(boot.feed?.length >= 6, 'bootstrap 含 >=6 填充信息流');
  assert(boot.cards?.length === 0, 'bootstrap 初始卡片为空');

  const ws = await openWs();
  await waitForFrames(ws, { matchEnd: (m) => m.type === 'ws.hello' });

  for (const tc of CASES) {
    console.log(`\n-- 剧本 ${tc.script}: ${tc.text}`);

    const waitFrames = waitForFrames(ws, {
      matchEnd: (m) => m.type === 'workflow.end',
    });

    const resp = await fetch(`${BASE}/api/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: tc.text }),
    });
    const respJson = await resp.json();
    assert(respJson.ok === true, `剧本 ${tc.script} · /api/comment 返回 ok`);
    assert(typeof respJson.runId === 'string' && respJson.runId.startsWith('run_'),
      `剧本 ${tc.script} · 响应含 runId`);

    const frames = await waitFrames;
    const runFrames = frames.filter(
      (f) => f.type === 'workflow.step' && f.payload.run_id === respJson.runId,
    );
    const steps = runFrames.map((f) => f.payload.step);
    assert(JSON.stringify(steps) === JSON.stringify([1, 2, 3, 4, 5]),
      `剧本 ${tc.script} · 收到 5 个同 runId 的工作流步骤（实际：${JSON.stringify(steps)}）`);

    const cardFrame = frames.find((f) => f.type === 'card.generated');
    assert(!!cardFrame, `剧本 ${tc.script} · 收到 card.generated 事件`);
    assert(cardFrame.payload.run_id === respJson.runId,
      `剧本 ${tc.script} · card.generated run_id 匹配`);
    const card = cardFrame.payload.card;
    const pageIds = card.pages.map((p) => p.id);
    assert(card.script_id === tc.script, `剧本 ${tc.script} · script_id 匹配`);
    assert(JSON.stringify(pageIds) === JSON.stringify(tc.expectPages),
      `剧本 ${tc.script} · 多页结构 ${JSON.stringify(tc.expectPages)}（实际：${JSON.stringify(pageIds)}）`);

    const p1 = card.pages[0];
    assert(p1.context_line?.startsWith('你') && /(前|天|周|月)/.test(p1.context_line),
      `剧本 ${tc.script} · P1 情景锚点格式合规：${p1.context_line}`);
  }

  // 最终状态检查
  const finalBoot = await (await fetch(`${BASE}/api/bootstrap`)).json();
  assert(finalBoot.cards.length === 3, `结束后 /api/bootstrap 返回 3 张卡片（实际 ${finalBoot.cards.length}）`);

  // 边界：空评论应返回 400
  const badResp = await fetch(`${BASE}/api/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '' }),
  });
  assert(badResp.status === 400, '空评论返回 400');

  // 边界：超长评论应返回 400
  const longResp = await fetch(`${BASE}/api/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'x'.repeat(141) }),
  });
  assert(longResp.status === 400, '超长评论（>140）返回 400');

  // 并发去重：reset 后同一时刻发两条相同评论，仅应产生 1 张卡片，第二条返回 signal-already-fulfilled
  await resetDemo();
  const [concA, concB] = await Promise.all([
    fetch(`${BASE}/api/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '蹲链接姐妹们 上衣链接求！' }),
    }).then((r) => r.json()),
    fetch(`${BASE}/api/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '蹲链接姐妹们 上衣链接求！' }),
    }).then((r) => r.json()),
  ]);
  const okCount = [concA, concB].filter((r) => r.ok).length;
  const dupReason = [concA, concB].filter((r) => !r.ok).map((r) => r.reason);
  assert(okCount === 1, `并发去重 · 仅 1 条成功（实际 ${okCount} · 另一条 reason=${JSON.stringify(dupReason)}）`);
  assert(dupReason.includes('signal-already-fulfilled'),
    '并发去重 · 失败方 reason=signal-already-fulfilled');

  const postConcurrentBoot = await (await fetch(`${BASE}/api/bootstrap`)).json();
  assert(postConcurrentBoot.cards.length === 1,
    `并发去重 · DB 最终仅 1 张卡片（实际 ${postConcurrentBoot.cards.length}）`);

  ws.close();
  console.log('\n🎉 smoke all green');
}

main().catch((err) => {
  console.error('\n🔥 smoke failed:', err.message);
  process.exitCode = 1;
});
