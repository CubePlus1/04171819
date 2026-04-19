// 线上（GitHub Pages / 手机扫码）优先走 CDN 图床 · 避开本地 assets 404/慢链路白屏
// 本地 dev 不设 VITE_ASSET_CDN · 仍走 vite public/ · 改图所见即所得
//
// CDN base 约定：不带末尾 / · 函数内部统一拼
// 例：VITE_ASSET_CDN=https://cdn.jsdelivr.net/gh/CubePlus1/04171819@feat/dundao-demo/demo/frontend/public
//     传 "/scenes/thumb-a-storage.jpg" → CDN 前缀 + "/scenes/thumb-a-storage.jpg"
const CDN = (import.meta.env.VITE_ASSET_CDN ?? '').replace(/\/+$/, '');

export function asset(path) {
  if (!path) return path;
  // 已经是绝对 URL · 不 rewrite（picsum / dicebear / 其他图床）
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('data:')) return path;
  if (!CDN) return path; // dev 或未配 CDN · 原样返回（vite 同域托管）
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${CDN}${rel}`;
}
