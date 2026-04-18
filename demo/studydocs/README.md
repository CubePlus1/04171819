# studydocs · 把后端逻辑讲出来

这组文档不是 API 参考，也不是 JSDoc 汇总 —— 它是**教你在白板前把这套系统讲清楚**的学习路径。

## 为什么有 studydocs

展台上评委、面试官、队友，都会问同一类问题：

- "这套系统到底在做什么？"
- "你为什么这么设计？"
- "AI 在这里扮演什么角色？"
- "如果我往数据库塞 10 万条信号，它还会 work 吗？"

API 文档答不了这些 —— 它们问的是**设计意图**，不是接口签名。
这里每一篇都回答**一个"为什么"**，最后给一句**"怎么用一句话说"**。读完一圈你就能在白板上从头讲一遍。

## 阅读路径

**第一遍（30 分钟 · 面试/展台前夜）**：
1. `00-core-philosophy.md` · 履约型内容是什么
2. `01-why-no-input.md` · 为什么没有输入框
3. `02-five-steps.md` · 五步管线逐步讲
4. `12-faq.md` · 常见问答速览

**第二遍（1 小时 · 想彻底搞懂）**：
5. `03-three-tables.md` · 数据层怎么设计
6. `04-topic-level-aggregation.md` · 履约按主题聚合
7. `05-atomic-claim.md` · 并发保护机制
8. `06-mind-phases.md` · 可视化与 5 步的映射

**第三遍（展台前冲刺 · 拿话术）**：
9. `07-security-layer.md` · 安全层速答
10. `08-graceful-shutdown.md` · 运维层速答
11. `09-pitch-10sec.md` / `10-pitch-90sec.md` / `11-pitch-3min.md` · 三档讲稿
12. `13-whiteboard.md` · 白板手绘图

## 怎么用它

- **不要背代码路径**。代码会变，故事不会。每篇末尾的"一句话版本"才是要记的。
- **练三遍**：读一遍 → 合上文档自己说一遍 → 对着队友说一遍。
- **看白板图**（`13-whiteboard.md`）先于看 SQL —— 画图驱动讲解，SQL 是证据。

## 文件总览

| 文件 | 回答的问题 |
|---|---|
| `00-core-philosophy.md` | 履约型内容是什么？它和普通信息流有什么区别？ |
| `01-why-no-input.md` | 为什么去掉了输入框？ |
| `02-five-steps.md` | 5 步管线每一步在干什么？为什么是 5 步？ |
| `03-three-tables.md` | 数据库为什么是 3 张表？每张表存什么？ |
| `04-topic-level-aggregation.md` | 为什么按主题聚合而不是按信号？ |
| `05-atomic-claim.md` | 并发两条请求同时进来，为什么只生成一张卡片？ |
| `06-mind-phases.md` | MindCanvas 的 5 相位和 5 步是什么关系？ |
| `07-security-layer.md` | CORS / rate limit / origin 检查 —— 为什么这些都要？ |
| `08-graceful-shutdown.md` | SIGTERM 时发生什么？为什么要按顺序关？ |
| `09-pitch-10sec.md` | 10 秒讲完怎么说 |
| `10-pitch-90sec.md` | 90 秒讲解怎么铺 |
| `11-pitch-3min.md` | 3 分钟深演怎么走 |
| `12-faq.md` | 评委/面试官最可能问的问题 + 标准答案 |
| `13-whiteboard.md` | 现场白板可以直接画的图 |

最后一句：**讲故事，不讲代码**。你的工作是让对面的人在 3 分钟后能把同一件事讲给别人听。
