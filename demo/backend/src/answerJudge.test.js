import { strict as assert } from 'node:assert';
import { judgeAnswer, JUDGE_THRESHOLD } from './answerJudge.js';

function runCase(label, fn) {
  try {
    fn();
    console.log('✅', label);
  } catch (err) {
    console.error('❌', label, '\n   →', err.message);
    process.exitCode = 1;
  }
}

function reply(overrides = {}) {
  return Object.assign({
    replier_mid: 900001,
    content: '',
    like_count: 0,
    is_top: false,
  }, overrides);
}

const samples = [
  {
    label: 'UP 主直接贴链接',
    input: reply({ replier_mid: 123456, content: '链接上了！https://shop.example/item', like_count: 42 }),
    targetCreatorMid: 123456,
    total: 80,
    answer: true,
    confidence: 1,
    reason: /\+up/,
  },
  {
    label: '高赞路人答 BGM',
    input: reply({ content: 'BGM 是陈粒 - 芳草地', like_count: 520 }),
    targetCreatorMid: 123456,
    total: 1000,
    answer: true,
    confidence: 0.5,
    reason: /\+answer_named/,
  },
  {
    label: '+1 蹲是噪声',
    input: reply({ content: '+1 蹲', like_count: 2 }),
    targetCreatorMid: 123456,
    total: 200,
    answer: false,
    confidence: 0,
    reason: /-noise_plus_one/,
  },
  {
    label: '同蹲是噪声',
    input: reply({ content: '同蹲', like_count: 1 }),
    targetCreatorMid: 123456,
    total: 20,
    answer: false,
    confidence: 0,
    reason: /-noise_same_squat/,
  },
  {
    label: '楼上好看即使置顶也不算答案',
    input: reply({ content: '楼上好看', like_count: 8, is_top: true }),
    targetCreatorMid: 123456,
    total: 20,
    answer: false,
    confidence: 0,
    reason: /-noise_floor/,
  },
  {
    label: '答案前缀算答案',
    input: reply({ content: '答案：无印良品软壳包', like_count: 3 }),
    targetCreatorMid: 123456,
    total: 60,
    answer: true,
    confidence: 0.3,
    reason: /\+answer_prefix/,
  },
  {
    label: '叫《某首歌》算答案',
    input: reply({ content: '叫《Back to Friends》', like_count: 1 }),
    targetCreatorMid: 123456,
    total: 20,
    answer: true,
    confidence: 0.3,
    reason: /\+answer_named/,
  },
  {
    label: '淘口令算答案',
    input: reply({ content: '淘口令 ￥ABCD1234￥ 复制打开', like_count: 5 }),
    targetCreatorMid: 123456,
    total: 50,
    answer: true,
    confidence: 0.3,
    reason: /\+answer_ecom/,
  },
  {
    label: '点淘宝算答案',
    input: reply({ content: '点淘宝搜店名就有', like_count: 12 }),
    targetCreatorMid: 123456,
    total: 80,
    answer: true,
    confidence: 0.5,
    reason: /\+answer_ecom/,
  },
  {
    label: '链接前缀算答案',
    input: reply({ content: '链接：在置顶评论', like_count: 0 }),
    targetCreatorMid: 123456,
    total: 80,
    answer: true,
    confidence: 0.3,
    reason: /\+answer_prefix/,
  },
  {
    label: '后续今晚更新 + UP 主身份即可过线',
    input: reply({ replier_mid: 123456, content: '后续今晚更新', like_count: 0 }),
    targetCreatorMid: 123456,
    total: 30,
    answer: true,
    confidence: 0.5,
    reason: /\+up/,
  },
  {
    label: '链接明天补 + UP 主身份可过线',
    input: reply({ replier_mid: 123456, content: '链接明天补', like_count: 0 }),
    targetCreatorMid: 123456,
    total: 30,
    answer: true,
    confidence: 0.5,
    reason: /\+up/,
  },
  {
    label: 'BGM? 只是追问不是答案',
    input: reply({ content: 'BGM?', like_count: 1 }),
    targetCreatorMid: 123456,
    total: 30,
    answer: false,
    confidence: 0,
    reason: /neutral/,
  },
  {
    label: '哈哈哈哈不是答案',
    input: reply({ content: '哈哈哈哈哈哈', like_count: 20 }),
    targetCreatorMid: 123456,
    total: 80,
    answer: false,
    confidence: 0,
    reason: /-noise_laugh/,
  },
  {
    label: '笑死也不是答案',
    input: reply({ content: '笑死我了', like_count: 25 }),
    targetCreatorMid: 123456,
    total: 80,
    answer: false,
    confidence: 0,
    reason: /-noise_laugh/,
  },
  {
    label: '前排不是答案',
    input: reply({ content: '前排', like_count: 100, is_top: true }),
    targetCreatorMid: 123456,
    total: 800,
    answer: false,
    confidence: 0,
    reason: /-noise_floor/,
  },
  {
    label: '后排不是答案',
    input: reply({ content: '后排', like_count: 0 }),
    targetCreatorMid: 123456,
    total: 50,
    answer: false,
    confidence: 0,
    reason: /-noise_floor/,
  },
  {
    label: '楼下说得对不是答案',
    input: reply({ content: '楼下说得对', like_count: 0 }),
    targetCreatorMid: 123456,
    total: 50,
    answer: false,
    confidence: 0,
    reason: /-noise_floor/,
  },
  {
    label: 'BGM 是 + URL 双命中仍只加一次 answer 分',
    input: reply({ content: 'BGM 是告五人 - 唯一 https://music.example/1', like_count: 3 }),
    targetCreatorMid: 123456,
    total: 60,
    answer: true,
    confidence: 0.3,
    reason: /\+answer_named/,
  },
  {
    label: '是《芳草地》主页歌单也有',
    input: reply({ content: '是《芳草地》 主页歌单也有', like_count: 9 }),
    targetCreatorMid: 123456,
    total: 70,
    answer: true,
    confidence: 0.3,
    reason: /\+answer_named/,
  },
  {
    label: '蹲一个后续不是答案',
    input: reply({ content: '蹲一个后续', like_count: 3 }),
    targetCreatorMid: 123456,
    total: 100,
    answer: false,
    confidence: 0,
    reason: /neutral/,
  },
  {
    label: 'UP 主回复但同时是噪声不过线',
    input: reply({ replier_mid: 123456, content: '哈哈哈哈', like_count: 0 }),
    targetCreatorMid: 123456,
    total: 10,
    answer: false,
    confidence: 0,
    reason: /\+up/,
  },
  {
    label: '只有高赞但无答案关键词不过线',
    input: reply({ content: '收藏了', like_count: 50 }),
    targetCreatorMid: 123456,
    total: 400,
    answer: false,
    confidence: 0.2,
    reason: /\+likes/,
  },
];

runCase('judgeAnswer uses threshold 0.3 from shared plan', () => {
  assert.equal(JUDGE_THRESHOLD, 0.3);
});

runCase('judgeAnswer scores 20+ realistic bilibili samples', () => {
  assert.ok(samples.length >= 20);

  for (const sample of samples) {
    const result = judgeAnswer({
      reply: sample.input,
      targetCreatorMid: sample.targetCreatorMid,
      videoTotalReplies: sample.total,
    });

    assert.equal(result.is_answer, sample.answer, sample.label);
    assert.equal(result.confidence, sample.confidence, sample.label);
    assert.match(result.judge_reason, sample.reason, sample.label);
  }
});

runCase('judgeAnswer is deterministic for the same input', () => {
  const input = {
    reply: reply({
      replier_mid: 123456,
      content: '答案：无印良品软壳包',
      like_count: 120,
      is_top: true,
    }),
    targetCreatorMid: 123456,
    videoTotalReplies: 1000,
  };
  const first = judgeAnswer(input);

  for (let index = 0; index < 100; index += 1) {
    assert.deepEqual(judgeAnswer(input), first);
  }
});

runCase('judgeAnswer keeps confidence within the R1 score bounds', () => {
  const minCase = judgeAnswer({
    reply: reply({ content: '同蹲' }),
    targetCreatorMid: 123456,
    videoTotalReplies: 10,
  });
  const maxCase = judgeAnswer({
    reply: reply({
      replier_mid: 123456,
      content: '答案：无印良品软壳包',
      like_count: 500,
      is_top: true,
    }),
    targetCreatorMid: 123456,
    videoTotalReplies: 1000,
  });

  assert.equal(minCase.confidence, 0);
  assert.equal(maxCase.confidence, 1.3);
  assert.ok(maxCase.confidence <= 1.3);
});

runCase('judgeAnswer is monotonic when more rules match', () => {
  const base = judgeAnswer({
    reply: reply({ content: '见评论区' }),
    targetCreatorMid: 123456,
    videoTotalReplies: 1000,
  });
  const withAnswer = judgeAnswer({
    reply: reply({ content: '答案：见评论区' }),
    targetCreatorMid: 123456,
    videoTotalReplies: 1000,
  });
  const withAnswerAndLikes = judgeAnswer({
    reply: reply({ content: '答案：见评论区', like_count: 100 }),
    targetCreatorMid: 123456,
    videoTotalReplies: 1000,
  });
  const withAnswerLikesAndTop = judgeAnswer({
    reply: reply({ content: '答案：见评论区', like_count: 100, is_top: true }),
    targetCreatorMid: 123456,
    videoTotalReplies: 1000,
  });
  const fullStack = judgeAnswer({
    reply: reply({
      replier_mid: 123456,
      content: '答案：见评论区',
      like_count: 100,
      is_top: true,
    }),
    targetCreatorMid: 123456,
    videoTotalReplies: 1000,
  });

  assert.ok(base.confidence <= withAnswer.confidence);
  assert.ok(withAnswer.confidence <= withAnswerAndLikes.confidence);
  assert.ok(withAnswerAndLikes.confidence <= withAnswerLikesAndTop.confidence);
  assert.ok(withAnswerLikesAndTop.confidence <= fullStack.confidence);
});

runCase('judgeAnswer lets noise dominate an UP reply joke', () => {
  const result = judgeAnswer({
    reply: reply({ replier_mid: 123456, content: '哈哈哈' }),
    targetCreatorMid: 123456,
    videoTotalReplies: 10,
  });

  assert.equal(result.is_answer, false);
  assert.equal(result.confidence, 0);
  assert.match(result.judge_reason, /\+up/);
  assert.match(result.judge_reason, /-noise_laugh/);
});

runCase('judgeAnswer falls back to error result when rule evaluation throws', () => {
  const badReply = {};
  Object.defineProperty(badReply, 'content', {
    get() {
      throw new Error('boom');
    },
  });

  const result = judgeAnswer({
    reply: badReply,
    targetCreatorMid: 123456,
    videoTotalReplies: 10,
  });

  assert.equal(result.is_answer, false);
  assert.equal(result.confidence, 0);
  assert.match(result.judge_reason, /^error:/);
});

if (process.exitCode) {
  console.error('\n🔥 answerJudge tests failed');
  process.exit(process.exitCode);
} else {
  console.log('\n🎉 answerJudge tests green');
}
