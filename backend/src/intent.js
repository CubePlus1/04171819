// 意图分类器：展台级规则引擎
// 设计哲学：展示 > 技术；分类结果稳定、可解释、演示时延可控

const RULES = [
  {
    intent: 'link_request',
    label: '蹲链接',
    aliases: ['链接型蹲'],
    patterns: [
      /蹲.*?链接/,
      /求.*?链接/,
      /链接.*?在哪/,
      /链接.*?来/,
      /同款/,
    ],
    priority: 100,
    rationale: '用户在评论里显式表达「想要博主没放出的购买入口」',
    topic_hint: 'dashan-knit-top',
  },
  {
    intent: 'sequel_request',
    label: '蹲后续',
    aliases: ['后续型蹲'],
    patterns: [
      /蹲.*?后续/,
      /蹲.*?下集/,
      /什么时候.*?更/,
      /后续呢/,
    ],
    priority: 95,
    rationale: '用户在评论里显式表达「等这条视频的后续」',
    topic_hint: 'grandpa-archive',
  },
  {
    intent: 'series_catchup',
    label: '系列型蹲',
    aliases: ['稍后再看'],
    patterns: [
      /稍后再看/,
      /忘了看/,
      /还没看完/,
      /没追完/,
      /更完了吗/,
    ],
    priority: 90,
    rationale: '用户一个月前按了「稍后再看」但从未消费',
    topic_hint: '30days-series',
  },
  {
    intent: 'tutorial_request',
    label: '蹲教程',
    aliases: ['教程型蹲'],
    patterns: [
      /求.*?教程/,
      /怎么做/,
      /怎么弄/,
      /出个教程/,
    ],
    priority: 70,
    rationale: '用户希望博主把操作步骤写出来',
    topic_hint: null,
  },
  {
    intent: 'plus_one',
    label: '+1 附议',
    aliases: ['短评论也是意图'],
    patterns: [
      /^\s*\+1(\s*\+1)*\s*$/,
      /^\s*加一\s*$/,
      /^\s*同问\s*$/,
    ],
    priority: 50,
    rationale: '短评论也是意图：用户在给别人蹲的事打 +1',
    topic_hint: null,
  },
  {
    intent: 'catch_up_request',
    label: '催更',
    aliases: [],
    patterns: [/催更/, /快更/, /更得太慢/],
    priority: 60,
    rationale: '用户希望博主更新速度加快',
    topic_hint: null,
  },
];

const FALLBACK = {
  intent: 'passive_interest',
  label: '被动兴趣',
  priority: 10,
  rationale: '未命中显式信号，归为被动兴趣（长停留）',
  topic_hint: null,
};

export const SUPPORTED_INTENTS = [...RULES.map((r) => r.intent), FALLBACK.intent];

/**
 * @param {string} text 评论原文
 * @returns {{ intent, label, confidence, rationale, topic_hint, matched_rule }}
 */
export function classifyIntent(text) {
  if (!text || typeof text !== 'string') {
    throw new TypeError('classifyIntent: text must be a non-empty string');
  }
  const trimmed = text.trim();

  const hits = [];
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(trimmed)) {
        hits.push({ rule, pattern: pattern.source });
        break;
      }
    }
  }

  if (hits.length === 0) {
    return {
      intent: FALLBACK.intent,
      label: FALLBACK.label,
      confidence: 0.42,
      rationale: FALLBACK.rationale,
      topic_hint: FALLBACK.topic_hint,
      matched_rule: null,
    };
  }

  hits.sort((a, b) => b.rule.priority - a.rule.priority);
  const winner = hits[0].rule;

  // 命中规则：置信度基础 0.78，越是独占命中越高
  const confidence = Math.min(0.98, 0.78 + 0.04 * hits.length + (winner.priority / 1000));

  return {
    intent: winner.intent,
    label: winner.label,
    confidence: Number(confidence.toFixed(2)),
    rationale: winner.rationale,
    topic_hint: winner.topic_hint,
    matched_rule: { pattern: hits[0].pattern, alternatives: hits.slice(1).map((h) => h.rule.intent) },
  };
}
