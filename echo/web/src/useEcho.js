// 从 POST /api/echo 的 SSE 流里增量收 event，作为 hook 暴露
import { useCallback, useRef, useState } from 'react';
import { SSE_EVENTS, REASONS, REASON_TEXT_CN } from '@shared/contracts.mjs';

const MAX_BUBBLES = 120;

function pushBounded(prev, ev) {
  const next = [...prev, ev];
  return next.length > MAX_BUBBLES ? next.slice(next.length - MAX_BUBBLES) : next;
}

export function useEcho() {
  const [events, setEvents] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  // 原子单飞：同一 request id 的 finally 才会清自己的 controller
  const inFlightIdRef = useRef(0);
  const abortRef = useRef(null);

  const reset = useCallback(() => {
    setEvents([]);
    setError(null);
    setRunning(false);
    inFlightIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const send = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // 原子 CAS：如果已有 in-flight，直接忽略本次调用
    if (abortRef.current) return;

    const myId = ++inFlightIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setRunning(true);
    setEvents((prev) => pushBounded(prev, { kind: 'me', text: trimmed, id: `me-${myId}` }));

    try {
      const resp = await fetch('/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || '刚刚没接住，再试一次');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
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
              setEvents((prev) => pushBounded(prev, { kind: 'echo', id: `b-${payload.run_id}-${payload.id}`, ...payload }));
            } else if (event === SSE_EVENTS.POSTCARD) {
              setEvents((prev) => pushBounded(prev, { kind: 'postcard', id: `c-${payload.run_id}`, ...payload }));
            } else if (event === SSE_EVENTS.END) {
              if (payload.ok === false) {
                setEvents((prev) => pushBounded(prev, {
                  kind: 'echo',
                  id: `end-${payload.run_id ?? Date.now()}`,
                  voice: reasonText(payload.reason),
                }));
              }
            }
          } catch {/* ignore malformed frame */}
        }
      }
      return true; // send 完整走完
    } catch (err) {
      if (err.name === 'AbortError') return false;
      if (inFlightIdRef.current === myId) {
        // 网络层错误（TypeError: Failed to fetch）统一折成一句友好文案
        const msg = err instanceof TypeError
          ? '好像没有连线 · 等网络回来再说一次？'
          : (err.message || '没接住');
        setError(msg);
      }
      return false;
    } finally {
      if (inFlightIdRef.current === myId) {
        setRunning(false);
        abortRef.current = null;
      }
    }
  }, []);

  return { events, running, error, send, reset };
}

function reasonText(reason) {
  return REASON_TEXT_CN[reason] ?? REASON_TEXT_CN[REASONS.SERVER_ERROR];
}
