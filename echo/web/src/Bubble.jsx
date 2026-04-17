import { useEffect, useRef, useState } from 'react';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
      : false,
  );
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);
  return reduced;
}

function useTypewriter(text, { speed = 28, enabled = true } = {}) {
  const [shown, setShown] = useState(enabled ? '' : text);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) { setShown(text); return; }
    setShown('');
    let i = 0;
    timerRef.current = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(timerRef.current);
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [text, speed, enabled]);

  return shown;
}

export function UserBubble({ text }) {
  return (
    <div className="bubble me" role="note" aria-label={`我说：${text}`}>
      {text}
    </div>
  );
}

/**
 * EchoBubble
 *  - 视觉上是打字机动效；
 *  - 对 assistive tech 整句播报（aria-label 一次性给完整消息），避免被打字机半句半句刷屏；
 *  - 自己不再拥有 live region；顶层 App 有一处集中 aria-live，这里只是内容节点。
 */
export function EchoBubble({ voice, tag, relative }) {
  const reduced = usePrefersReducedMotion();
  const shown = useTypewriter(voice ?? '', { enabled: !reduced });
  return (
    <div className="bubble echo" aria-label={voice}>
      <span aria-hidden="true">{shown}</span>
      {tag && <span className="tag" aria-hidden="true">{tag}</span>}
      {relative && <span className="relative" aria-hidden="true">{relative}</span>}
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="bubble echo" aria-hidden="true">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
}
