import { useEffect, useMemo, useRef, useState } from 'react';
import { useAmbient } from './useAmbient.js';
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

  const refresh = async () => {
    const myToken = ++tokenRef.current;
    setData((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await fetch(API_STATE);
      if (!r.ok) throw new Error('不在线');
      const v = await r.json();
      if (myToken !== tokenRef.current) return;
      setData({ loading: false, error: null, value: v });
    } catch (err) {
      if (myToken !== tokenRef.current) return;
      setData({ loading: false, error: err.message || '没接住', value: null });
    }
  };

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    refresh();
  }, []);

  return { ...data, refresh };
}

export default function App() {
  const { events, connected, idle, error, clear, reconnect } = useAmbient();
  const { value: boot, error: bootErr, refresh } = useBootstrap();
  const bottomRef = useRef(null);
  const liveMsgRef = useRef('');
  const [liveMsg, setLiveMsg] = useState('');
  const reducedMotion = usePrefersReducedMotion();

  // 每来一条新 bubble / postcard，刷新 memories 状态（已接回来的打个印章）
  const lastEventIdRef = useRef(null);
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;
    if (last.id === lastEventIdRef.current) return;
    lastEventIdRef.current = last.id;

    // 单一 live region：完整消息整句播报
    let msg = '';
    if (last.kind === 'echo' && last.voice) msg = last.voice;
    else if (last.kind === 'postcard')      msg = `${last.postcard.heading} · ${last.postcard.closing}`;
    if (msg && msg !== liveMsgRef.current) {
      liveMsgRef.current = msg;
      setLiveMsg(msg);
    }

    // postcard 出现时，抓一次最新 memories（打上"已接回来"的标记）
    if (last.kind === 'postcard') refresh();
  }, [events, refresh]);

  useEffect(() => {
    const behavior = reducedMotion ? 'auto' : 'smooth';
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, [events, reducedMotion]);

  const handleReset = async () => {
    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch {/* ignore */}
    clear();
    refresh();
    reconnect();
  };

  const rendered = useMemo(() => renderThread(events, reducedMotion), [events, reducedMotion]);

  return (
    <div className="shell">
      {/* 单点 live region */}
      <span className="sr-only" role="status" aria-live="polite">
        {liveMsg}
      </span>

      <header className="header">
        <h1>回响 · Echo</h1>
        <div className="sub">
          {connected
            ? (idle ? '她惦记的都接回来了' : '她一直陪着你 · 你只管刷')
            : '连上她的那头…'}
        </div>
        {(events.length > 0 || idle) && (
          <button
            type="button"
            onClick={handleReset}
            aria-label="清空对话 · 重新开始"
            style={{
              marginTop: 12, padding: '4px 14px', fontSize: 12,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--muted)', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.06em',
            }}
          >
            轻轻合上这一页
          </button>
        )}
      </header>

      {boot && <Memories boot={boot} />}

      <section className="conversation" aria-label="回响流">
        {rendered}
        {connected && !idle && events.length === 0 && <TypingBubble />}
        <div ref={bottomRef} />
      </section>

      {bootErr && (
        <div className="footer" role="alert">
          没连上回响的那头 ·{' '}
          <button
            onClick={refresh}
            style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
          >
            再试一次
          </button>
        </div>
      )}
      {error && (
        <div className="footer" role="alert">
          {error} ·{' '}
          <button
            onClick={reconnect}
            style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
          >
            重新连
          </button>
        </div>
      )}

      <div className="footer" aria-hidden="true">
        履约型内容的另一种猜想 · 姊妹实验 · {boot?.user?.nickname ?? '念念'}
      </div>
    </div>
  );
}

function renderThread(events, reducedMotion) {
  const out = [];
  for (const ev of events) {
    if (ev.kind === 'me') {
      out.push(<UserBubble key={ev.id} text={ev.text} />);
    } else if (ev.kind === 'echo') {
      out.push(<EchoBubble key={ev.id} voice={ev.voice} tag={ev.tag} relative={ev.relative} reducedMotion={reducedMotion} />);
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
