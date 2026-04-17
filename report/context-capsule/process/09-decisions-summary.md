# 决策汇总表

> 本推演全部决策点一览。每一行都可以追溯到对应的 Q 推演文档。

---

## 核心决策表

| # | 决策点 | 选择 | 核心理由 | 推演文档 |
|---|---|---|---|---|
| 1 | 赛道选择 | **赛道三 · AI 体验** | 体验权重下 demo_wow 最强，10 秒门槛最低 | [`01-track-selection.md`](01-track-selection.md) |
| 2 | 权重反转 | **体验 > 长期契合** | 用户明确"游园会拉大、体验最重要" | [`01-track-selection.md`](01-track-selection.md) |
| 3 | 参考方案定位 | **v0 起点，要升级** | 参考图是被动 / 静态 / 单模态 / 黑盒的 | [`02-reading-brief.md`](02-reading-brief.md) |
| 4 | wow 机制 | **D 重新定义**（突破 ABC） | 用户提出新媒介愿景 | [`03-q1-wow-mechanism.md`](03-q1-wow-mechanism.md) |
| 5 | 载体形态 | **A+C 组合**（Feed 沉浸 + 评委侧屏） | 双受众必须分路 | [`04-q2-carrier-form.md`](04-q2-carrier-form.md) |
| 6 | "懂你"重定义 | **懂"情境" + 懂"预言"** | 观众共享此刻 + 戏剧张力 | [`05-q3-redefine-and-dataform.md`](05-q3-redefine-and-dataform.md) |
| 7 | 新数据形式 | **情境预言胶囊（Context Capsule）** | 融合 A+B 的命名 | [`05-q3-redefine-and-dataform.md`](05-q3-redefine-and-dataform.md) |
| 8 | Layer ⑦ Agent Trace 优先级 | **评委 Bonus（可砍）** | 用户明确"给评委看，没时间可以不做" | [`05-q3-redefine-and-dataform.md`](05-q3-redefine-and-dataform.md) |
| 9 | 主 demo 叙事 | **五一春游预言 90s** | 贴参考图 + 时间点完美 + 变形戏剧 | [`06-q4-narrative.md`](06-q4-narrative.md) |
| 10 | Bonus 叙事 | **晚饭预言台 30s** | 反驳单场景硬编码 + 垂类覆盖扩大 | [`06-q4-narrative.md`](06-q4-narrative.md) |
| 11 | 工程基调 | **γ 双模切换流** | 观众稳 + 评委真 | [`07-q5-engineering.md`](07-q5-engineering.md) |
| 12 | 预算分配 | **40 前端 / 25 agent / 20 素材 / 15 联调** | 体验优先的预算 | [`07-q5-engineering.md`](07-q5-engineering.md) |
| 13 | 胶囊矩阵 | **6 目的地 × 3 persona = 18 胶囊** | 支持变形不露馅 | [`07-q5-engineering.md`](07-q5-engineering.md) |
| 14 | Schema 版本 | **v1.0 · 7 层结构** | 对齐题面全要素 | [`08-q6-schema.md`](08-q6-schema.md) |

---

## 关键参数表

| 参数 | 值 | 出处 |
|---|---|---|
| 赛道 | 三 | 决策 #1 |
| 主 demo 时长 | 90s | 决策 #9 |
| Bonus 时长 | 30s | 决策 #10 |
| 胶囊矩阵规模 | 6×3=18 | 决策 #13 |
| Schema 层数 | 7 | 决策 #14 |
| 前端占比 | 40% | 决策 #12 |
| Agent 占比 | 25% | 决策 #12 |
| 素材占比 | 20% | 决策 #12 |
| 联调占比 | 15% | 决策 #12 |
| Kill criteria 节点 | H+8/16/24/30/36 | `../06-feasibility.md` |

---

## 核心术语表

| 术语 | 定义 | 首次出现 |
|---|---|---|
| Context Capsule | 本方案提出的新数据单元，7 层结构 | 决策 #7 |
| SituationVec | 情境向量，区别于 PersonVec | `../04-schema.md` Layer ① |
| Materialize | 胶囊从"预言"状态变为"呈现"状态 | `../05-demo.md` |
| Fork（变形） | 同胶囊换参数重渲染 | 决策 #9 |
| Agent Trace | agent 决策过程的可审计记录层 | 决策 #8 |
| γ 双模切换 | 观众模式（预计算）+ 评委模式（真 agent） | 决策 #11 |
| L3 情境懂 | 把"懂你"的颗粒度从个体换成情境 | 决策 #6 |

---

## 决策路径图

```
权重反转（长期契合 → 体验）
    │
    ▼
排除赛道一（容器错位）、赛道四（资产无继承）
    │
    ▼
赛道二 vs 三：选三（体验权重下全胜）
    │
    ▼
题面深读："刚好" = 精准，不是多样
    │
    ▼
Q1 wow 机制：D（用户提出新媒介愿景）
    │
    ▼
Q2 载体：A+C（双受众分路）
    │    + 浮现 "观众不能被懂" 结构困境
    │    + 突围：重新定义懂你 + 新数据形式
    ▼
Q3 重定义：懂情境 + 懂预言 = 情境预言胶囊
    │    + Layer ⑦ 降到评委 bonus
    ▼
Q4 叙事：五一春游 90s + 晚饭 bonus 30s
    │
    ▼
Q5 工程：γ 双模切换
    │
    ▼
Q6 Schema：7 层 v1.0
    │
    ▼
归档为产品设计文档（本文件夹）
```

---

## 尚未回答的问题（留给实施阶段）

| 问题 | 留给 |
|---|---|
| 展台物理形态（屏数 / 布局 / 触发机制） | 实施阶段 |
| 胶囊字段细节 freeze | 实施阶段 |
| 素材 authoring 清单 | 实施阶段 |
| 双模切换的技术开关 | 实施阶段 |
| 40h 逐小时时间表 | 实施阶段 |
| 前端框架选型 | 实施阶段 |
| 胶囊渲染引擎设计 | 实施阶段 |
| 人员分工 | 实施阶段 |
