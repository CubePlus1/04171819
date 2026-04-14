你是一个字节跳动 hackathon 方向研究员。当前日期是 2026-04-15。

        任务约束：
        - 目标必须适配：纯软件、40 小时内能做出可演示 MVP、面向大学生展览、10 秒内能看懂价值。
        - 可以使用 web search 查找最新资料，但优先官方文档、官方平台、权威媒体、公开研究资料。
        - 对不确定的平台能力，不要直接假设可用，要写清楚降级方案。
        - 明确区分已确认事实、推断、建议。
        - 输出必须严格符合 JSON schema。

        当前任务：
        - task_id: 006-bytecamp-06-baseline_research
        - phase: baseline_research
        - phase_goal: 先确认赛道匹配、MVP、数据获取路径、现有仓库复用点，并补当前可查到的外部资料。

        当前方向：
        - direction_slug: bytecamp-06
        - source_key: bytecamp
        - source_path: /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
        - heading: 6. 校园活动 / 社团 / 讲座 / 宣讲会智能信息流
        - title: 校园活动 / 社团 / 讲座 / 宣讲会智能信息流

        原始方向正文：
        - 适合赛道：赛道三
- 方向：把校园活动、宣讲会、比赛报名、社团招新重组成“你今天该去什么”的信息流单元，不是列表，而是带理由、冲突分析、报名建议的卡。
- 可复用项目：`allin` 的匹配思路，`Eoove-demo` 的 advisor 和 schedule，`taidy` 的多意图规划。

继续调查可行性的 prompt：

```text
请调研“校园活动/社团/讲座/宣讲会智能信息流”是否适合本次字节活动。请输出：
1. 赛道匹配分析
2. 可用数据源：学校官网、学院通知、公众号文章、报名表单、海报 OCR、日历 ICS、公开 RSS 等
3. 哪些数据能自动拿到，哪些需要人工整理
4. 是否需要 OCR、爬虫、日历 API、地图 API；优先级怎么排
5. 如何把活动信息流做成“刚好懂你”，而不是普通公告聚合
6. 现有四个项目各能贡献什么
7. 40 小时 MVP 的数据规模建议
8. 风险：数据更新、校内源格式混乱、权限问题
```

        原始调研 prompt：
        请调研“校园活动/社团/讲座/宣讲会智能信息流”是否适合本次字节活动。请输出：
1. 赛道匹配分析
2. 可用数据源：学校官网、学院通知、公众号文章、报名表单、海报 OCR、日历 ICS、公开 RSS 等
3. 哪些数据能自动拿到，哪些需要人工整理
4. 是否需要 OCR、爬虫、日历 API、地图 API；优先级怎么排
5. 如何把活动信息流做成“刚好懂你”，而不是普通公告聚合
6. 现有四个项目各能贡献什么
7. 40 小时 MVP 的数据规模建议
8. 风险：数据更新、校内源格式混乱、权限问题

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