import { mockBootstrap, mockAmbientTick, mockResetDemo, mockMyComments } from '../mock/index.js';

// 部署到 GitHub Pages 时跑 mock 模式（VITE_MOCK=1 或 build 时静态注入）
// 开发 / 有后端的场景下 VITE_MOCK 不设 · 走原来的 fetch
const IS_MOCK = import.meta.env.VITE_MOCK === '1';

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
  if (IS_MOCK) return mockBootstrap();
  return handle(await fetch('/api/bootstrap'));
}

/**
 * Ambient tick · 让 AI 后台挑下一条可履约信号（可选精确到 topic / signalId）
 */
export async function ambientTick({ topic, signalId } = {}) {
  if (IS_MOCK) return mockAmbientTick({ topic, signalId, clientId: getClientId() });
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
  if (IS_MOCK) return mockResetDemo();
  return handle(await fetch('/api/reset', { method: 'POST' }));
}

export async function getMyComments(filter = 'all') {
  if (IS_MOCK) return mockMyComments(filter);
  return handle(await fetch(`/api/my-comments?filter=${encodeURIComponent(filter)}`));
}
