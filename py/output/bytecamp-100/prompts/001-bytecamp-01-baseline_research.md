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

        全部方向清单：
        - bytecamp-01 | bytecamp | 精选视频 -> 未来的你学习搭子
- bytecamp-02 | bytecamp | 实习求职视频 -> 你的岗位决策卡
- bytecamp-03 | bytecamp | 选课 / 竞赛 / 考研内容 -> 个性化成长路线图
- bytecamp-04 | bytecamp | 你刷过什么，就长成什么：内容消费人格镜像
- bytecamp-05 | bytecamp | 懂你的一刷：今晚吃什么 / 周末去哪卡片流
- bytecamp-06 | bytecamp | 校园活动 / 社团 / 讲座 / 宣讲会智能信息流
- bytecamp-07 | bytecamp | 平行人格互动剧场
- bytecamp-08 | bytecamp | 未来职业分身闯关
- bytecamp-09 | bytecamp | 暂停、圈选、追问：视频知识点即时学习卡
- bytecamp-10 | bytecamp | 看见穿搭 / 好物 / 宿舍桌搭，就知道适不适合我
- bytecamp-11 | bytecamp | 拍课程表 / 简历 / 讲义，分身立刻帮你拆计划
- bytecamp-12 | bytecamp | 你的内容分身问数台
- brainstorming-01 | brainstorming | 数字学伴 — 视频变私教(赛道二)
- brainstorming-02 | brainstorming | 数字分身信息流 — 三个人刷到三种答案(赛道三)
- brainstorming-03 | brainstorming | 简历秒懂 — 拍照生成就业画像(赛道四 + allin)
- brainstorming-04 | brainstorming | 人格冒险 — 玩着玩着就认识自己了(赛道一)
- brainstorming-05 | brainstorming | 知识追踪器 — 你的学习 DNA(赛道二)
- brainstorming-06 | brainstorming | 财经秒问 — 刷到财报直接问(赛道三 + taidy)
- brainstorming-07 | brainstorming | 话题同温层探测器 — 看见你的信息茧房(赛道三)
- brainstorming-08 | brainstorming | Vibe 简历工坊 — 边聊边生成求职全套(赛道一 + allin)
- brainstorming-09 | brainstorming | 视频寻宝 — 圈一圈就能深挖(赛道四)
- brainstorming-10 | brainstorming | 数字个体实验室 — 从数据到灵魂(赛道一 或 赛道三)
- brainstorming-11 | brainstorming | 情绪电台 — 刷到治愈你的那一刻(赛道三)
- brainstorming-12 | brainstorming | 多源融合画像 — 你的数据全景图(赛道二 或 赛道三)

        输出要求补充：
        - summary 要给出本轮结论。
        - mvp_scope 用 3 到 8 条。
        - data_plan 要覆盖最稳妥的数据来源。
        - references 必须尽量给当前轮真正使用到的资料链接；没有链接时留空数组，不要编造。
        - new_ideas 里写本轮新冒出来的方向变体、拼接思路或体验增强点。
        - evolution_notes 里写相对前一轮的变化。