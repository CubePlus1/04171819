import { useEffect, useMemo, useRef, useState } from 'react';
import { useEcho } from './useEcho.js';
import { UserBubble, EchoBubble, TypingBubble } from './Bubble.jsx';
import Postcard from './Postcard.jsx';

const API_STATE = '/api/state';

function useBootstrap() {
  const [data, setData] = useState({ loading: true, error: null, value: null });
  const refresh = async () => {
    setData((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await fetch(API_STATE);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const v = await r.json();
      setData({ loading: false, error: null, value: v });
    } catch (err) {
      setData({ loading: false, error: err.message || '没接住', value: null });
    }
  };
  useEffect(() => { refresh(); }, []);
  return { ...data, refresh };
}

export default function App() {
  const { events, running, error, send } = useEcho();
  const { value: boot, error: bootErr, refresh } = useBootstrap();
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events, running]);

  const onSubmit = async (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || running) return;
    setText('');
    await send(v);
    refresh(); // 抓回最新的 memories 状态
  };

  const presets = boot?.presets ?? [];

  const rendered = useMemo(() => renderThread(events), [events]);

  return (
    <div className="shell">
      <span className="sr-only" role="status" aria-live="polite">
        {running ? '回响正在回答' : '回响在听'}
      </span>

      <header className="header">
        <h1>回响 · Echo</h1>
        <div className="sub">把你念念不忘的 · 轻轻说一句</div>
      </header>

      {boot && <Memories boot={boot} />}

      <section className="conversation" aria-label="对话流">
        {rendered}
        {running && <TypingBubble />}
        <div ref={bottomRef} />
      </section>

      {bootErr && (
        <div className="footer">没连上回响的那头 · <button onClick={refresh} style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>再试一次</button></div>
      )}
      {error && !running && (
        <div className="footer">{error}</div>
      )}

      <div className="composer">
        <div style={{ width: '100%', maxWidth: 680 }}>
          {presets.length > 0 && (
            <div className="presets" aria-label="预设念头">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={running}
                  onClick={() => { setText(p.text); }}
                >
                  {p.text}
                </button>
              ))}
            </div>
          )}
          <form className="composer-inner" onSubmit={onSubmit}>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 140))}
              placeholder="把你心里那句惦记说出来 · 回车"
              disabled={running}
              aria-label="输入一句念头"
            />
            <button type="submit" disabled={running || !text.trim()}>
              {running ? '在听…' : '说出口'}
            </button>
          </form>
        </div>
      </div>

      <div className="footer">
        履约型内容的另一种猜想 · 姊妹实验 · {boot?.user?.nickname ?? '念念'}
      </div>
    </div>
  );
}

function renderThread(events) {
  const out = [];
  for (const ev of events) {
    if (ev.kind === 'me') {
      out.push(<UserBubble key={ev.id} text={ev.text} />);
    } else if (ev.kind === 'echo') {
      out.push(<EchoBubble key={ev.id} voice={ev.voice} tag={ev.tag} relative={ev.relative} />);
    } else if (ev.kind === 'postcard') {
      out.push(<Postcard key={ev.id} postcard={ev.postcard} />);
    }
  }
  return out;
}

function Memories({ boot }) {
  const items = boot.memories ?? [];
  if (!items.length) return null;
  return (
    <aside className="memories" aria-label="念念记得的">
      <h2>她曾经放不下的</h2>
      <ul>
        {items.map((m) => (
          <li key={m.id} className={m.fulfilled ? 'done' : ''}>
            <span className="t">{m.relative}</span>
            {m.text ? `「${m.text}」` : '那条视频'}
            {' · '}
            <span style={{ color: 'var(--sepia)' }}>{m.creator}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
