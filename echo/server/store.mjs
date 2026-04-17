// 内存数据：不落盘，每次进程重启回到初态
// 这里故意不碰 SQLite —— 这是主 demo 反面的「轻」实验

function daysAgoIso(days) {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

function hoursAgoIso(hours) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

const CREATORS = {
  'dashan':  { id: 'dashan',  display: '大山的穿搭日记',   avatar: '👚' },
  '30days':  { id: '30days',  display: '30天变身计划',     avatar: '🌱' },
  'grandpa': { id: 'grandpa', display: '爷爷的退伍档案',   avatar: '🎖' },
};

export function buildInitialState() {
  return {
    user: { id: 'echo-user', nickname: '念念' },
    signals: [
      { id: 1, topic: 'knit-top',      creator: 'dashan',  text: '蹲链接姐妹们', kind: 'comment',    occurred_at: daysAgoIso(21), fulfilled: false },
      { id: 2, topic: 'series-30days', creator: '30days',  text: null,            kind: 'watch_later',occurred_at: daysAgoIso(31), fulfilled: false },
      { id: 3, topic: 'grandpa',       creator: 'grandpa', text: '蹲后续 爷爷真帅', kind: 'comment',  occurred_at: daysAgoIso(14), fulfilled: false },
    ],
    actions: [
      { id: 'a1', topic: 'knit-top',      creator: 'dashan',  kind: 'post_link',        occurred_at: hoursAgoIso(3),
        payload: { product: { name: '磨毛圆领针织衫', price: '¥128' }, summary: '她把你那条评论下蹲过的款 · 找到平替了' } },
      { id: 'a2', topic: 'series-30days', creator: '30days',  kind: 'series_completed', occurred_at: hoursAgoIso(8),
        payload: { series: '30 天变身 · Day1 → Day30', summary: '她更完了 · 我替你从 Day1 一路说到 Day30' } },
      { id: 'a3', topic: 'grandpa',       creator: 'grandpa', kind: 'post_sequel',      occurred_at: hoursAgoIso(1),
        payload: { title: '爷爷的老战友联系到他了 · 下集', preview_seconds: 10, summary: '14 天前你蹲的那集后续 · 爷爷老战友真的找来了' } },
    ],
    creators: CREATORS,
  };
}

const state = buildInitialState();

export function getState() {
  return state;
}

export function resetState() {
  const fresh = buildInitialState();
  state.user = fresh.user;
  state.signals = fresh.signals;
  state.actions = fresh.actions;
  state.creators = fresh.creators;
}

export function claimFulfillment(signalId) {
  const s = state.signals.find((x) => x.id === signalId);
  if (!s || s.fulfilled) return false;
  s.fulfilled = true;
  return true;
}

export function creator(id) {
  return state.creators[id] ?? { id, display: id, avatar: '·' };
}

export function relativeTimeCn(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0)        return '刚刚';   // 未来时间不会发生，但防御性处理
  if (diff < 60_000)   return '刚刚';
  const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY)  return `${Math.floor(diff / HOUR)} 小时前`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return '昨天';
  if (days < 7)   return `${days} 天前`;
  if (days < 31)  return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}
