const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:4000';

const statusEl = document.getElementById('status');
const openButton = document.getElementById('btnOpen');
const backfillButton = document.getElementById('btnBackfill');
const statusButton = document.getElementById('btnStatus');

function setStatus(lines) {
  statusEl.textContent = Array.isArray(lines) ? lines.join('\n') : String(lines);
}

async function getSessdataCookie() {
  return chrome.cookies.get({
    url: 'https://www.bilibili.com',
    name: 'SESSDATA',
  });
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.reason || body?.error || `HTTP ${response.status}`);
  }
  return body;
}

async function renderStatus() {
  const [cookie, backfillStatus] = await Promise.all([
    getSessdataCookie(),
    fetchJson(`${BACKEND_URL}/api/backfill/status`),
  ]);

  const progress = backfillStatus.progress;
  setStatus([
    `B站登录: ${cookie ? '已登录' : '未登录'}`,
    `倒推状态: ${backfillStatus.status}`,
    `运行ID: ${backfillStatus.runId || '-'}`,
    `开始时间: ${backfillStatus.startedAt || '-'}`,
    `完成时间: ${backfillStatus.finishedAt || '-'}`,
    `进度: ${progress ? `${progress.stage || '-'} ${progress.current ?? '-'} / ${progress.total ?? '-'}` : '-'}`,
    `提示: ${progress?.hint || backfillStatus.error || '-'}`,
  ]);
}

openButton.addEventListener('click', () => {
  chrome.tabs.create({ url: FRONTEND_URL });
});

backfillButton.addEventListener('click', async () => {
  backfillButton.disabled = true;
  setStatus(['正在读取 SESSDATA...']);

  try {
    const cookie = await getSessdataCookie();
    if (!cookie?.value) {
      setStatus(['错误: 请先登录 B 站']);
      return;
    }

    setStatus(['正在启动历史倒推...']);
    const result = await fetchJson(`${BACKEND_URL}/api/backfill/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessdata: cookie.value }),
    });

    setStatus([
      '历史倒推已启动',
      `runId: ${result.runId}`,
      '进度可通过“状态”按钮查看',
    ]);
  } catch (error) {
    setStatus([`启动失败: ${error.message}`]);
  } finally {
    backfillButton.disabled = false;
  }
});

statusButton.addEventListener('click', async () => {
  statusButton.disabled = true;
  setStatus(['正在读取状态...']);

  try {
    await renderStatus();
  } catch (error) {
    setStatus([`状态读取失败: ${error.message}`]);
  } finally {
    statusButton.disabled = false;
  }
});

void renderStatus().catch((error) => {
  setStatus([`状态读取失败: ${error.message}`]);
});
