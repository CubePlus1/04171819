# 13 · 白板手绘图

> 现场讲解能用的 ASCII 图 · 可直接抄到白板 / 纸上。

## 图 1 · 产品整体形态

```
┌────────────────────────────┐         ┌────────────────────────────┐
│  用户手机（真实产品）        │         │  展台 · 评委视角            │
│                            │         │                            │
│   信息流                    │         │   左屏（真实产品）          │
│   ┌──────────┐              │         │   ┌──────────┐             │
│   │ 普通视频 │              │         │   │ 普通视频 │             │
│   ├──────────┤              │    +    │   ├──────────┤             │
│   │ 履约卡片 │ ← 自动浮入   │         │   │ 履约卡片 │  ← 浮入     │
│   ├──────────┤              │         │   ├──────────┤             │
│   │ 普通视频 │              │         │   │ 普通视频 │             │
│   └──────────┘              │         │   └──────────┘             │
│                            │         │                            │
│   （UI 只有这一屏）         │         │   右屏（展台专用）           │
│                            │         │   ┌──────────────┐          │
│                            │         │   │ MindCanvas   │          │
│                            │         │   │ 5 相位可视化 │          │
│                            │         │   ├──────────────┤          │
│                            │         │   │ 触发器 A/B/C │          │
│                            │         │   └──────────────┘          │
└────────────────────────────┘         └────────────────────────────┘
```

**讲法**：
> 真实产品用户只看左屏 · 右屏是我们给您的 AI 透明化视图。

---

## 图 2 · 数据层（三张表）

```
┌─────────────────────┐        ┌──────────────────────┐
│  intent_signals     │        │  creator_actions      │
│  她过去留下的痕迹    │        │  博主今天的新动作      │
│                     │        │                      │
│  id                 │        │  id                  │
│  user_id            │        │  creator_id          │
│  creator_id ────────┼───┐    │  topic    ───────────┼──┐
│  topic     ─────────┼───┼────┤                      │  │
│  signal_type        │   │    │  action_type         │  │
│  raw_text           │   │    │  payload_json        │  │
│  occurred_at        │   │    │  occurred_at         │  │
│  fulfilled ← 原子声明│   │    └──────────────────────┘  │
└──────────┬──────────┘   │                              │
           │              │    （JOIN by topic）          │
           │              │                              │
           ▼              │                              ▼
      ┌────────────────────────────────────────────────┐
      │                                                │
      │            cards                               │
      │            成功履约的快照                      │
      │                                                │
      │    id                                          │
      │    user_id                                     │
      │    script_id (A / B / C)                       │
      │    intent_signal_id  (FK, UNIQUE ← 防重复)     │
      │    creator_action_id (FK)                      │
      │    pages_json       (P1/P2/P3 序列化)          │
      │    created_at                                  │
      │                                                │
      └────────────────────────────────────────────────┘
```

**讲法**：
> 念头（左上）× 新动作（右上）→ 履约（下）· 三张表三个生产主体。
> cards.intent_signal_id 是 UNIQUE · 数据库层面拒绝重复履约。

---

## 图 3 · 5 步管线

```
      POST /api/ambient/tick
            │
            ▼
   ╔═════════════════════════════════════════╗
   ║  ① scan   · 查她还惦记着的               ║   step 1 · 400ms
   ╠═════════════════════════════════════════╣
   ║  ② recall · 挑中最旧未接的              ║   step 2 · 400ms
   ║           + topic 没履约过               ║
   ╠═════════════════════════════════════════╣
   ║  ③ match  · JOIN creator_actions        ║   step 3 · 400ms
   ║           · 决定 A/B/C 剧本              ║
   ╠═════════════════════════════════════════╣
   ║  ④ seal   · UPDATE fulfilled=0 → 1      ║   step 4 · 400ms
   ║           · INSERT cards (UNIQUE 保护)   ║
   ║           · 全在 transaction 里          ║
   ╠═════════════════════════════════════════╣
   ║  ⑤ emit   · WS broadcast card.generated ║   step 5 · 即时
   ║           · 前端 Feed 浮入卡片           ║
   ╚═════════════════════════════════════════╝
            │
            ▼
         用户刷到这张卡（第一眼认出是她的事）
```

**讲法**：
> 每步 400ms · 总共 2 秒演完 · MindCanvas 同步演 5 相位。

---

## 图 4 · 并发保护

```
           时间
            │
            ▼

     请求 A                  请求 B        （同时到达）
        │                      │
        ▼                      ▼
     SELECT signal          SELECT signal    ← 都找到同一条
        │                      │
        ▼                      ▼
     UPDATE fulfilled=1      UPDATE fulfilled=1
     WHERE fulfilled=0       WHERE fulfilled=0
        │                      │
      changes=1              changes=0
      (赢)                    (输)
        │                      │
        ▼                      ▼
     INSERT cards           throw SIGNAL_ALREADY_FULFILLED
        │                      │
        ▼                      ▼
   card.generated          workflow.end ok=false
                           reason: signal-already-fulfilled


  数据库最终状态：
  ┌────────────────────┐
  │  signals  fulfilled=1 (一次)
  │  cards    1 row (唯一, UNIQUE 保证)
  └────────────────────┘
```

**讲法**：
> UPDATE 的原子性让两条并发里只有一条能改成功。
> 输的那条看到 changes=0 · 抛错回滚 · 不生成卡片。

---

## 图 5 · MindCanvas 5 相位

```
  时间 →  0ms      400ms     800ms     1200ms    1600ms    2000ms
         ┌─────────┬─────────┬─────────┬─────────┬─────────┐
 phase:  │  scan   │  recall │  match  │  seal   │  emit   │
         └─────────┴─────────┴─────────┴─────────┴─────────┘
 视觉:    ● ● ● ●   ● ●[●]● ● [●]━━━[●]  ⊙[●]      ↗↗
         呼吸       focus      连线      金印      飞出
         所有节点   放大        signal   章        左上
                              ↕            
                              action

  nodes = 下面所有 signal + action 节点
  focus_signal_id = 挑中的那一条 (黑色 ● 放大)
  focus_action_id = 配对的动作 (右侧 ● 放大)
```

**讲法**：
> 5 个相位让 AI 的决策前台化 · 评委能看见每一步在干什么。
> prefers-reduced-motion 下动画全关，但 focus 和连线依然静态可见。

---

## 图 6 · WebSocket 事件流

```
  前端                         后端
    │                           │
    │──── POST /api/ambient/tick─▶│
    │                           │
    │                           │ broadcast workflow.begin
    │◀── (WS) workflow.begin ───│
    │                           │ sleep 400ms
    │◀── (WS) workflow.step 1 ──│  (含 mind.phase='scan')
    │                           │ sleep 400ms
    │◀── (WS) workflow.step 2 ──│  (含 mind.phase='recall')
    │                           │ sleep 400ms
    │◀── (WS) workflow.step 3 ──│  (含 mind.phase='match')
    │                           │ sleep 400ms (atomic claim + insert)
    │◀── (WS) workflow.step 4 ──│  (含 mind.phase='seal', card_id)
    │                           │ sleep 400ms
    │◀── (WS) workflow.step 5 ──│  (含 mind.phase='emit')
    │◀── (WS) card.generated ───│  (含完整 card payload)
    │◀── (WS) workflow.end ─────│  (ok=true, cardId)
    │                           │
    │◀── HTTP 200 (tick return) │
    │                           │
    │  ...显示卡片浮入...        │
    │                           │
```

**讲法**：
> 前端一个 tick POST · 后端通过 WS 广播 5 个 step + 1 个 card + 1 个 end · 前端同步演进可视化。
> 广播给**所有** connected clients · 多屏演示天然支持。

---

## 图 7 · 安全层（7 层）

```
  恶意请求 evil.example.com
       │
       ▼
┌─────────────────────────────┐
│ ① CORS origin 校验          │ ← 不匹配 allowlist · 浏览器自动阻断
├─────────────────────────────┤
│ ② WS origin (verifyClient)  │ ← WebSocket 握手拒绝
├─────────────────────────────┤
│ ③ Body size (64KB)          │ ← 超限 413 JSON
├─────────────────────────────┤
│ ④ JSON parse 错误 → JSON    │ ← 无效 body 不返回 HTML
├─────────────────────────────┤
│ ⑤ Rate limit (token bucket) │ ← IP 限流 · 429 + Retry-After
├─────────────────────────────┤
│ ⑥ Reset 本机限制            │ ← 非 loopback 直接 403
├─────────────────────────────┤
│ ⑦ 数据层原子声明 + UNIQUE    │ ← 业务一致性
└─────────────────────────────┘
       │
       ▼
  合规请求才能抵达业务逻辑
```

**讲法**：
> 7 层防御 · 不是过度设计 · 都是 10 轮 codex review 真发现。展台插公网 WiFi 也不担心。

---

## 图 8 · 姊妹实验对比（主 demo vs Echo）

```
     主 demo (dundao-demo · 双面板)           Echo (dundao-echo · 单列对话)
     ─────────────────────────────         ─────────────────────────────
     架构：Express + WS + SQLite            原生 Node http + SSE + in-memory
     前端：React + Tailwind + 12 主题      React + 原生 CSS（零 Tailwind）
     布局：7/5 双面板                       单列阅读流
     卡片：信息流浮入（符合赛道三）         对话气泡 + 最终明信片
     节奏：9s/轮 ambient tick               8s/轮 server push
     
     状态：★★★★★ 主方案                   状态：★★ 冻结 · 未采用
     符合赛道三：✓ 是信息流卡片             符合赛道三：✗ 是聊天流
```

**讲法**：
> 做了两个实验探索同一个原则 —— 主 demo 和 Echo。
> 主 demo 的卡片是信息流里的下一条内容 · 字面符合赛道三。
> Echo 是对话形态 · 一页聊天记录 · 不是赛道要求的"下一条内容单元"。
> 选定主 demo · Echo 作为姊妹探索归档。

---

## 画图的 tips

- **白板左上开始**：大多数评委习惯左上到右下阅读
- **先画框 再写字**：框的大小能传达重要性
- **箭头要指方向明确**：数据流向 vs JOIN vs 广播 用不同箭头
- **关键字段加圈**：UNIQUE、fulfilled、changes=1 这些要点圈起来
- **颜色只用一色**：白板不是 3D 渲染，多色看起来幼稚

## 练习

**选一张图 · 不看文档自己画 · 边画边讲** —— 能画出来 + 讲清 = 掌握了。
做到 5 张都能画 = 可以上展台。
