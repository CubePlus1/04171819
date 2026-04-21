export const JUDGE_THRESHOLD = 0.3;

const ANSWER_PATTERNS = [
  { reason: 'answer_prefix', regex: /^(是|答案|bgm|链接)[:：]/iu },
  { reason: 'answer_named', regex: /(是|叫)\s?[《「"]?[^》」"\n]{1,40}[》」"]?/u },
  { reason: 'answer_url', regex: /https?:\/\/\S+/iu },
  { reason: 'answer_ecom', regex: /淘口令|复制打开|点淘宝/u },
];

const NOISE_PATTERNS = [
  { reason: 'noise_plus_one', regex: /^[+＋]1\s*蹲/u },
  { reason: 'noise_same_squat', regex: /^同蹲/u },
  { reason: 'noise_floor', regex: /^(楼上|楼下|前排|后排)/u },
  { reason: 'noise_laugh', regex: /^(哈哈+|233+|笑死|好看)/u },
];

function normalizeMid(mid) {
  return String(mid ?? '').trim();
}

function normalizeContent(content) {
  return typeof content === 'string' ? content.trim() : '';
}

function normalizeNumber(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function findPattern(content, patterns) {
  return patterns.find((pattern) => pattern.regex.test(content)) ?? null;
}

export function judgeAnswer({ reply, targetCreatorMid, videoTotalReplies = 0 }) {
  try {
    const resolvedReply = reply ?? {};
    const content = normalizeContent(resolvedReply.content);
    const reasons = [];
    let score = 0;

    if (normalizeMid(resolvedReply.replier_mid) === normalizeMid(targetCreatorMid)) {
      score += 0.5;
      reasons.push('+up');
    }

    if (resolvedReply.is_top) {
      score += 0.3;
      reasons.push('+top');
    }

    const likeThreshold = Math.max(10, normalizeNumber(videoTotalReplies) * 0.05);
    if (normalizeNumber(resolvedReply.like_count) >= likeThreshold) {
      score += 0.2;
      reasons.push('+likes');
    }

    const answerHit = findPattern(content, ANSWER_PATTERNS);
    if (answerHit) {
      score += 0.3;
      reasons.push(`+${answerHit.reason}`);
    }

    const noiseHit = findPattern(content, NOISE_PATTERNS);
    if (noiseHit) {
      score -= 0.5;
      reasons.push(`-${noiseHit.reason}`);
    }

    const confidence = Number(Math.max(0, score).toFixed(2));

    return {
      is_answer: score >= JUDGE_THRESHOLD,
      confidence,
      judge_reason: reasons.join(' ') || 'neutral',
    };
  } catch (err) {
    return {
      is_answer: false,
      confidence: 0,
      judge_reason: `error: ${err.message}`,
    };
  }
}
