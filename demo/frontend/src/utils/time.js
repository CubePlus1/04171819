export function relativeTimeCn(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - then;
  const day = 86_400_000;
  const days = Math.max(0, Math.round(diff / day));
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} 分钟前`;
  if (diff < day)       return `${Math.round(diff / 3_600_000)} 小时前`;
  if (days === 1) return '昨天';
  if (days < 7)   return `${days} 天前`;
  if (days < 31)  return `${Math.round(days / 7)} 周前`;
  if (days < 365) return `${Math.round(days / 30)} 个月前`;
  return `${Math.round(days / 365)} 年前`;
}
