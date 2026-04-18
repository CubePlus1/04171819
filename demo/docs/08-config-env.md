# 08 · 配置 & 环境变量

## 后端（`demo/backend`）

| env | 默认 | 作用 |
|---|---|---|
| `PORT` | `4000` | HTTP 端口 |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `ALLOWED_ORIGINS` | `""` | 逗号分隔的额外 CORS / WS origin（支持 `*`） |
| `ALLOW_REMOTE_RESET` | `0` | `1` 允许非本机触发 `/api/reset` |
| `RATE_LIMIT_CAPACITY` | `12` | `/api/comment` 与 `/api/ambient/tick` 令牌桶容量 |
| `RATE_LIMIT_REFILL` | `3` | 每秒补充令牌数 |
| `BOOTSTRAP_CARDS_LIMIT` | `30` | `/api/bootstrap` 返回最近多少张卡片 |

### 默认 Origin allowlist

代码写死的正则：
- `^https?://localhost(:\d+)?$`
- `^https?://127\.0\.0\.1(:\d+)?$`
- `^https?://\[::1\](:\d+)?$`
- `^https?://192\.168\.\d+\.\d+(:\d+)?$`
- `^https?://10\.\d+\.\d+\.\d+(:\d+)?$`
- `^https?://172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$`

覆盖 localhost + IPv4 LAN + IPv6 loopback + Docker 默认 bridge。

额外 origin 通过 `ALLOWED_ORIGINS` env 追加（支持 `*` 放开一切）。

## 前端（`demo/frontend`）

### vite dev server
- 端口：`5173`
- proxy：
  - `/api/*` → `http://localhost:4000`
  - `/ws` → `ws://localhost:4000`

dev 时前端和后端分两个进程 · 通过 proxy 避免跨域。

生产构建产物（`npm run build`）打到 `dist/`，同域部署。

### 前端 localStorage / sessionStorage

| key | where | 作用 |
|---|---|---|
| `dundao:clientId` | sessionStorage | per-tab UUID 用于 WS 过滤 |
| `dundao:themeId` | localStorage | 主题偏好持久化 |

### 前端路径 alias

`vite.config.js`：
```js
resolve: {
  alias: {
    '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
  },
}
```

前端代码通过 `@shared/contracts.js` 引用后端同源契约文件。

### Tailwind 扫描路径

`tailwind.config.js`：
```js
content: ['./index.html', './src/**/*.{js,jsx}']
```

## 启动 scripts

```json
{
  "scripts": {
    "setup": "npm install && npm --prefix backend install && npm --prefix frontend install && npm --prefix backend run db:seed",
    "dev":   "concurrently -k -n backend,frontend -c blue,magenta \"npm --prefix backend run dev\" \"npm --prefix frontend run dev\"",
    "dev:backend": "npm --prefix backend run dev",
    "dev:frontend": "npm --prefix frontend run dev",
    "build": "npm --prefix frontend run build",
    "start": "npm --prefix backend start"
  }
}
```

### backend scripts
- `npm run dev` · `node --watch src/server.js`
- `npm start` · `node src/server.js`
- `npm run db:seed` · `node src/seed.js`
- `npm run smoke` · `node src/smoke.js`
- `npm test` · `node src/cardBuilder.test.js`

### frontend scripts
- `npm run dev` · `vite --port 5173 --host`
- `npm run build` · `vite build`
- `npm run preview` · `vite preview --port 4173`

## 展台推荐启动

```bash
cd demo
npm run setup    # 只需第一次
npm run dev      # 启动前后端
```

浏览器打开 http://localhost:5173

## 环境场景示例

### 本机开发
```bash
# 默认值即可
npm run dev
```

### 展台运行
```bash
cd demo/backend
npm run db:seed                 # 保证干净状态
cd ..
npm run dev
```

### 公网暴露（谨慎）
```bash
# 需要允许 evil-origin.com 访问时
ALLOWED_ORIGINS="https://your-demo.com,https://trusted-site.com" \
  npm start

# 生产上不要允许远程 reset
# ALLOW_REMOTE_RESET=1 会让任何源都能 reset，危险
```

### 压测场景
```bash
# 允许更高 QPS
RATE_LIMIT_CAPACITY=100 RATE_LIMIT_REFILL=50 npm start
```

## Node 版本要求

- **≥ Node 20**（用了 `node --watch` · `fs.promises` 等）
- 展台测试环境：Node 25 · 跑通
- 老版本兼容：没测过 · 不承诺

## 数据库位置

`demo/backend/data/dundao.db`（会随 server 启动创建）
`demo/backend/data/dundao.db-shm`（SQLite WAL shared memory）
`demo/backend/data/dundao.db-wal`（SQLite write-ahead log）

清库方法：
```bash
rm -f demo/backend/data/dundao.db*
npm --prefix demo/backend run db:seed
```

## Tech Stack 版本锁

### Backend
```
node        ≥ 20
express     ^4.21.0
better-sqlite3 ^11.3.0
cors        ^2.8.5
ws          ^8.18.0
```

### Frontend
```
node        ≥ 20
react       ^18.3.1
react-dom   ^18.3.1
vite        ^5.4.8
tailwindcss ^3.4.13
framer-motion ^11.11.9
zustand     ^4.5.5
```

**版本升级策略**：展台 demo 不追新 · 当前版本全部跑通 · 锁 minor。

## 下一步

→ [09-ops-runbook.md](./09-ops-runbook.md)
