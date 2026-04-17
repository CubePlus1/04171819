// 从 POST /api/echo 的 SSE 流里增量收 event，作为 hook 暴露
import { useCallback, useRef, useState } from 'react';

export function useEcho() {
  const [events, setEvents] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const reset = useCallback(() => {
    setEvents([]);
    setError(null);
    setRunning(false);
    abortRef.current?.abort();
  }, []);

  const send = useCallback(async (text) => {
    if (running) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setError(null);
    setRunning(true);
    setEvents((prev) => [...prev, { kind: 'me', text: trimmed, id: `me-${Date.now()}` }]);

    const controller = new AbortController();
    abortRef.current = controller;

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
      if (err.name !== 'AbortError') {
        setError(err.message || '没接住');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [running]);

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
