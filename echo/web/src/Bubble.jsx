import { useEffect, useRef, useState } from 'react';

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

export function EchoBubble({ voice, tag, relative, disableTypewriter }) {
  const shown = useTypewriter(voice ?? '', { enabled: !disableTypewriter });
  return (
    <div className="bubble echo" role="status" aria-live="polite">
      <span>{shown}</span>
      {tag && <span className="tag">{tag}</span>}
      {relative && <span className="relative">{relative}</span>}
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
