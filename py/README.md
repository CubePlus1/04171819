# Codex Idea Lab

这个目录里放的是一个 Python 编排器，用来连续调用 `codex exec`，围绕两份方向文档做多轮研究、总结、进化、可行性分析、赛道理解和最终推荐。

默认输入文档：

- `/Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md`
- `/Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md`

默认行为：

- 自动解析两份 Markdown 中的全部方向
- 总共调用 `codex` 100 次
- 24 个方向各做 4 轮：`baseline_research` / `assumption_challenge` / `evolution` / `final_pack`
- 再做 4 轮综合任务：赛道分析、横向对比、混合新想法、最终推荐
- 默认按 phase 分组执行，最多 `3` 并发，不会跨阶段抢跑
- 默认开启 web search
- 运行时会打印每一步的进度提示，例如 `START / HEARTBEAT / DONE / FAILED / SKIP`
- 结果输出到 `py/output/<run-name>/`

## 运行

先看编排，不实际调用模型：

```bash
python3 /Users/sevencolor/code/0BKHDD/py/codex_idea_lab.py --plan-only
```

正式运行 100 次：

```bash
python3 /Users/sevencolor/code/0BKHDD/py/codex_idea_lab.py \
  --run-name bytecamp-100 \
  --calls 100 \
  --max-concurrency 3 \
  --timeout-seconds 1800
```

如果需要强制所有 `codex exec` 走代理：

```bash
python3 /Users/sevencolor/code/0BKHDD/py/codex_idea_lab.py \
  --run-name bytecamp-100 \
  --calls 100 \
  --max-concurrency 3 \
  --http-proxy http://127.0.0.1:7897 \
  --https-proxy http://127.0.0.1:7897
```

如果只想先做一次烟雾测试：

```bash
python3 /Users/sevencolor/code/0BKHDD/py/codex_idea_lab.py \
  --calls 1 \
  --run-name smoke-one \
  --stop-on-error
```

## 输出结构

每次运行会生成：

- `manifest.json`：本轮计划、方向清单、任务清单
- `prompts/`：每次喂给 `codex` 的 prompt
- `results/`：每次 `codex` 的结构化 JSON 输出
- `logs/<task>.json`：每次命令的任务元数据、stdout/stderr、返回码、起止时间、耗时
- `logs/progress.jsonl`：整轮运行的进度事件流，适合回放和排错
- `logs/live/<task>.log`：`codex exec` 的实时输出和 heartbeat，适合 `tail -f`
- `schemas/`：方向任务和综合任务的 JSON Schema
- `reports/master_report.md`：最终总报告
- `reports/directions_index.md`：方向索引

## 继续跑 / 重跑

- 已有结果默认跳过，适合中断后继续跑
- 加 `--force` 会强制重跑已有任务
- 加 `--no-search` 可以关闭 web search
- 加 `--model <name>` 可以指定模型
- 加 `--max-concurrency <n>` 可以调整并发数，默认 `3`
- 加 `--heartbeat-seconds <n>` 可以调整心跳频率，默认 `10`
- 加 `--http-proxy` / `--https-proxy` 会把代理显式传给每次 `codex exec`，并同步成大小写两套环境变量

## 注意

- 这个脚本依赖本机已经可用的 `codex` CLI。
- 正式跑 100 次会比较耗时，也会消耗模型额度。
- 脚本默认把 `codex exec` 放在 `read-only` sandbox 下，重点做研究与总结，不让模型改本地文件。
