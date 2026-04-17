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
    if (!globalThis.__dundao_client_id__) {
      globalThis.__dundao_client_id__ = `c_mem_${Date.now().toString(36)}`;
    }
    return globalThis.__dundao_client_id__;
  }
}

async function handle(res) {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn('api error', res.status, body);
    throw new Error('刚刚没接住，再试一次');
  }
  return res.json();
}

export async function bootstrap() {
  return handle(await fetch('/api/bootstrap'));
}

/**
 * Ambient tick · 让 AI 后台挑下一条可履约信号（可选精确到 topic / signalId）
 * - 不带参 → 选最旧的未履约 × 有匹配动作的那条
 * - 带 topic → 从该主题下未履约里挑
 * - 带 signalId → 精确指定某条
 */
export async function ambientTick({ topic, signalId } = {}) {
  return handle(
    await fetch('/api/ambient/tick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'demo-user',
        clientId: getClientId(),
        ...(topic     != null ? { topic }    : {}),
        ...(signalId  != null ? { signalId } : {}),
      }),
    }),
  );
}

export async function resetDemo() {
  return handle(await fetch('/api/reset', { method: 'POST' }));
}
