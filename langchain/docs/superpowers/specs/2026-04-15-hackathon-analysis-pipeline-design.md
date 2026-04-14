# Hackathon 方向分析管线 — 设计文档

> 日期: 2026-04-15
> 状态: 待实现

---

## 1. 目标

构建一个 LangGraph 编排的多轮分析管线，对字节跳动 hackathon 的 12 个候选方向进行：需求分析、可行性分析（含 GitHub 开源调研）、多轮筛选，最终输出展示效果最优的推荐方案。

核心评判标准：**游园会展示效果**（40 小时内做出成品，面向大学生展览）。

---

## 2. 架构概览

双引擎架构：

- **Codex CLI**（预算受控）— 做研究、GitHub 调研、创意生成
- **本机 Claude Code Opus 4.6 max**（预算限制）— 做评审、打分、筛选
- **LangGraph** — 编排两者
- **PostgreSQL + pgvector** — 持久化结果 + 跨轮次发现积累

```
┌─────────────┐
│  load_dirs  │  解析方向文档 → 写入 PG
└──────┬──────┘
       ▼
┌─────────────┐
│ plan_budget │  动态规划每轮调用分配
└──────┬──────┘
       ▼
┌──────────────────────────────────────────────┐
│              round_loop (循环)                 │
│                                               │
│  ┌───────────┐                                │
│  │ fan_out   │  ≤3 并发，每方向 1 次 Codex     │
│  │ research  │  初研/深研（含 GitHub 调研）     │
│  └─────┬─────┘                                │
│        ▼                                      │
│  ┌───────────┐                                │
│  │ store_pg  │  结果写入 PG                    │
│  └─────┬─────┘                                │
│        ▼                                      │
│  ┌───────────┐                                │
│  │ evaluate  │  Claude Opus 4.6 评审打分       │
│  │           │  注入 PG 中所有已有结果做横向对比 │
│  └─────┬─────┘                                │
│        ▼                                      │
│  ┌───────────┐                                │
│  │ filter    │  按评分淘汰 + 硬规则兜底         │
│  └─────┬─────┘                                │
│        ▼                                      │
│  ┌───────────┐                                │
│  │ check     │  预算耗尽? 轮次到? 存活≤3?      │
│  │ converge  │                                │
│  └─────┬─────┘                                │
│     ┌──┴──┐                                   │
│    继续  收敛                                   │
│     ▼     ▼                                   │
│   回到   退出 loop                              │
│  fan_out                                      │
└──────────────────────────────────────────────┘
       ▼
┌─────────────┐
│final_report │  Claude 生成最终推荐报告
└──────┬──────┘
       ▼
┌─────────────┐
│  export     │  输出 Markdown + JSON 到文件系统
└─────────────┘
```

---

## 3. 预算动态规划

### 3.1 CLI 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--codex-budget` | 50 | 总 Codex 调用预算 |
| `--rounds` | 2 | 最大筛选轮数 |
| `--concurrency` | 3 | 并发上限 |
| `--survive-ratio` | 0.5 | 每轮存活率 |
| `--docs` | (必填) | 方向文档路径，支持多个 |
| `--plan-only` | false | 只输出预算规划，不执行 |

### 3.2 分配逻辑

假设 N 个方向、R 轮、存活率 S：

```
第 1 轮: N 次 Codex（初研）
第 2 轮: ceil(N × S) 次（深研）
第 3 轮: ceil(N × S²) 次
...
总消耗 = N + ceil(N×S) + ceil(N×S²) + ... + ceil(N×S^(R-1))
```

12 方向、2 轮、50% 存活率：12 + 6 = 18 次 Codex。

启动时检查：如果总消耗 > budget，自动减少轮数并打印警告。

---

## 4. PostgreSQL Schema

数据库名: `hackathon_lab`，用户: `lab`，密码: `lab123`。

```sql
CREATE TABLE directions (
    slug            TEXT PRIMARY KEY,
    source_key      TEXT NOT NULL,
    index           INT NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    research_prompt TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE research_results (
    id              SERIAL PRIMARY KEY,
    run_id          TEXT NOT NULL,
    round           INT NOT NULL,
    slug            TEXT NOT NULL REFERENCES directions(slug),
    phase           TEXT NOT NULL,           -- "initial" / "deep"
    prompt          TEXT NOT NULL,
    result          JSONB NOT NULL,
    codex_model     TEXT,
    duration_ms     INT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE evaluations (
    id              SERIAL PRIMARY KEY,
    run_id          TEXT NOT NULL,
    round           INT NOT NULL,
    slug            TEXT NOT NULL REFERENCES directions(slug),
    scores          JSONB NOT NULL,
    alive           BOOLEAN NOT NULL,
    rationale       TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE discoveries (
    id              SERIAL PRIMARY KEY,
    run_id          TEXT NOT NULL,
    round           INT NOT NULL,
    slug            TEXT,                    -- NULL = 全局发现
    category        TEXT NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE runs (
    run_id          TEXT PRIMARY KEY,
    config          JSONB NOT NULL,
    status          TEXT DEFAULT 'running',
    started_at      TIMESTAMPTZ DEFAULT now(),
    finished_at     TIMESTAMPTZ
);
```

### 4.1 evaluations.scores 结构

```json
{
    "demo_wow": 8,
    "feasibility_40h": 7,
    "data_availability": 6,
    "reuse_fit": 7,
    "innovation": 5,
    "weighted_total": 7.05
}
```

权重: `demo_wow×0.35 + feasibility_40h×0.25 + data_availability×0.2 + reuse_fit×0.15 + innovation×0.05`

### 4.2 硬规则淘汰

- `demo_wow < 5` → 直接淘汰
- `feasibility_40h < 4` → 直接淘汰
- `data_availability < 3` → 直接淘汰

---

## 5. Codex 输出 Schema

每次 Codex 调用返回统一 JSON 结构。initial 阶段部分字段为 null，deep 阶段全部填充。

```json
{
    "slug": "string",
    "title": "string",
    "track": "string",
    "one_liner": "string",

    "requirement_analysis": {
        "target_user": "string",
        "core_pain": "string",
        "value_proposition": "string"
    },

    "feasibility": {
        "tech_stack": ["string"],
        "critical_dependencies": [
            {"name": "string", "status": "confirmed|unconfirmed|unavailable", "notes": "string"}
        ],
        "time_estimate_hours": "number",
        "biggest_risk": "string"
    },

    "github_research": {
        "similar_projects": [
            {"repo": "string", "stars": "number", "relevance": "直接相关|部分相关", "takeaway": "string"}
        ],
        "reusable_components": ["string"],
        "differentiation": "string"
    },

    "demo_vision": {
        "hook": "string (10秒能看懂的展示亮点)",
        "flow": ["string"],
        "wow_factor": "string"
    },

    "discoveries": [
        {"category": "string", "content": "string"}
    ],

    "mvp_spec": {
        "must_have": ["string"],
        "nice_to_have": ["string"],
        "cut": ["string"]
    },

    "architecture": {
        "components": ["string"],
        "data_flow": "string",
        "existing_repo_reuse": [
            {"repo": "string", "component": "string", "effort": "low|medium|high"}
        ]
    },

    "demo_script": {
        "duration_seconds": "number",
        "steps": [
            {"time": "string", "action": "string", "visual": "string"}
        ]
    },

    "downgrade_plan": ["string"]
}
```

initial 阶段: `mvp_spec`, `architecture`, `demo_script`, `downgrade_plan` 为 null。
deep 阶段: 全部填充。

---

## 6. Claude 评审 Schema

Claude 一次性评审本轮所有方向，返回：

```json
{
    "evaluations": [
        {
            "slug": "string",
            "scores": {
                "demo_wow": "0-10",
                "feasibility_40h": "0-10",
                "data_availability": "0-10",
                "reuse_fit": "0-10",
                "innovation": "0-10",
                "weighted_total": "number"
            },
            "alive": "boolean",
            "rationale": "string",
            "discoveries": [
                {"category": "string", "content": "string"}
            ]
        }
    ],
    "global_discoveries": [
        {"category": "string", "content": "string"}
    ]
}
```

---

## 7. LangGraph State + 节点定义

### 7.1 State

```python
class PipelineState(TypedDict):
    run_id: str
    config: RunConfig
    directions: list[DirectionMeta]
    current_round: int
    total_codex_calls: int
    phase: Literal["initial", "deep"]
    research_results: Annotated[list[dict], operator.add]  # reducer: fan-out 自动合并
    evaluation_results: list[dict]
    discoveries: list[dict]
    final_report: str | None
```

`research_results` 使用 `Annotated[list, operator.add]` 作为 reducer，LangGraph fan-out 的每个 `research` 分支返回的结果会自动追加合并。`store_results` 节点在所有分支完成后触发，读取合并后的完整列表写入 PG。

### 7.2 节点

| 节点 | 调用方 | 职责 |
|------|--------|------|
| `load_directions` | PG | 解析 markdown → 写入 directions 表 → 填充 state |
| `plan_budget` | 纯计算 | 按参数算每轮分配，写入 runs 表 |
| `research` | Codex CLI | 拼 prompt（含 discoveries）→ codex exec → 返回结果 |
| `store_results` | PG | research_results → research_results 表 + discoveries 表 |
| `evaluate` | Claude CLI | 从 PG 加载全部结果 + discoveries → 横向评审 → evaluations 表 |
| `filter` | PG | 按 alive 过滤 directions，更新 state |
| `final_report` | Claude CLI | 生成最终推荐报告 → 写文件 |

### 7.3 条件边

| 条件边 | 位置 | 逻辑 |
|--------|------|------|
| `route_research` | plan_budget → research | 对每个存活方向 `Send("research", {direction: d})` |
| `should_continue` | filter → plan_budget 或 final_report | `round < max AND calls + 存活数 ≤ budget AND 存活 > 3` → continue |

### 7.4 并发控制

`research` 节点内部使用 `asyncio.Semaphore(config.concurrency)` 限制实际并发的 Codex CLI 进程数。

---

## 8. 项目结构

```
/Users/sevencolor/code/0BKHDD/langchain/
├── docker-compose.yml
├── pyproject.toml
├── .env.example
├── src/
│   ├── __init__.py
│   ├── main.py                 # CLI 入口
│   ├── config.py               # RunConfig + 环境变量
│   ├── state.py                # PipelineState TypedDict + 数据模型
│   ├── graph.py                # LangGraph 图定义
│   ├── nodes/
│   │   ├── __init__.py
│   │   ├── load_directions.py
│   │   ├── plan_budget.py
│   │   ├── research.py
│   │   ├── store_results.py
│   │   ├── evaluate.py
│   │   ├── filter.py
│   │   └── final_report.py
│   ├── schemas/
│   │   ├── research.py         # Codex 输出 Pydantic model
│   │   └── evaluation.py       # Claude 评审 Pydantic model
│   ├── db.py                   # asyncpg 连接池 + CRUD
│   └── executors.py            # codex_exec() + claude_exec()，含代理注入
├── sql/
│   └── init.sql
└── tests/
    ├── test_graph.py
    └── test_nodes.py
```

### 8.1 依赖

```toml
[project]
name = "hackathon-analysis-pipeline"
requires-python = ">=3.11"
dependencies = [
    "langgraph>=0.4",
    "langchain-core>=0.3",
    "asyncpg>=0.30",
    "pydantic>=2.0",
]
```

不依赖 `langchain-anthropic` / `langchain-openai`。Claude 和 Codex 都走 subprocess。

### 8.2 Docker

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: hackathon_lab
      POSTGRES_USER: lab
      POSTGRES_PASSWORD: lab123
    volumes:
      - ./sql/init.sql:/docker-entrypoint-initdb.d/init.sql
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### 8.3 代理配置

所有 subprocess 调用注入代理环境变量：

```python
PROXY_ENV = {
    **os.environ,
    "http_proxy": "http://127.0.0.1:7897",
    "https_proxy": "http://127.0.0.1:7897",
}
```

---

## 9. 使用文档

### 9.1 前置条件

- Python 3.11+
- Docker + Docker Compose
- Codex CLI 已安装且可用（`codex --version`）
- 本机 Claude Code 已安装且可用（`claude --version`）
- 代理已启动在 `127.0.0.1:7897`

### 9.2 首次安装

```bash
cd /Users/sevencolor/code/0BKHDD/langchain

# 1. 启动 PostgreSQL
docker compose up -d

# 2. 安装 Python 依赖
pip install -e .
# 或用 uv:
# uv pip install -e .

# 3. 确认环境
codex --version        # 确认 Codex CLI 可用
claude --version       # 确认 Claude Code 可用
docker compose ps      # 确认 PG 运行中
```

### 9.3 运行

#### 基本用法

```bash
# 分析 directions.md 中的所有方向
python -m src.main --docs /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
```

默认参数: 50 次 Codex 预算、2 轮筛选、3 并发、50% 存活率。

#### 自定义参数

```bash
python -m src.main \
    --docs /path/to/doc1.md /path/to/doc2.md \
    --codex-budget 30 \
    --rounds 3 \
    --concurrency 2 \
    --survive-ratio 0.4
```

#### 只看预算规划

```bash
python -m src.main \
    --docs /path/to/directions.md \
    --codex-budget 30 \
    --rounds 2 \
    --plan-only
```

输出示例:

```
=== Budget Plan ===
directions: 12
rounds: 2
round 1 (initial): 12 codex calls
round 2 (deep):    6 codex calls (6 survivors)
total codex:       18 / 30 budget
claude evaluations: 2 (unlimited)
final report:       1 (unlimited)
===
```

#### 多文档输入

```bash
python -m src.main \
    --docs \
        /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md \
        /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
```

系统会合并所有文档中的方向，去重后统一分析。

### 9.4 输出

运行完成后，结果在两个地方：

**PostgreSQL 数据库** (`hackathon_lab`):
- `research_results` — 每次 Codex 研究的完整 JSON
- `evaluations` — 每轮 Claude 评审的评分和理由
- `discoveries` — 积累的发现（API 可用性、赛道约束等）

**文件系统** (`/Users/sevencolor/code/0BKHDD/langchain/output/<run_id>/`):
- `report.md` — 最终推荐报告（Markdown，可直接阅读）
- `report.json` — 结构化结果（可供后续工具消费）
- `budget_log.json` — 预算消耗记录

### 9.5 查看历史结果

```bash
# 连接数据库查看
docker compose exec postgres psql -U lab hackathon_lab

# 查看所有运行
SELECT run_id, status, config->>'codex_budget' as budget, started_at FROM runs ORDER BY started_at DESC;

# 查看某次运行的最终存活方向
SELECT slug, scores->>'weighted_total' as score, rationale
FROM evaluations
WHERE run_id = '<run_id>' AND alive = true
ORDER BY (scores->>'weighted_total')::float DESC;

# 查看积累的发现
SELECT category, content FROM discoveries WHERE run_id = '<run_id>' ORDER BY round;
```

### 9.6 故障排查

| 问题 | 解决 |
|------|------|
| `codex: command not found` | 确认 Codex CLI 在 PATH 中 |
| `claude: command not found` | 确认 Claude Code 在 PATH 中 |
| PG 连接失败 | `docker compose up -d` 重启，确认 5432 端口未被占用 |
| Codex 调用超时 | 检查代理 `127.0.0.1:7897` 是否运行 |
| 方向解析为 0 | 确认文档中方向标题格式为 `## 方向 N：标题` 或 `## N. 标题` |

### 9.7 重置数据库

```bash
docker compose down -v    # 删除数据卷
docker compose up -d      # 重新创建，init.sql 自动执行
```
