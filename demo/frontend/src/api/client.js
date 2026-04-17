const CLIENT_ID_KEY = 'dundao:clientId';

export function getClientId() {
  try {
    let id = sessionStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
      sessionStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage 不可用（隐私模式 / SSR），退化为内存生成一次
    if (!globalThis.__dundao_client_id__) {
      globalThis.__dundao_client_id__ = `c_mem_${Date.now().toString(36)}`;
    }
    return globalThis.__dundao_client_id__;
  }
}

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
      body: JSON.stringify({ text, userId, clientId: getClientId() }),
    }),
  );
}

export async function resetDemo() {
  return handle(await fetch('/api/reset', { method: 'POST' }));
}
