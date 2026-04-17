import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEcho } from './useEcho.js';
import { UserBubble, EchoBubble, TypingBubble } from './Bubble.jsx';
import Postcard from './Postcard.jsx';

const API_STATE = '/api/state';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);
  return reduced;
}

function useBootstrap() {
  const [data, setData] = useState({ loading: true, error: null, value: null });
  const tokenRef = useRef(0);
  const bootedRef = useRef(false);

  const refresh = useCallback(async () => {
    const myToken = ++tokenRef.current;
    setData((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await fetch(API_STATE);
      if (!r.ok) throw new Error('不在线');
      const v = await r.json();
      if (myToken !== tokenRef.current) return; // 被更新的请求覆盖
      setData({ loading: false, error: null, value: v });
    } catch (err) {
      if (myToken !== tokenRef.current) return;
      setData({ loading: false, error: err.message || '没接住', value: null });
    }
  }, []);

  useEffect(() => {
    // StrictMode dev 双调用保护
    if (bootedRef.current) return;
    bootedRef.current = true;
    refresh();
  }, [refresh]);

  return { ...data, refresh };
}

export default function App() {
  const { events, running, error, send } = useEcho();
  const { value: boot, error: bootErr, refresh } = useBootstrap();
  const [text, setText] = useState('');
  const bottomRef = useRef(null);
  const liveMsgRef = useRef('');
  const [liveMsg, setLiveMsg] = useState('');
  const reducedMotion = usePrefersReducedMotion();

  // 单一 live region：整句播报（完整 voice / postcard.closing），不给打字机中间态
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;
    let msg = '';
    if (last.kind === 'echo' && last.voice)       msg = last.voice;
    else if (last.kind === 'postcard')            msg = `${last.postcard.heading} · ${last.postcard.closing}`;
    else if (last.kind === 'me')                  msg = ''; // 用户自己的消息不播报
    if (msg && msg !== liveMsgRef.current) {
      liveMsgRef.current = msg;
      setLiveMsg(msg);
    }
  }, [events]);

  useEffect(() => {
    const behavior = reducedMotion ? 'auto' : 'smooth';
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, [events, running, reducedMotion]);

  const onSubmit = async (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || running) return;
    await send(v);
    setText('');        // 成功或失败后再清空；失败时用户可 ↑ 键在浏览器历史里找到
    refresh();          // 抓最新 memories
  };

  const presets = boot?.presets ?? [];

  const rendered = useMemo(() => renderThread(events), [events]);

  return (
    <div className="shell">
      {/* 单点 live region；子组件不再各自挂 aria-live */}
      <span className="sr-only" role="status" aria-live="polite">
        {liveMsg}
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
        <div className="footer" role="alert">
          没连上回响的那头 · <button onClick={refresh} style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>再试一次</button>
        </div>
      )}
      {error && !running && (
        <div className="footer" role="alert">{error}</div>
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
                  onClick={() => setText(p.text)}
                >
                  {p.text}
                </button>
              ))}
            </div>
          )}
          <form className="composer-inner" onSubmit={onSubmit}>
            <label htmlFor="echo-input" className="sr-only">输入一句念头</label>
            <input
              id="echo-input"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 140))}
              placeholder="把你心里那句惦记说出来 · 回车"
              disabled={running}
            />
            <button type="submit" disabled={running || !text.trim()}>
              {running ? '在听…' : '说出口'}
            </button>
          </form>
        </div>
      </div>

      <div className="footer" aria-hidden="true">
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
