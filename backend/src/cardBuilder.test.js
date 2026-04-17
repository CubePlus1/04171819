// 轻量单测：无测试框架，纯 node + assert。目标是守住 cardBuilder 的剧本 → 页面 → 文案契约。
import { strict as assert } from 'node:assert';
import { buildCard } from './cardBuilder.js';

function mkMatch({ scriptId, signal_type = 'comment_intent', raw_text = '蹲链接姐妹们', daysAgo = 21, action_type = 'post_link' }) {
  const occurred = new Date(Date.now() - daysAgo * 86400_000).toISOString();
  return {
    signal: {
      id: 1,
      user_id: 'demo-user',
      video_title: '磨毛圆领打底',
      signal_type,
      raw_text,
      topic: 'dashan-knit-top',
      occurred_at: occurred,
    },
    action: {
      id: 2,
      action_type,
      payload: {
        video_id: 'v-1',
        title: '姐妹们链接来啦',
        cover: 'https://example.com/c.jpg',
        product: { name: '磨毛上衣', price: '¥128', original: '¥189', shop: '大山的好物柜' },
        series_thumbnails: [{ day: 1, cover: 'x', title: 'Day1' }],
        preview_seconds: 10,
        summary: 'summary',
      },
    },
    creator: { id: 'c1', handle: '@大山的穿搭日记', display: '大山的穿搭日记', avatar: 'a', bio: 'b' },
    footprints: [{
      id: 9, occurred_at: occurred, video_title: '别的视频', signal_type: 'passive_interest',
    }],
    scriptId,
  };
}

function runCase(label, fn) {
  try {
    fn();
    console.log('✅', label);
  } catch (err) {
    console.error('❌', label, '\n   →', err.message);
    process.exitCode = 1;
  }
}

runCase('剧本 A · P1 + P2 · 商品卡 · 主按钮「加到清单」', () => {
  const card = buildCard({ match: mkMatch({ scriptId: 'A' }), intentResult: {
    intent: 'link_request', label: '蹲链接', confidence: 0.9, rationale: 'r',
  }, userId: 'demo-user' });
  assert.deepEqual(card.pages.map((p) => p.id), ['P1', 'P2']);
  assert.equal(card.pages[0].answer.type, 'product_card');
  assert.equal(card.pages[0].emotional_close, '当时蹲的，这次替你接住了');
  const primaryLabels = card.pages[0].actions.primary.map((a) => a.label);
  assert.ok(primaryLabels.includes('加到清单'), `primary 含「加到清单」：${primaryLabels}`);
  assert.match(card.pages[0].context_line, /^你.+在「大山的穿搭日记」那儿.+「蹲链接姐妹们」$/);
});

runCase('剧本 B · P1 + P3 · 系列网格 · 情感收束「AI 帮你摘了前情」', () => {
  const card = buildCard({
    match: mkMatch({ scriptId: 'B', signal_type: 'watch_later', raw_text: null, action_type: 'series_completed' }),
    intentResult: { intent: 'series_catchup', label: '系列型蹲', confidence: 0.9, rationale: 'r' },
    userId: 'demo-user',
  });
  assert.deepEqual(card.pages.map((p) => p.id), ['P1', 'P3']);
  assert.equal(card.pages[0].answer.type, 'series_grid');
  assert.equal(card.pages[0].emotional_close, '你没来得及追完的，这次替你接上了');
  assert.ok(card.pages[0].actions.primary.some((a) => a.label === '续看'));
});

runCase('剧本 C · P1 + P2 + P3 · 内嵌视频 · 情感收束「爷爷的老战友联系到他了」', () => {
  const card = buildCard({
    match: mkMatch({
      scriptId: 'C', signal_type: 'comment_intent', raw_text: '蹲后续 爷爷真帅',
      daysAgo: 14, action_type: 'post_sequel',
    }),
    intentResult: { intent: 'sequel_request', label: '蹲后续', confidence: 0.9, rationale: 'r' },
    userId: 'demo-user',
  });
  assert.deepEqual(card.pages.map((p) => p.id), ['P1', 'P2', 'P3']);
  assert.equal(card.pages[0].answer.type, 'inline_video');
  assert.equal(card.pages[0].answer.video.preview_seconds, 10);
  assert.equal(card.pages[0].emotional_close, '爷爷的老战友联系到他了');
  assert.match(card.pages[1].warm_summary, /这件事|回音|惦记/);
  assert.ok(card.pages[2].items.length > 0, 'P3 行为足迹列表非空');
});

runCase('P1 情景锚点使用相对时间而非绝对日期', () => {
  const card = buildCard({
    match: mkMatch({ scriptId: 'A', daysAgo: 30 }),
    intentResult: { intent: 'link_request', label: '蹲链接', confidence: 0.9, rationale: 'r' },
    userId: 'demo-user',
  });
  assert.match(card.pages[0].context_line, /(个月前|周前|天前|昨天|今天)/);
});

runCase('buildCard 在 match 缺失时抛错', () => {
  assert.throws(() => buildCard({ match: null, intentResult: {}, userId: 'u' }),
    /buildCard: match\.signal/);
});

if (process.exitCode) {
  console.error('\n🔥 cardBuilder tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 cardBuilder tests green');
}
