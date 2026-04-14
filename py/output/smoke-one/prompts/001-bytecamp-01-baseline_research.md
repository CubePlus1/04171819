你是一个字节跳动 hackathon 方向研究员。当前日期是 2026-04-15。

        任务约束：
        - 目标必须适配：纯软件、40 小时内能做出可演示 MVP、面向大学生展览、10 秒内能看懂价值。
        - 可以使用 web search 查找最新资料，但优先官方文档、官方平台、权威媒体、公开研究资料。
        - 对不确定的平台能力，不要直接假设可用，要写清楚降级方案。
        - 明确区分已确认事实、推断、建议。
        - 输出必须严格符合 JSON schema。

        当前任务：
        - task_id: 001-bytecamp-01-baseline_research
        - phase: baseline_research
        - phase_goal: 先确认赛道匹配、MVP、数据获取路径、现有仓库复用点，并补当前可查到的外部资料。

        当前方向：
        - direction_slug: bytecamp-01
        - source_key: bytecamp
        - source_path: /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
        - heading: 1. 精选视频 -> 未来的你学习搭子
        - title: 精选视频 -> 未来的你学习搭子

        原始方向正文：
        - 适合赛道：赛道二｜抖音精选-内容重构
- 方向：把 AI / 科技 / 职场 / 课程类视频转成“给当前这个大学生”的学习摘要、知识地图、3 天行动计划、1 题小测。
- 可复用项目：`Eoove-demo` 的画像与顾问，`nightowl` 的 ETL/RAG，`taidy` 的引用和图表，`allin` 的学生画像展示。

继续调查可行性的 prompt：

```text
请围绕“精选视频 -> 未来的你学习搭子”做参赛可行性调研，背景是字节跳动举办的大学生活动，要求纯软件、40小时内做完、适合展览。请输出：
1. 这个方向与赛道二的契合点
2. 最小可行 MVP 功能，只保留 1 个垂类（如 AI 学习、实习求职、考研）
3. 数据获取方案，按“官方 API / 官方导出或开放能力 / 公开网页可采集字段 / 人工采样”四级列出；明确是否能合法稳定拿到视频标题、简介、字幕、封面、标签
4. 如果拿不到抖音精选官方内容 API，如何用 30~100 条公开视频样本或人工整理字幕完成 ETL + RAG
5. 现有本地项目中哪些模块可直接复用，分别对应画像、知识库、问答、引用、前端展示
6. 40 小时开发拆解
7. 展台 demo 流程
8. 最大风险与降级方案
```

        原始调研 prompt：
        请围绕“精选视频 -> 未来的你学习搭子”做参赛可行性调研，背景是字节跳动举办的大学生活动，要求纯软件、40小时内做完、适合展览。请输出：
1. 这个方向与赛道二的契合点
2. 最小可行 MVP 功能，只保留 1 个垂类（如 AI 学习、实习求职、考研）
3. 数据获取方案，按“官方 API / 官方导出或开放能力 / 公开网页可采集字段 / 人工采样”四级列出；明确是否能合法稳定拿到视频标题、简介、字幕、封面、标签
4. 如果拿不到抖音精选官方内容 API，如何用 30~100 条公开视频样本或人工整理字幕完成 ETL + RAG
5. 现有本地项目中哪些模块可直接复用，分别对应画像、知识库、问答、引用、前端展示
6. 40 小时开发拆解
7. 展台 demo 流程
8. 最大风险与降级方案

        本方向之前已经产出的结果文件：
        - 无

        本次可参考的全部方向结果文件：
        - /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md
- /Users/sevencolor/code/0BKHDD/predocs/brainstorming/directions.md

        输出要求补充：
        - summary 要给出本轮结论。
        - mvp_scope 用 3 到 8 条。
        - data_plan 要覆盖最稳妥的数据来源。
        - references 必须尽量给当前轮真正使用到的资料链接；没有链接时留空数组，不要编造。
        - new_ideas 里写本轮新冒出来的方向变体、拼接思路或体验增强点。
        - evolution_notes 里写相对前一轮的变化。