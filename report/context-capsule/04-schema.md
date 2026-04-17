# 04 · Schema v1.0 · 7 层结构

## Schema 全貌

```
ContextCapsule v1.0
│
├─ ① 情境层｜"懂你的此刻"
├─ ② 内容层｜"多模态 brief"
├─ ③ 证据层｜"每个要点可追溯"
├─ ④ 决策层｜"直接出成果"
├─ ⑤ 变形层｜"同情境不同参数"
├─ ⑥ 反馈层｜"强化学习 hook"
└─ ⑦ Agent trace 层｜"评委模式专属"
```

7 层从底到顶的逻辑链：

```
情境识别 → 找证据 → 做内容 → 给决策 → 留变形 → 收反馈 → 留审计
   ①         ③       ②       ④       ⑤       ⑥       ⑦
```

---

## Layer ① 情境层 · "懂你的此刻"

**作用**：锚定胶囊面向的情境（时空 + 群体 + 事件）。

**伪 schema**：
```yaml
situation_vec:
  now:                 2026-04-17T15:00
  predicted_moment:    2026-05-01T08:00   # ← 预言目标时刻
  weather:             "多云转小雨"
  season:              "春末"
  event:               "五一假期"
  group:               "大学生·寝室三人局"
  mood_inference:      "微兴奋 + 想出游"
  budget_range:        "¥800-1500/人"
  location_hint:       "杭州周边 200km"
```

**关键字段**：
- `now` vs `predicted_moment`：双时间是核心创新点，让胶囊带预言能力
- `event`：绑定具体时间锚点（五一 / 清明 / 世界杯 / 期末）
- `group`：群体人格，不是个体身份

**对标**：PersonVec 是个体嵌入，SituationVec 是情境嵌入。本方案不做 PersonVec，做 SituationVec。

---

## Layer ② 内容层 · "多模态 brief"

**作用**：胶囊的主体展示，多模态同步编排。

**伪 schema**：
```yaml
title:  "五一莫干山寝室三人局 · 1200 预算打穿"
hero_visual:
  type:     "dynamic_route_map"   # Lottie / video / 3D
  asset:    "/assets/mogan_route.lottie"
  duration_ms: 8000
tts_narration:
  voice:    "warm_female_zh"
  text:     "这是我为你准备的——五一 + 轻徒步 + 寝室三人局 · 3 天 1200 预算能打"
  duration_ms: 10000
structured_fields:
  - {label: "目的地", value: "莫干山"}
  - {label: "天数",   value: "3 天 2 夜"}
  - {label: "气温",   value: "17-24°C"}
  - {label: "路线",   value: "竹林 + 溪流 + 废墟"}
  - {label: "预算",   value: "¥1200/人"}
  - {label: "交通",   value: "杭州东站 + 高铁 22min"}
```

**多轨同步**：TTS 念到"1200 预算能打"时，`structured_fields` 里"预算"那一行高亮，`hero_visual` 里路线图的预算标签浮现。这不是"视频 + 字幕"的堆叠，是**多轨编排的多模态数据**。

**对标**：网页是"HTML + CSS + JS"的多轨，胶囊是"结构化 + 视觉 + 语音 + 动效"的多轨。

---

## Layer ③ 证据层 · "每个要点可追溯"

**作用**：让胶囊里每一个论断都可以追溯到源视频。

**伪 schema**：
```yaml
evidence_chips:
  - quote: "钻林子当猴子其乐无穷"
    source_video:
      thumb:  "/assets/video1_thumb.jpg"
      title:  "莫干山越野跑全记录"
      author: "越野跑博主·阿猴"
  - quote: "莫干山山顶喝咖啡超 nice"
    source_video:
      thumb:  "/assets/video2_thumb.jpg"
      title:  "莫干山顶咖啡日记"
      author: "露营博主·小雪"
  # ... 共 3-5 条
```

**设计要点**：
- 每个 chip 是"博主原话 + 视频缩略图"，不是"AI 重写的观点"
- 保留原语气、原措辞，这是可信度的关键
- 缩略图可点击回视频（feed 内嵌跳回）

**对标参考图**：参考图 `../dimage.png` 的"运动&旅行博主攻略"就是这层的 v0。本方案保留并强化这一层。

---

## Layer ④ 决策层 · "直接出成果"

**作用**：让胶囊"不只是被观看"，点击后直接出决策成果。

**伪 schema**：
```yaml
decisions:
  - label:   "出发"
    action:  "generate_itinerary"
    primary: true
  - label:   "换目的地"
    action:  "fork(location)"
  - label:   "换人群"
    action:  "fork(group)"
```

**设计要点**：
- `primary` action 是"直接出成果"（生成具体行程 / 导航 / 订餐列表）
- 其他 action 是"变形"，对应 Layer ⑤
- 不跳转外部页面，在胶囊内完成

**对标参考图**：参考图只有"不感兴趣 / 查看详情"两个按钮，其中"查看详情"是跳转。本方案保留"不感兴趣"到 Layer ⑥（反馈），其余 action 不跳转。

---

## Layer ⑤ 变形层 · "同情境不同参数"

**作用**：胶囊的核心 wow 来源——同一情境胶囊可以换参数重渲染。

**伪 schema**：
```yaml
forks:
  by_location: ["莫干山", "安吉", "千岛湖", "西塘"]
  by_group:    ["寝室三人", "情侣二人", "社团 6 人", "独自"]
  by_budget:   ["省钱 600", "标准 1200", "舒适 2500"]
```

**关键区分 "变形" vs "重新生成"**：

| 重新生成 | **变形** |
|---|---|
| 丢失上下文 | 保留情境向量 |
| 从头来 | 换参数重渲染 |
| ChatGPT "再来一次" | 胶囊 fork by_location |
| 输出不可对齐 | 输出可对齐（同情境） |

**展台 wow 点**：观众点"换目的地" → 胶囊**实时变形**为"安吉骑行"，同情境同时刻同预算，只换一个参数。路线图、证据 chips、TTS 全部重排。这个"重渲染的戏剧性"比传统三列并列更有冲击。

---

## Layer ⑥ 反馈层 · "强化学习 hook"

**作用**：反馈不是黑箱（只 like / dislike），而是带语义的回写。

**伪 schema**：
```yaml
feedback_anchors:
  - label:   "不感兴趣"
    effect:  "dampen_tag(outdoor)"
  - label:   "更多这样的"
    effect:  "boost_tag(hiking + budget)"
  - label:   "太贵了"
    effect:  "lower_budget_band"
```

**设计要点**：
- 每个反馈锚点都有**语义 effect**，直接回写 `situation_vec`
- 不是端到端的"这条不喜欢"，是"你不喜欢 `outdoor` 标签"
- 用户能理解自己的反馈如何影响下一胶囊（可解释性）

**与传统推荐的区别**：
- 传统推荐反馈：dislike → 黑盒扣分
- 本方案反馈：dislike → 明确语义改 `situation_vec.tags`

---

## Layer ⑦ Agent Trace 层 · "评委模式专属"

**作用**：展示 agent 生成这个胶囊的过程，让"懂"可审计。

**伪 schema**：
```yaml
agent_trace:
  rag_queries:
    - "五一 周边游 大学生"
    - "莫干山 轻徒步"
    - "寝室三人游 1200 预算"
  retrieved_videos_count: 12
  extracted_points_count: 34
  candidates:
    - "莫干山"
    - "安吉"
    - "千岛湖"
    - "舟山"
    - "西塘"
    - "新昌"
  selected_reason: "预算匹配 + 轻徒步 + 交通最便利"
  generation_tokens: 1847
  latency_ms: 3200
```

**展台用法**：
- 默认观众模式**折叠**此层
- 评委模式按钮切换 **展开** 此层（侧屏显示）
- 可选：鼠标悬停在任一 `evidence_chip` 上，高亮其对应的 `rag_query`

**对标**：这是把传统推荐系统的"黑盒决策"**显式化为数据层**。

---

## 7 层之间的数据流

```
┌─────────────────────────────────────────────────────────┐
│                    ① 情境层                              │
│              situation_vec (now, moment, ...)           │
└──────────────┬─────────────────────────┬────────────────┘
               │                         │
               ▼                         ▼
      ┌────────────────┐       ┌─────────────────┐
      │  ③ 证据层       │       │   ⑦ Agent Trace │
      │ evidence_chips  │◀──────│   (评委专属)     │
      └────────┬───────┘       └─────────────────┘
               │
               ▼
      ┌────────────────┐
      │   ② 内容层      │
      │ title, hero,    │
      │ tts, fields     │
      └────────┬───────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌────────────┐  ┌────────────┐
│ ④ 决策层    │  │ ⑤ 变形层   │
│ decisions   │  │  forks     │
└────────────┘  └────────────┘
       │
       ▼
┌────────────┐
│ ⑥ 反馈层    │
│ feedback_   │──回写──▶ ① 情境层
│  anchors    │         （下一胶囊会受影响）
└────────────┘
```

闭环：反馈层回写到情境层，下一胶囊会受影响。
这就是"用户反馈重新加强推荐"的数据形式化表达。

---

## 字段复杂度分级

| 层 | MVP 必做 | 时间充裕再加 |
|---|---|---|
| ① 情境层 | now, predicted_moment, event, group, budget | weather, mood_inference, location_hint |
| ② 内容层 | title, structured_fields, hero_visual | tts_narration（预合成）, 动效 |
| ③ 证据层 | 3 个 chip（原话 + 缩略图） | 可点击回视频、原视频播放 |
| ④ 决策层 | 3 个 action（出发 / 换地 / 换人） | generate_itinerary 真实生成 |
| ⑤ 变形层 | by_location (4 option) | by_group, by_budget |
| ⑥ 反馈层 | 3 个 anchor 的 UI 显示 | 真实回写 situation_vec |
| ⑦ Agent trace | 仅评委模式展示 | 真实链路运行 |

**40h MVP 原则**：7 层都要有 UI 呈现，但只有 1-2 层是"真跑"（Layer ② 真 TTS、Layer ⑦ 真 trace 可选），其余预计算。

详细工程预算见 [`06-feasibility.md`](06-feasibility.md)。
