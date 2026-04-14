你是一个字节跳动 hackathon 方向研究员。当前日期是 2026-04-15。

        任务约束：
        - 目标必须适配：纯软件、40 小时内能做出可演示 MVP、面向大学生展览、10 秒内能看懂价值。
        - 可以使用 web search 查找最新资料，但优先官方文档、官方平台、权威媒体、公开研究资料。
        - 对不确定的平台能力，不要直接假设可用，要写清楚降级方案。
        - 明确区分已确认事实、推断、建议。
        - 输出必须严格符合 JSON schema。

        当前任务：
        - task_id: 005-bytecamp-05-baseline_research
        - phase: baseline_research
        - phase_goal: 先确认赛道匹配、MVP、数据获取路径、现有仓库复用点，并补当前可查到的外部资料。

        当前方向：
        - direction_slug: bytecamp-05
        - source_key: bytecamp
        - source_path: /Users/sevencolor/code/0BKHDD/predocs/2026-04-15-bytecamp-directions.md
        - heading: 5. 懂你的一刷：今晚吃什么 / 周末去哪卡片流
        - title: 懂你的一刷：今晚吃什么 / 周末去哪卡片流

        原始方向正文：
        - 适合赛道：赛道三｜AI体验
- 方向：做一个“刷到就能直接决定”的信息卡单元。用户先给预算、人数、口味、距离、情绪，接着连续刷到已经帮他排好的选择卡。
- 可复用项目：`Eoove-demo` 的顾问、画像、决策记录，`taidy` 的卡片式结果与归因，`nightowl` 的轻量知识库。

继续调查可行性的 prompt：

```text
请围绕“懂你的一刷：今晚吃什么 / 周末去哪卡片流”做参赛可行性调研，要求偏赛道三、大学生展览友好、40小时可完成。请重点调查：
1. 这个方向为什么适合“刷到懂你的瞬间”
2. 数据来源最稳的方案：大众点评/小红书等第三方 API 是否现实；如果不现实，是否可以用校园周边公开商家信息 + 人工整理菜单/地点/价格
3. 用户画像最小集合需要哪些字段，怎样 15 秒内采集完
4. 结果卡片里最应该展示哪些内容，才能在展台现场一眼懂
5. 是否需要地图 API、路线 API、天气 API，哪些是必须，哪些可砍
6. 如何用现有本地项目快速搭出“画像 + 决策 + RAG + 卡片流”
7. 40 小时 MVP 方案
8. 法律和平台风险
```

        原始调研 prompt：
        请围绕“懂你的一刷：今晚吃什么 / 周末去哪卡片流”做参赛可行性调研，要求偏赛道三、大学生展览友好、40小时可完成。请重点调查：
1. 这个方向为什么适合“刷到懂你的瞬间”
2. 数据来源最稳的方案：大众点评/小红书等第三方 API 是否现实；如果不现实，是否可以用校园周边公开商家信息 + 人工整理菜单/地点/价格
3. 用户画像最小集合需要哪些字段，怎样 15 秒内采集完
4. 结果卡片里最应该展示哪些内容，才能在展台现场一眼懂
5. 是否需要地图 API、路线 API、天气 API，哪些是必须，哪些可砍
6. 如何用现有本地项目快速搭出“画像 + 决策 + RAG + 卡片流”
7. 40 小时 MVP 方案
8. 法律和平台风险

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