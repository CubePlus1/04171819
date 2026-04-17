async function handle(res) {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${body}`);
  }
  return res.json();
}

export async function bootstrap() {
  return handle(await fetch('/api/bootstrap'));
}

export async function submitComment(text, userId = 'demo-user') {
  return handle(
    await fetch('/api/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, userId }),
    }),
  );
}

export async function resetDemo() {
  return handle(await fetch('/api/reset', { method: 'POST' }));
}
