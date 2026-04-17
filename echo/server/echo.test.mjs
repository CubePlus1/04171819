// 纯单测：钉住剧本分类 + postcard 契约。不起 server、不碰 SSE。
import { strict as assert } from 'node:assert';
import { runEcho } from './echo.mjs';
import { resetState } from './store.mjs';

async function collect(gen) {
  const events = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

function endOf(events) {
  return events[events.length - 1];
}

async function runCase(label, fn) {
  try {
    resetState();
    await fn();
    console.log('✅', label);
  } catch (err) {
    console.error('❌', label, '\n  →', err.message);
    process.exitCode = 1;
  }
}

await runCase('剧本 A · 蹲链接 · postcard.kind=product · closing 与 script 一致', async () => {
  // sleep 注入 0ms，直接穿过所有等待
  const events = await collect(runEcho({ text: '蹲链接姐妹们 上衣链接求！', sleep: () => Promise.resolve() }));
  const end = endOf(events);
  assert.equal(end.type, 'end');
  assert.equal(end.payload.ok, true);
  assert.equal(end.payload.script, 'A');
  const post = events.find((e) => e.type === 'postcard');
  assert.ok(post, '含 postcard');
  assert.equal(post.payload.postcard.kind, 'product');
  assert.match(post.payload.postcard.closing, /接住/);
});

await runCase('剧本 B · 系列追更 · postcard.kind=series', async () => {
  const events = await collect(runEcho({ text: '一个月前按稍后再看 忘了看', sleep: () => Promise.resolve() }));
  const end = endOf(events);
  assert.equal(end.payload.script, 'B');
  const post = events.find((e) => e.type === 'postcard');
  assert.equal(post.payload.postcard.kind, 'series');
  assert.match(post.payload.postcard.closing, /接上/);
});

await runCase('剧本 C · 蹲后续 · postcard.kind=sequel · 爷爷收束', async () => {
  const events = await collect(runEcho({ text: '蹲后续 爷爷真帅', sleep: () => Promise.resolve() }));
  const end = endOf(events);
  assert.equal(end.payload.script, 'C');
  const post = events.find((e) => e.type === 'postcard');
  assert.equal(post.payload.postcard.kind, 'sequel');
  assert.match(post.payload.postcard.closing, /后续|等到/);
});

await runCase('未知意图 → no-match，且没有 postcard', async () => {
  const events = await collect(runEcho({ text: '今天天气真好啊', sleep: () => Promise.resolve() }));
  const end = endOf(events);
  assert.equal(end.payload.ok, false);
  assert.equal(end.payload.reason, 'no-match');
  assert.ok(!events.some((e) => e.type === 'postcard'));
});

await runCase('同剧本再次跑 → already-fulfilled', async () => {
  await collect(runEcho({ text: '蹲链接姐妹们 上衣链接求！', sleep: () => Promise.resolve() }));
  const second = await collect(runEcho({ text: '蹲链接姐妹们 上衣链接求！', sleep: () => Promise.resolve() }));
  const end = endOf(second);
  assert.equal(end.payload.ok, false);
  assert.equal(end.payload.reason, 'already-fulfilled');
});

if (process.exitCode) {
  console.error('\n🔥 echo unit tests failed');
  process.exit(1);
} else {
  console.log('\n🎉 echo unit tests green');
}
