// 端到端冒烟：启动服务、调用三剧本，解析 SSE 流
const BASE = process.env.BASE ?? 'http://localhost:4100';

function assert(cond, msg) {
  if (!cond) { console.error('❌', msg); process.exitCode = 1; throw new Error(msg); }
  console.log('✅', msg);
}

async function parseSse(resp) {
  const events = [];
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (!raw.trim() || raw.startsWith(':')) continue;
      const lines = raw.split('\n');
      let event = 'message', data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:'))  data += line.slice(5).trim();
      }
      try {
        events.push({ event, data: JSON.parse(data) });
      } catch {/* ignore malformed */}
    }
  }
  return events;
}

async function runCase(label, text, expectScript) {
  const resp = await fetch(`${BASE}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  assert(resp.ok, `${label} · 200 OK`);
  assert(resp.headers.get('content-type').includes('text/event-stream'),
    `${label} · content-type 是 SSE`);

  const events = await parseSse(resp);
  const types = events.map((e) => e.event);

  assert(types[0] === 'begin', `${label} · 第一条是 begin`);
  assert(types[types.length - 1] === 'end', `${label} · 最后一条是 end`);
  const end = events[events.length - 1].data;
  assert(end.ok === true, `${label} · end ok=true`);

  const bubbles = events.filter((e) => e.event === 'bubble');
  assert(bubbles.length >= 4, `${label} · 收到 ≥4 条 bubble（实际 ${bubbles.length}）`);

  const post = events.find((e) => e.event === 'postcard');
  assert(!!post, `${label} · 收到 postcard`);
  assert(typeof post.data.postcard.closing === 'string' && post.data.postcard.closing.length > 0,
    `${label} · postcard.closing 非空`);

  assert(end.script === expectScript,
    `${label} · 落在剧本 ${expectScript}（实际 ${end.script}）`);
}

async function main() {
  console.log('== echo smoke:', BASE);

  // reset 一次，确保初态
  const r = await fetch(`${BASE}/api/reset`, { method: 'POST' });
  assert(r.ok, 'reset ok');

  const boot = await (await fetch(`${BASE}/api/state`)).json();
  assert(boot.user?.id === 'echo-user', '/api/state 包含 echo-user');
  assert(boot.memories.length >= 3, '/api/state 至少 3 条 memories');
  assert(boot.presets.length === 3, '/api/state 含 3 个预设');

  await runCase('剧本 A', '蹲链接姐妹们 上衣链接求！', 'A');
  await runCase('剧本 B', '一个月前按稍后再看 忘了看', 'B');
  await runCase('剧本 C', '蹲后续 爷爷真帅', 'C');

  // 边界：空文本
  const empty = await fetch(`${BASE}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '' }),
  });
  assert(empty.status === 400, '空文本 → 400');

  // 边界：已履约再试同剧本 → end ok=false
  const again = await fetch(`${BASE}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '蹲链接姐妹们 上衣链接求！' }),
  });
  const eventsAgain = await parseSse(again);
  const endAgain = eventsAgain[eventsAgain.length - 1];
  assert(endAgain.event === 'end' && endAgain.data.ok === false,
    '重试已履约剧本 → end ok=false');

  // 边界：无效 JSON
  const junk = await fetch(`${BASE}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{nope',
  });
  assert(junk.status === 400, '非法 JSON → 400');

  // 边界：超大 body → 413 JSON（body 用 x 填满超过 MAX_BODY_BYTES=4096）
  const oversize = await fetch(`${BASE}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'x'.repeat(5000) }),
  });
  assert(oversize.status === 413, `超大 body → 413（实际 ${oversize.status}）`);
  const oversizeCt = oversize.headers.get('content-type') || '';
  assert(oversizeCt.includes('application/json'), '超大 body 响应是 JSON');

  // 边界：不在 allowlist 的 origin → 403 JSON，不带 ACAO
  const evil = await fetch(`${BASE}/api/state`, {
    headers: { Origin: 'https://evil.example.com' },
  });
  assert(evil.status === 403, `恶意 origin → 403（实际 ${evil.status}）`);
  assert(!evil.headers.get('access-control-allow-origin'),
    '恶意 origin · 不带 ACAO 头');

  // 断连取消：开一条流，begin 刚到就中止，后续再发同一条 → 仍可成功（未消耗履约）
  await fetch(`${BASE}/api/reset`, { method: 'POST' });
  const ctrl = new AbortController();
  const abortable = fetch(`${BASE}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '蹲链接姐妹们 上衣链接求！' }),
    signal: ctrl.signal,
  });
  // 让 begin 过来，然后切断
  await new Promise((r) => setTimeout(r, 250));
  ctrl.abort();
  await abortable.catch(() => {/* expected */});
  // 等至少 2.5s 保证服务端已经跑到履约前且能感知到 abort
  await new Promise((r) => setTimeout(r, 2800));
  const retryResp = await fetch(`${BASE}/api/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '蹲链接姐妹们 上衣链接求！' }),
  });
  const retryEvents = await parseSse(retryResp);
  const retryEnd = retryEvents[retryEvents.length - 1];
  assert(
    retryEnd.event === 'end' && retryEnd.data.ok === true,
    `断连取消 · 再次发送可成功（实际 end=${JSON.stringify(retryEnd.data)}）`,
  );

  console.log('\n🎉 echo smoke all green');
}

main().catch((err) => {
  console.error('\n🔥 echo smoke failed:', err.message);
  process.exitCode = 1;
});
