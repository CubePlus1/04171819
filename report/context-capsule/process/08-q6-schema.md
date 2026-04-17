# Q6 · Schema v1.0 推演

## 问题

> 接下来这个问题是**整个产品的灵魂**——"情境预言胶囊"这个新数据形式的 schema 到底长什么样。

## 推演方法

用**"功能倒推字段"** 的方法：

```
已定的 7 大特性
    │
    ▼
每个特性对应 1 层字段
    │
    ▼
7 层 schema
```

### 7 大特性（来自 Q1-Q5 决策）

| # | 特性 | 对应层 | 字段 |
|---|---|---|---|
| 1 | 情境识别（懂"此刻"） | Layer ① 情境层 | `situation_vec` |
| 2 | 多模态 brief | Layer ② 内容层 | `title / hero_visual / tts / fields` |
| 3 | 证据可追 | Layer ③ 证据层 | `evidence_chips` |
| 4 | 直接出成果 | Layer ④ 决策层 | `decisions` |
| 5 | 变形能力 | Layer ⑤ 变形层 | `forks` |
| 6 | 反馈增强 | Layer ⑥ 反馈层 | `feedback_anchors` |
| 7 | 可审计（评委） | Layer ⑦ Agent trace 层 | `agent_trace` |

---

## Schema v1.0 草稿

详见 `../04-schema.md`。

## Schema 是否完整？

### 对齐检查

| 官方题面要素 | 对应层 |
|---|---|
| "新的信息流内容单元" | 整体 7 层结构（vs 视频 / 卡片 / 对话） |
| "不只是被观看" | Layer ④ 决策 + Layer ⑤ 变形 + Layer ⑥ 反馈 |
| "在被刷到的那一刻" | Layer ① `now` + `predicted_moment` |
| "信息" | Layer ② 结构化 + Layer ③ 证据 |
| "情绪" | Layer ② TTS + hero_visual |
| "选择" | Layer ④ decisions + Layer ⑤ forks |
| "刚好准备好" | Layer ① predicted_moment |

全部对齐。

### 用户能问的问题

| 用户行为 | 用 schema 的哪层回答 |
|---|---|
| "为什么推给我？" | Layer ③ 证据 + Layer ⑦ trace |
| "我不要这个" | Layer ⑥ 反馈 |
| "换个地方" | Layer ⑤ 变形 |
| "系统怎么知道我要去玩？" | Layer ① 情境（event: 五一） |
| "我决定了" | Layer ④ 决策（primary action） |

没有未覆盖的用户问题。

---

## 7 层的设计哲学

### 对应"懂你"的全链路

```
我知道你在哪个情境（①）
→ 我知道有什么证据（③）
→ 我把证据聚合成 brief（②）
→ 我给你可执行选项（④）
→ 你可以变形（⑤）
→ 你可以反馈（⑥）
→ 全过程可追溯（⑦）
```

### 为什么是 7 层，不是 5 或 10？

- **少于 7 层**：会合并"情境"和"决策"，失去时间预言这个核心创新
- **多于 7 层**：比如加"社交层"（一起看）、"历史层"（昨天的胶囊）会让 schema 失焦
- **7 层**：覆盖"懂 → 展 → 决 → 改 → 反馈 → 审计" 全链路，无冗余

---

## 用户对 Schema 的反应

> "只做产品设计，不做实现，先落地一个 idea 文档，描述可行性，解决的痛点等等..."

用户没有对 schema 做字段级修改，直接进入"归档文档化"阶段。
这表示 schema v1.0 **被默认接受**。

后续如有修改，在实施阶段 freeze 时具体字段再改。

---

## Schema 的 MVP 分级

详见 `../04-schema.md` 的"字段复杂度分级"章节。

核心原则：**7 层都要有 UI 呈现，但只有 1-2 层是"真跑"（Layer ② 真 TTS、Layer ⑦ 真 trace 可选），其余预计算。**

---

## 推演决策

| 项目 | 决策 |
|---|---|
| Schema 版本 | v1.0 |
| 层数 | 7 层 |
| 关键创新字段 | `predicted_moment`、`forks`、`agent_trace` |
| MVP 真跑层 | Layer ② TTS + Layer ⑦ Trace（评委模式） |
| MVP 预计算层 | Layer ①③④⑤⑥ |
| 下一阶段 | 用户要求落地文档，进入归档阶段 |
