// 轻量日志：仅 dev 展台用，不引第三方依赖
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const current = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const paint = {
  debug: (s) => `\x1b[90m${s}\x1b[0m`,
  info:  (s) => `\x1b[36m${s}\x1b[0m`,
  warn:  (s) => `\x1b[33m${s}\x1b[0m`,
  error: (s) => `\x1b[31m${s}\x1b[0m`,
};

function emit(level, scope, msg, extra) {
  if (LEVELS[level] < current) return;
  const ts = new Date().toISOString().slice(11, 23);
  const tag = paint[level](`[${level.toUpperCase()}]`);
  const line = `${ts} ${tag} ${scope} ${msg}`;
  if (extra !== undefined) {
    console.log(line, extra);
  } else {
    console.log(line);
  }
}

export function createLogger(scope) {
  return {
    debug: (msg, extra) => emit('debug', scope, msg, extra),
    info:  (msg, extra) => emit('info',  scope, msg, extra),
    warn:  (msg, extra) => emit('warn',  scope, msg, extra),
    error: (msg, extra) => emit('error', scope, msg, extra),
  };
}
