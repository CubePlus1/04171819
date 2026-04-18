# 蹲到了 · 展台进度真实档

> **逆风如解意 —— 把你念念不忘的，接回来。**
>
> 这份文件不做任何宣传性描述 · 只记录：哪些是真代码跑起来的 · 哪些是静态占位 · 还能做什么把赛道三拿到手。

**最后更新**：2026-04-18 · 距离展台 <约 2 天

---

## 1 · 一页结论

| 维度 | 状态 |
|---|---|
| **后端代码量** | 1,791 行 · **100% 真实逻辑**（SQL/WS/事务/并发/速率/审计） |
| **前端代码量** | ~1,765 行 React · **100% 真实**（Zustand + 真 WS 事件驱动 MindCanvas） |
| **数据库** | 真 SQLite 文件 + WAL · 3 张表 · 原子声明 + UNIQUE INDEX |
| **Fixture 剧本数** | **10 个 topic × 10 个 creator**（对应 A/B/C 三种卡片） |
| **循环模式** | `DEMO_LOOP=1` · **接完一轮自动软 reset · 前端永远看不到 pending=false** |
| **测试** | 单测 5 用例 · Smoke 全链路 · Frontend build · 全绿 |
| **AI 推理** | **规则引擎 · 非 LLM**（刻意设计，展台时延 0） |
| **视频素材** | **全部 picsum 随机占位图**（`<img>`, 非 `<video>`） |
| **商品图** | **CSS 渐变色块**（无真实商品照） |
| **人物头像** | **dicebear 卡通机器人** |
| **音频** | **零** · 无配音 / 无音效 / 无氛围声 |
| **现场落地** | localhost 单机 · 无公网部署 · 无 kiosk 自动播 |
| **45s 备援录屏** | 🔴 **未生产** |

**一句定位**：**骨架 100% 发布级 · 皮肤 100% 占位**。
评委看的是故事 + 现场手感 + 管线透明度，这三样**都立住了**。但"皮肤"一露出就是减分项——骨架越硬，皮肤越该换。

**展台循环**：`npm run dev` 已默认带 `DEMO_LOOP=1` · 10 个剧本轮流演 · 接完一轮后端软 reset（清 cards + 重置 fulfilled）· 前端的 `MAX_CARDS_IN_UI=40` 自然淘汰旧卡 · **观众从来看不到"信息流空了"的状态 · 卡片持续浮入 · 重复剧本视觉上是"下一波履约"**。

---

## 2 · slogan 与叙事锚

**正式 slogan**（统一贴合在所有展台物料 / 海报 / 录屏 / 封面）：

> **逆风如解意 —— 把你念念不忘的，接回来。**

- 前半"逆风如解意"：信息洪流里的逆向动作 · 不是顺着算法推新、而是回过头接住你留下过的
- 后半"把你念念不忘的，接回来"：产品承诺 · 对应 `intent_signals.fulfilled` 的 0→1

**三档简短文案**（派生使用，不替换主 slogan）：

| 场景 | 文案 |
|---|---|
| 10 秒电梯 | 不是推新的 · 是接回你念过的 |
| 90 秒标题 | 逆风如解意 · 信息流里的"你曾经蹲过的" |
| 海报主标 | 你念念不忘 · AI 替你接 |

---

## 3 · 逐文件 Mock / 真实审计

### 3.1 后端 · `demo/backend/src/` (1,791 行 · 全真)

| 文件 | 行 | 性质 | 细节 |
|---|---|---|---|
| `server.js` | 325 | ✅ 真 | Express + `ws` · CORS allowlist · Origin 校验 · 优雅 shutdown · 速率限制 |
| `ambient.js` | 371 | ✅ 真 | 5 步核心管线 · 真 SQL JOIN + 事务 + `UPDATE WHERE fulfilled=0` 原子声明 |
| `workflow.js` | 158 | ✅ 真 | 遗留评论触发路径 · 同样真实 |
| `cardBuilder.js` | 145 | ✅ 真 | P1/P2/P3 构造纯函数 · 对应 5 个单测 |
| `cardBuilder.test.js` | 108 | ✅ 真 | 单测 5 条 · 100% 通过 |
| `intent.js` | 136 | ✅ 真（规则） | 5 条正则规则 + fallback · **刻意不用 LLM**（见 studydocs/00） |
| `matcher.js` | 109 | ✅ 真 | intent→action 映射 |
| `smoke.js` | 201 | ✅ 真 | E2E · 全路径覆盖 · 含并发去重 / Origin 校验 / JSON 错误响应 |
| `seed.js` | 100 | ✅ 真 | 从 `fixtures.json` 注入 |
| `events.js` | 38 | ✅ 真 | WS 广播 |
| `rateLimit.js` | 34 | ✅ 真 | 令牌桶 |
| `db.js` | 35 | ✅ 真 | better-sqlite3 封装 · WAL · 关闭保护 |
| `logger.js` | 31 | ✅ 真 | pino-style · 级别过滤 |

**数据库** · `demo/backend/data/`：

- ✅ `schema.sql` · 真表结构：`users` / `creators` / `intent_signals` / `creator_actions` / `cards` · 含 UNIQUE INDEX `(user_id, topic)` 保护并发
- ✅ `dundao.db` · 真 SQLite 文件 · 跑起来就是真读写
- 🟢 `fixtures.json` · **10 个 topic × 10 个 creator**（dashan/30days/grandpa + pang/lulu/brick/mio/ken/yuri/hazel）· 单轮完整播放 ~90 秒 · 配合 LOOP_MODE 循环无限续杯

### 3.2 前端 · `demo/frontend/src/` (~1,765 行 · 全真代码 / 部分占位素材)

| 文件/目录 | 性质 | 细节 |
|---|---|---|
| `App.jsx` | ✅ 真 | WS 生命周期 · bootstrap · 快捷键 · toast · 主题注入 |
| `store/useDemoStore.js` | ✅ 真 | Zustand · 订阅真 WS 事件 |
| `components/AgentMind.jsx` (297 行) | ✅ 真 | SVG + framer-motion · **节点数据来自真后端 mind.phase 事件** |
| `components/AgentStep.jsx` (210) | ✅ 真 | 5 步 UI · idle/active/done/fail |
| `components/Feed.jsx` | ✅ 真 | 视频和卡片交错渲染逻辑 |
| `components/FeedItem.jsx` | 🟡 **图片占位** | **`<img>` 非 `<video>`** · 源为 `picsum.photos`（随机占位） |
| `components/DunCard.jsx` | ✅ 真 | 多页卡片容器 · 键盘/手势翻页 |
| `components/CardPageP1.jsx` | 🟡 混合 | 结构真 · **商品缩图是 CSS 渐变块**（无真实商品照） |
| `components/CardPageP2.jsx` | ✅ 真 | AI 解释布局 |
| `components/CardPageP3.jsx` | ✅ 真 | 行为足迹 |
| `components/AmbientPulse.jsx` | ✅ 真 | 9 秒倒计时 · 呼吸节奏 |
| `panels/ProductPanel.jsx` | ✅ 真 | 左面板容器 |
| `panels/AgentPanel.jsx` | ✅ 真 | 右面板 · 含自动 tick 引擎 |
| `themes/` (12 主题) | ✅ 真 | CSS 变量切换 · `[` `]` 键盘 |
| `api/` | ✅ 真 | bootstrap / reset / ambientTick 调用 |

### 3.3 素材 / 资产层 · 🔴 几乎全是占位

| 资产 | 现状 | 严重度 |
|---|---|---|
| **视频**（左面板 6 条 filler + 3 卡片视频） | picsum 随机 360×640 · 静态 `<img>` | 🔴 致命 · 信息流不动 |
| **博主头像** | dicebear.com 卡通机器人 | 🟠 扣质感 |
| **商品图**（P1 商品卡） | CSS 渐变 `bg-gradient-to-br` | 🔴 致命 · 购物卡片没商品 |
| **系列 5 日缩图**（D1/D7/D14/D21/D30） | picsum 随机 5 张 | 🟠 讲不出"她在变化"故事 |
| **爷爷"10s 前情提要"** | 只有封面 + 徽章文案 | 🟡 讲得出但演不出 |
| **音效**（卡片浮入 / 金印落下 / 扫描呼吸） | **零** | 🟠 错失情绪峰值 |
| **配音 / 语音解说** | **零** | 🟡 展台噪杂时无备援 |
| **海报 / 背板** | **零** | 🟠 展台视觉主体缺位 |
| **45s 备援录屏** | **零** | 🔴 risks-fallbacks 文档硬要求 |

---

## 4 · 已经做了什么（完整清单）

### 工程
- [x] Express + WS + SQLite 全栈 · 10 轮 codex review · 91/100 go
- [x] 5 步履约管线 · scan → recall → match → seal → emit
- [x] 主题级聚合履约 · 同念头只接一次
- [x] 原子声明并发保护 · UNIQUE INDEX 双保险
- [x] 优雅关闭 · WS → wss → httpServer → closeDb
- [x] 安全层 · CORS allowlist · Origin 校验 · rate limit · reset 本机限制
- [x] 服务 epoch · 重启时前端清理幽灵卡片
- [x] 多 tab clientId · 单机多开互不污染
- [x] **DEMO_LOOP=1 循环模式** · 10 topic fixture + 软 reset + hasPendingAmbient 适配 + smoke 更新

### 体验
- [x] 去掉输入框 · 纯被动履约（principle fit）
- [x] MindCanvas · 念头图谱 5 相位可视化（不是黑盒 5 步）
- [x] 9 秒自动节奏 · 无人值守也能演
- [x] 12 套可切换视觉主题 · `[` `]` 键盘
- [x] `prefers-reduced-motion` 全局尊重
- [x] 完整键盘可操作（Feed 滚 / Card 翻页 / Trigger 触发）

### 文档
- [x] `studydocs/` 15 篇 · 教学讲出后端逻辑
- [x] `docs/` 10 篇 · 工程参考
- [x] `report/` 9 篇 · 评审报告 / 风险 / 行动
- [x] 本文件 · 诚实的进度档

### 测试
- [x] cardBuilder 单测 5 条
- [x] E2E smoke 覆盖 3 剧本 + 并发 + 安全 + 边界
- [x] frontend build 零警告

---

## 5 · 还能抢什么 · 赛道三竞争力清单

按 **ROI（评委加分 / 工时）** 排序。括号内是小时估计。

### 🥇 P0 · 必须做，不做就扣分

1. **45 秒备援录屏**（2h）
   - 手机横屏对着展台 demo 录 3 遍 · 挑最顺那遍
   - 剪辑：0–5s 信息流普通视频 → 5–12s 卡片浮入 → 12–35s MindCanvas 5 相位 → 35–45s 主题切换 + slogan
   - 导出 `fallback-45s.mp4` · 放在 `demo/assets/`
   - **提示词见 `docs/10-media-prompts.md` §视频**

2. **三张商品/系列/爷爷封面替代 picsum**（1.5h）
   - 针织衫磨毛圆领真实产品图 1 张
   - 30 天变身系列 5 张进阶肖像
   - 爷爷抗美援朝老照片修复风格 1 张
   - **提示词见 `docs/10-media-prompts.md` §海报 / 商品图**

3. **feed filler 变成 loop 视频**（1h）
   - 6 条填充内容 · 每条 3–5s 无声 mp4 loop · 信息流"活过来"
   - FeedItem.jsx 改 `<video autoPlay muted loop playsInline>`
   - **提示词见 `docs/10-media-prompts.md` §视频 · filler loop**

4. **slogan 三处落地**（0.5h）
   - `README.md` · `report/00-executive-summary.md` · `studydocs/09-pitch-10sec.md`
   - 统一"逆风如解意 —— 把你念念不忘的，接回来"

### 🥈 P1 · 做了质感上一个台阶

5. **音效 · 3 个极简动效声**（1.5h）
   - 卡片浮入 · "咚" 柔和低频（200ms）
   - 金印盖下 · 木章声（300ms）
   - 扫描呼吸 · 无限循环极轻环境 pad（-24dB）
   - **提示词见 `docs/10-media-prompts.md` §音频**

6. **kiosk 自动播模式**（0.5h）
   - `/?kiosk=1` · 隐藏触发器按钮 · 9 秒循环 · reset 后自动重启
   - 无人值守时也能演 · 展台吃饭可用

7. **海报背板**（1h · 素材 AI 生）
   - A1 大小 · 主 slogan + 一张卡片浮入剪影
   - **提示词见 `docs/10-media-prompts.md` §海报**

8. **Echo 冻结 banner**（0.2h）
   - `echo/README.md` 顶部红框说明"此分支已冻结 · 原因见 `report/03-echo-analysis.md`"

### 🥉 P2 · 锦上添花（评委追问时拿出来）

9. **LLM-ready 开关演示**（1h）
   - 在 `intent.js` 加一个 `CLASSIFIER_BACKEND=rules|llm` 环境变量路径
   - LLM 分支桩函数 · 被问到时现场解释"我们预留了，展台用规则因为时延"
   - 不必真跑，演"工程预见性"

10. **"为什么是这一条"per-card 浮层**（1h）
    - 卡片右上"?" · 展开一行 rationale（来自后端 match.rationale）
    - 强化透明度叙事

11. **双语 slogan 海报**（0.5h）
    - "As if the wind understood — we brought back what you couldn't let go."
    - 国际评委席对视

12. **配音 30s 环境 loop**（1h）
    - 展台背景音（人声 or 女性旁白解说）
    - 吵闹展场里的"低语层"
    - **提示词见 `docs/10-media-prompts.md` §音频 · 旁白**

---

## 6 · 资源消耗预估

| 分级 | 总工时 | 建议人手 |
|---|---|---|
| P0 全做 | **5 h** | 必须你自己做（素材需要 taste） |
| P0 + P1 | **8.2 h** | 一人 · 展台前一晚 |
| 全做 | **11.7 h** | 一人夜战 + 半天 |

**收益曲线**：
- P0 做完 = 从"骨架裸奔"到"能上场" · 评分 +15 分
- P0+P1 做完 = 从"能上场"到"有记忆点" · 评分 +22 分
- 全做 = "展台现象级" · 评分 +25 分（封顶）

**建议**：P0 必做 · P1 挑音效 + kiosk + slogan · 其他留到赛后复盘。

---

## 7 · 我下一步会做什么

（本对话后，按你的打勾优先级）

```
□ 生成三份媒体 prompt 文件（docs/10-media-prompts.md）· 已提交
□ README 和 executive-summary 的 slogan 落地（已提交）
□ （由你执行）按 P0 / P1 使用 prompt 去跑 Midjourney / Suno / Runway
□ （由你执行）素材下来后把 picsum 替换掉 · 我可以后续批量 edit
□ （由你执行）录 45s 备援 · 手机横屏三遍挑一遍
```

---

## 8 · 链接导航

| 你想 | 打开 |
|---|---|
| 懂哲学 · 对着队友讲 | [`studydocs/00-core-philosophy.md`](./studydocs/00-core-philosophy.md) |
| 懂工程 · 改代码 | [`docs/01-architecture.md`](./docs/01-architecture.md) |
| 懂评审 · 对着自己复盘 | [`report/00-executive-summary.md`](./report/00-executive-summary.md) |
| 要 AI 生成素材 | [`docs/10-media-prompts.md`](./docs/10-media-prompts.md) · **本文的兄弟篇** |
| 10 秒抓人的一句话 | "逆风如解意 · 把你念念不忘的，接回来" |

---

## 附 · 验收签字

**什么叫 "展台 ready"**：

- [ ] P0 四项全做
- [ ] P0+P1 任选两项
- [ ] 45s 备援录屏在手机上打得开
- [ ] README 顶部 slogan 和本文一致
- [ ] 现场断网也能讲 90 秒

**打勾三项以上** = 带着骨架和一点点肉上场 · 赛道三够打。
