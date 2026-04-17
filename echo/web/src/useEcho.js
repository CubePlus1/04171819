// 从 POST /api/echo 的 SSE 流里增量收 event，作为 hook 暴露
import { useCallback, useRef, useState } from 'react';

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
    setEvents((prev) => [...prev, { kind: 'me', text: trimmed, id: `me-${myId}` }]);

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
            if (event === 'bubble') {
              setEvents((prev) => [...prev, { kind: 'echo', id: `b-${payload.run_id}-${payload.id}`, ...payload }]);
            } else if (event === 'postcard') {
              setEvents((prev) => [...prev, { kind: 'postcard', id: `c-${payload.run_id}`, ...payload }]);
            } else if (event === 'end') {
              if (payload.ok === false) {
                setEvents((prev) => [...prev, {
                  kind: 'echo',
                  id: `end-${payload.run_id ?? Date.now()}`,
                  voice: reasonText(payload.reason),
                }]);
              }
            }
          } catch {/* ignore malformed frame */}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError' && inFlightIdRef.current === myId) {
        setError(err.message || '没接住');
      }
    } finally {
      // 只清理"自己这次"的状态，避免后发请求被前一次的 finally 擦掉
      if (inFlightIdRef.current === myId) {
        setRunning(false);
        abortRef.current = null;
      }
    }
  }, []);

  return { events, running, error, send, reset };
}

function reasonText(reason) {
  switch (reason) {
    case 'no-match':           return '这一次我没找到能接住的那条，下次再说。';
    case 'no-action':          return '那条线索还没动静 · 我先记下了。';
    case 'already-fulfilled':  return '这件事我之前替你接过一次了 · 这次让它停在这儿。';
    default:                    return '这一次没接住 · 再说一次？';
  }
}
