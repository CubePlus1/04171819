# docs · 开发文档

> 这里是**工程参考文档**。找"怎么启、怎么测、怎么部署、契约长什么样" → 查这里。
>
> 想了解**产品定位 / 为什么这么设计**：看 `../studydocs/`
> 想看**赛道三评审结论**：看 `../report/`

## 文档清单

| 文档 | 主题 |
|---|---|
| [01-architecture.md](./01-architecture.md) | 整体架构 · 模块层级 · 数据流 |
| [02-api-contract.md](./02-api-contract.md) | HTTP + WebSocket 契约 · 完整字段 |
| [03-data-model.md](./03-data-model.md) | SQLite schema · 表关系 · 索引 |
| [04-ambient-pipeline.md](./04-ambient-pipeline.md) | 5 步管线实现 · mind.phase 协议 |
| [05-theme-system.md](./05-theme-system.md) | 12 主题切换 · token 扩展 |
| [06-frontend-components.md](./06-frontend-components.md) | 前端组件树 · 状态流 |
| [07-testing-matrix.md](./07-testing-matrix.md) | smoke + unit + integration 测试 |
| [08-config-env.md](./08-config-env.md) | 环境变量 · 配置项 |
| [09-ops-runbook.md](./09-ops-runbook.md) | 启停 · 重置 · 常见问题排查 |

## 快速入口

### 我想现在启动 demo
→ [09-ops-runbook.md · 启停](./09-ops-runbook.md)

### 我想理解前后端契约
→ [02-api-contract.md](./02-api-contract.md)

### 我想加一个新剧本
→ [03-data-model.md · 种子数据](./03-data-model.md) + [04-ambient-pipeline.md · action_type 映射](./04-ambient-pipeline.md)

### 我想加一个新视觉主题
→ [05-theme-system.md · 添加 theme](./05-theme-system.md)

### 我想跑全部测试
→ [07-testing-matrix.md](./07-testing-matrix.md)

## 关键约束

看这套代码前请先了解：

1. **单用户 demo**：所有业务走 `demo-user` 硬编码 · 生产要加 auth
2. **规则引擎**：意图分类 / topic 匹配都是规则 · 不是 LLM · 展台时延稳定优先
3. **主题聚合**：履约按 topic 去重 · 同一念头只接一次
4. **原子声明**：并发防护基于 `UPDATE ... WHERE fulfilled=0` + changes 检查
5. **契约解耦**：`mind.phase` 独立于 `step` · 前后端可独立演化

详细看各分文档。

## 维护

这套文档和代码一起维护。代码改了对应文档要同步。
特别是：
- API 字段变化 → 更新 `02-api-contract.md`
- 加表 / 加字段 → 更新 `03-data-model.md`
- 5 步管线调整 → 更新 `04-ambient-pipeline.md`

契约文件（`shared/contracts.js`）是**单一事实源**。文档是其可读描述 · 不是原始定义。
