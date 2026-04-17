# 情境预言胶囊（Context Capsule）

> 字节 Hackathon 2026 · 赛道三｜AI 体验｜刷到懂你的瞬间
>
> 参赛 idea 设计 · v1.0 · 2026-04-17 · 产品设计阶段（非实现）

---

## 一句话 pitch

> **一种新的信息流数据单元 —— 在你刷到的那一刻，系统已经把"你下一个决策点"的信息、情绪与选择刚好准备好。**

不是卡片。不是视频。不是对话。
是一种**可执行、可变形、可反馈、可审计、带时间预言的多轨情境对象**。

---

## 文档导航

### 产品设计（本文件夹）

| 文件 | 内容 | 读给谁看 |
|---|---|---|
| [`01-brief.md`](01-brief.md) | 官方题面深读 + 参考方案解读 | 所有人（起点） |
| [`02-pain-points.md`](02-pain-points.md) | 4 个核心痛点 | 评委、产品 |
| [`03-concept.md`](03-concept.md) | 核心概念 + 重新定义"懂你" | 所有人（哲学核心） |
| [`04-schema.md`](04-schema.md) | Schema v1.0 · 7 层结构 | 技术评委 |
| [`05-demo.md`](05-demo.md) | 展台主 demo 90s + Bonus 30s | 所有人（体验核心） |
| [`06-feasibility.md`](06-feasibility.md) | 可行性 + 资产 + 工程预算 + 风险 | 技术评委、执行团队 |
| [`07-differentiation.md`](07-differentiation.md) | 差异化 + 长期目标 + 下一步 | 评委 |

### 设计推演过程（`process/` 子文件夹）

| 文件 | 内容 |
|---|---|
| [`process/README.md`](process/README.md) | 推演总览 |
| [`process/01-track-selection.md`](process/01-track-selection.md) | 阶段 0：四赛道筛选 + 权重反转 |
| [`process/02-reading-brief.md`](process/02-reading-brief.md) | 赛道三题面深读 + 参考方案解读 |
| [`process/03-q1-wow-mechanism.md`](process/03-q1-wow-mechanism.md) | Q1 · wow 机制推演 |
| [`process/04-q2-carrier-form.md`](process/04-q2-carrier-form.md) | Q2 · 载体形态 + 双受众约束 |
| [`process/05-q3-redefine-and-dataform.md`](process/05-q3-redefine-and-dataform.md) | Q3 · 重新定义"懂你" + 新数据形式 |
| [`process/06-q4-narrative.md`](process/06-q4-narrative.md) | Q4 · 主 demo 叙事线路 |
| [`process/07-q5-engineering.md`](process/07-q5-engineering.md) | Q5 · 工程基调推演 |
| [`process/08-q6-schema.md`](process/08-q6-schema.md) | Q6 · Schema 推演 |
| [`process/09-decisions-summary.md`](process/09-decisions-summary.md) | 决策汇总表 |
| [`process/10-insights.md`](process/10-insights.md) | 核心 insight 沉淀 |

---

## 快速阅读路径

- **评委视角（5 分钟）**：`01-brief.md` → `03-concept.md` → `05-demo.md`
- **产品视角（10 分钟）**：`01` → `02` → `03` → `05` → `07`
- **技术视角（15 分钟）**：`03` → `04` → `06` → `process/08-q6-schema.md`
- **推演视角（追溯"为什么这么设计"）**：完整读 `process/`

---

## 相关文件

- `../dimage.png` — 官方内部参考方案截图（莫干山越野跑攻略卡）
- `../four-tracks-deep-analysis.md` — 四赛道深度解析
- `../002.md` — 四赛道策略判断
- `../../py/output/bytecamp-100/reports/master_report.md` — 24 方向 Codex 调研
- `../../langchain/output/20260415-142925/report.md` — 11 方向 Claude 评审

---

## 版本与作者备注

- v1.0 · 2026-04-17 · 初稿落地，idea 阶段完成
- 所有实施细节（前端框架、组件结构、40h 时间表）**不在本阶段**，留到下一阶段
- 本 idea 文档可独立存档、可 git、可共享
