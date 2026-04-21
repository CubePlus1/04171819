import { strict as assert } from 'node:assert';
import { createBilibiliClient, MAX_RETRIES, RATE_LIMIT_MS } from './bilibili.js';

function createClock(start = 0) {
  let nowValue = start;
  const sleeps = [];
  return {
    now: () => nowValue,
    sleep: async (ms) => {
      sleeps.push(ms);
      nowValue += ms;
    },
    sleeps,
  };
}

function createResponse(json, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return json;
    },
  };
}

async function runCase(label, fn) {
  try {
    await fn();
    console.log('✅', label);
  } catch (err) {
    console.error('❌', label, '\n   →', err.message);
    process.exitCode = 1;
  }
}

await runCase('fetchMsgfeedReply sends SESSDATA cookie and normalizes cursor payload', async () => {
  const calls = [];
  const clock = createClock();
  const client = createBilibiliClient({
    fetchImpl: async (url, init) => {
      calls.push({ url, init, at: clock.now() });
      return createResponse({
        code: 0,
        data: {
          cursor: { is_end: false, next: 'cursor-2' },
          items: [{
            source_id: 99887766,
            source_content: '蹲 BGM',
            business_id: 112233,
            title: '深夜歌单',
            reply_content: 'BGM 是陈粒 - 芳草地',
            mid_replier: 654321,
            replier_name: '路人甲',
            like: 520,
            is_up: false,
            is_top: false,
            rpid: 900001,
            occurred_at: '2026-04-21T11:00:00+08:00',
          }],
        },
      });
    },
    now: clock.now,
    sleepImpl: clock.sleep,
  });

  const result = await client.fetchMsgfeedReply({ sessdata: 'COOKIE_VALUE', cursor: 'cursor-1', ps: 20 });
  assert.match(calls[0].url, /\/x\/msgfeed\/reply\?/);
  assert.match(calls[0].url, /cursor=cursor-1/);
  assert.equal(calls[0].init.headers.Cookie, 'SESSDATA=COOKIE_VALUE');
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, 'cursor-2');
  assert.equal(result.replies[0].source_id, 99887766);
  assert.equal(result.replies[0].like_count, 520);
});

await runCase('fetchVideoReplies normalizes hot replies', async () => {
  const client = createBilibiliClient({
    fetchImpl: async () => createResponse({
      code: 0,
      data: {
        page: { num: 1, size: 20 },
        replies: [{
          rpid: 700001,
          member: { mid: '123456', uname: '大山' },
          content: { message: '链接：旗舰店在这里' },
          like: 42,
          is_top: false,
          is_up: true,
          occurred_at: '2026-04-21T11:10:00+08:00',
        }],
      },
    }),
  });

  const result = await client.fetchVideoReplies({ aid: 112233, sort: 2, ps: 20 });
  assert.equal(result.page.num, 1);
  assert.equal(result.page.size, 20);
  assert.equal(result.replies[0].rpid, 700001);
  assert.equal(result.replies[0].replier_mid, 123456);
  assert.equal(result.replies[0].content, '链接：旗舰店在这里');
});

await runCase('fetchVideoView normalizes owner and pinned reply', async () => {
  const client = createBilibiliClient({
    fetchImpl: async () => createResponse({
      code: 0,
      data: {
        title: '焦糖褐色外套开箱',
        desc: '春装合集',
        owner: { mid: 123456, name: '大山', face: 'https://face.example/avatar.png' },
        top_reply: {
          rpid: 777001,
          member: { mid: 123456, uname: '大山' },
          content: { message: '置顶答案在这里' },
        },
      },
    }),
  });

  const result = await client.fetchVideoView({ aid: 112233 });
  assert.equal(result.title, '焦糖褐色外套开箱');
  assert.equal(result.owner.mid, 123456);
  assert.equal(result.owner.name, '大山');
  assert.equal(result.pinned_reply.rpid, 777001);
  assert.equal(result.pinned_reply.content, '置顶答案在这里');
});

await runCase('client retries 3x with exponential backoff', async () => {
  let attempts = 0;
  const clock = createClock();
  const client = createBilibiliClient({
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < MAX_RETRIES) {
        return createResponse({ code: -1, message: 'temporary error' }, { ok: false, status: 503 });
      }
      return createResponse({
        code: 0,
        data: {
          title: '补货视频',
          desc: '',
          owner: { mid: 1, name: 'UP', face: '' },
          top_reply: null,
        },
      });
    },
    now: clock.now,
    sleepImpl: clock.sleep,
  });

  const result = await client.fetchVideoView({ aid: 9988 });
  assert.equal(MAX_RETRIES, 4);
  assert.equal(attempts, 4);
  assert.deepEqual(clock.sleeps, [RATE_LIMIT_MS, RATE_LIMIT_MS * 2, RATE_LIMIT_MS * 4]);
  assert.equal(result.owner.name, 'UP');
});

await runCase('persistent failures stop after MAX_RETRIES attempts', async () => {
  let attempts = 0;
  const clock = createClock();
  const client = createBilibiliClient({
    fetchImpl: async () => {
      attempts += 1;
      return createResponse({ code: -1, message: 'still broken' }, { ok: false, status: 503 });
    },
    now: clock.now,
    sleepImpl: clock.sleep,
  });

  await assert.rejects(
    () => client.fetchVideoView({ aid: 445566 }),
    /HTTP 503/,
  );
  assert.equal(attempts, MAX_RETRIES);
  assert.deepEqual(clock.sleeps, [RATE_LIMIT_MS, RATE_LIMIT_MS * 2, RATE_LIMIT_MS * 4]);
});

await runCase('SESSDATA header is isolated to msgfeed and omitted on public endpoints', async () => {
  const calls = [];
  const client = createBilibiliClient({
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/x/v2/reply?')) {
        return createResponse({ code: 0, data: { page: { num: 1, size: 20 }, replies: [] } });
      }
      if (String(url).includes('/x/web-interface/view?')) {
        return createResponse({
          code: 0,
          data: {
            title: '标题',
            desc: '',
            owner: { mid: 1, name: 'UP', face: '' },
            top_reply: null,
          },
        });
      }
      return createResponse({ code: 0, data: { cursor: { is_end: true }, items: [] } });
    },
  });

  await client.fetchMsgfeedReply({ sessdata: 'COOKIE_VALUE' });
  await client.fetchVideoReplies({ aid: 1 });
  await client.fetchVideoView({ aid: 1 });

  assert.equal(calls[0].init.headers.Cookie, 'SESSDATA=COOKIE_VALUE');
  assert.equal(calls[1].init.headers.Cookie, undefined);
  assert.equal(calls[2].init.headers.Cookie, undefined);
});

await runCase('rate limit is 1000ms per endpoint but not shared across endpoints', async () => {
  const clock = createClock();
  const calls = [];
  const client = createBilibiliClient({
    fetchImpl: async (url) => {
      calls.push({ url, at: clock.now() });
      if (String(url).includes('/x/v2/reply?')) {
        return createResponse({ code: 0, data: { page: { num: 1, size: 20 }, replies: [] } });
      }
      return createResponse({
        code: 0,
        data: {
          title: '标题',
          desc: '',
          owner: { mid: 1, name: 'UP', face: '' },
          top_reply: null,
        },
      });
    },
    now: clock.now,
    sleepImpl: clock.sleep,
  });

  await client.fetchVideoReplies({ aid: 1 });
  await client.fetchVideoReplies({ aid: 1 });
  await client.fetchVideoView({ aid: 1 });

  assert.equal(RATE_LIMIT_MS, 1000);
  assert.deepEqual(clock.sleeps, [RATE_LIMIT_MS]);
  assert.equal(calls[0].at, 0);
  assert.equal(calls[1].at, RATE_LIMIT_MS);
  assert.equal(calls[2].at, RATE_LIMIT_MS);
});

await runCase('normalize helpers tolerate empty or missing fields without crashing', async () => {
  const client = createBilibiliClient({
    fetchImpl: async (url) => {
      if (String(url).includes('/x/msgfeed/reply?')) {
        return createResponse({
          code: 0,
          data: {
            cursor: {},
            items: [{}],
          },
        });
      }
      if (String(url).includes('/x/v2/reply?')) {
        return createResponse({
          code: 0,
          data: {
            page: {},
            replies: [{}],
          },
        });
      }
      return createResponse({
        code: 0,
        data: {},
      });
    },
  });

  const msgfeed = await client.fetchMsgfeedReply({ sessdata: 'COOKIE_VALUE' });
  assert.deepEqual(msgfeed.replies[0], {
    source_id: 0,
    source_content: null,
    business_id: 0,
    title: '',
    reply_content: '',
    mid_replier: 0,
    replier_name: '',
    like_count: 0,
    is_up: false,
    is_top: false,
    rpid: 0,
    occurred_at: msgfeed.replies[0].occurred_at,
    debug: msgfeed.replies[0].debug,
  });
  assert.equal(typeof msgfeed.replies[0].occurred_at, 'string');
  assert.equal(msgfeed.nextCursor, null);

  const replies = await client.fetchVideoReplies({ aid: 1 });
  assert.deepEqual(replies, {
    page: { num: 1, size: 20 },
    replies: [{
      rpid: 0,
      replier_mid: 0,
      replier_name: '',
      content: '',
      like_count: 0,
      is_up: false,
      is_top: false,
      occurred_at: replies.replies[0].occurred_at,
    }],
  });
  assert.equal(typeof replies.replies[0].occurred_at, 'string');

  const view = await client.fetchVideoView({ aid: 1 });
  assert.deepEqual(view, {
    title: '',
    desc: '',
    owner: {
      mid: 0,
      name: '',
      face: '',
    },
    pinned_reply: null,
  });
});

await runCase('fetchMsgfeedReply normalizes nested msgfeed items and prefers reply_to_reply_id inside thread replies', async () => {
  const client = createBilibiliClient({
    fetchImpl: async () => createResponse({
      code: 0,
      data: {
        cursor: { is_end: true, next: null },
        items: [{
          item: {
            root_reply_id: 7001,
            reply_to_reply_id: 7002,
            business_id: 112233,
            target_id: 900001,
            target_reply_content: '链接在这条楼中楼',
            ctime: 1713782400,
          },
          user: {
            mid: '654321',
            nickname: '路人甲',
          },
        }],
      },
    }),
  });

  const result = await client.fetchMsgfeedReply({ sessdata: 'COOKIE_VALUE' });
  assert.equal(result.replies[0].source_id, 7002);
  assert.equal(result.replies[0].business_id, 112233);
  assert.equal(result.replies[0].rpid, 900001);
  assert.equal(result.replies[0].reply_content, '链接在这条楼中楼');
  assert.equal(result.replies[0].mid_replier, 654321);
  assert.equal(result.replies[0].replier_name, '路人甲');
  assert.equal(result.replies[0].debug.replying_to_rpid_source, 'reply_to_reply_id');
});

await runCase('requestJson aborts stalled bilibili fetches after timeout', async () => {
  const client = createBilibiliClient({
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        reject(new Error('aborted by signal'));
      }, { once: true });
    }),
    rateLimitMs: 0,
    maxRetries: 1,
    requestTimeoutMs: 5,
  });

  await assert.rejects(
    () => client.fetchMsgfeedReply({ sessdata: 'COOKIE_VALUE' }),
    /request timeout/i,
  );
});

if (process.exitCode) {
  console.error('\n🔥 bilibili tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 bilibili tests green');
}
