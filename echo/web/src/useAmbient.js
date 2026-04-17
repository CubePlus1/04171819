// 消费 GET /api/ambient 的 SSE 流：server 自己按节奏挑下一条推过来
// 前端只负责把流当成"她身边一直在自言自语的朋友"来渲染
import { useCallback, useEffect, useRef, useState } from 'react';
import { SSE_EVENTS, REASON_TEXT_CN } from '@shared/contracts.mjs';

const MAX_BUBBLES = 120;

function pushBounded(prev, ev) {
  const next = [...prev, ev];
  return next.length > MAX_BUBBLES ? next.slice(next.length - MAX_BUBBLES) : next;
}

function reasonText(reason) {
  return REASON_TEXT_CN[reason] ?? REASON_TEXT_CN['server-error'];
}

export function useAmbient() {
  const [events, setEvents] = useState([]);
  const [idle, setIdle] = useState(false);      // 都接完了
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const epochRef = useRef(0); // reset / reconnect 时自增，旧事件全部丢弃

  const clear = useCallback(() => {
    setEvents([]);
    setIdle(false);
    setError(null);
  }, []);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const connect = useCallback(async () => {
    // 新一轮：前一次的 stream 一定要先 abort
    disconnect();
    const myEpoch = ++epochRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setIdle(false);

    try {
      const resp = await fetch('/api/ambient', {
        method: 'GET',
        signal: controller.signal,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(REASON_TEXT_CN[body.error] ?? '刚刚没连上');
      }
      if (myEpoch !== epochRef.current) return;
      setConnected(true);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (myEpoch !== epochRef.current) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (!raw.trim() || raw.startsWith(':')) continue;

          let event = 'message', data = '';
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          try {
            const payload = JSON.parse(data);
            if (event === SSE_EVENTS.BUBBLE) {
              setEvents((prev) => pushBounded(prev, {
                kind: 'echo',
                id: `b-${payload.run_id}-${payload.id}`,
                ...payload, // 包含 voice / tag / relative / mind
              }));
            } else if (event === SSE_EVENTS.POSTCARD) {
              setEvents((prev) => pushBounded(prev, {
                kind: 'postcard',
                id: `c-${payload.run_id}`,
                ...payload, // 包含 postcard / mind
              }));
            } else if (event === SSE_EVENTS.END) {
              if (payload.ok === false && payload.reason && payload.reason !== 'no-match') {
                setEvents((prev) => pushBounded(prev, {
                  kind: 'echo',
                  id: `end-${payload.run_id ?? Date.now()}`,
                  voice: reasonText(payload.reason),
                }));
              }
            } else if (event === 'idle') {
              setIdle(true);
              if (payload.voice) {
                setEvents((prev) => {
                  if (prev.some((e) => e.kind === 'idle-notice')) return prev;
                  return pushBounded(prev, {
                    kind: 'echo',
                    id: `idle-${Date.now()}`,
                    voice: payload.voice,
                  });
                });
              }
            }
          } catch {/* malformed frame */}
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (myEpoch !== epochRef.current) return;
      setError(err.message || '路上摔了一下');
    } finally {
      if (myEpoch === epochRef.current) setConnected(false);
    }
  }, [disconnect]);

  // 首次 mount 自动连接；卸载 abort
  useEffect(() => {
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { events, idle, connected, error, clear, reconnect: connect, disconnect };
}
