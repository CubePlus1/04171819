# 10 · 媒体素材 AI 生成 Prompt 合集

> 配套 [`../PROGRESS.md`](../PROGRESS.md) 使用。
> 目的：把 picsum / dicebear / CSS 渐变全部替换成**有温度的真实感素材**。

主 slogan（所有素材都围绕它）：
> **逆风如解意 —— 把你念念不忘的，接回来。**

**视觉基调统一词**（所有 prompt 前缀可加）：
`soft warm cinematic · morning light · shallow depth of field · film grain · muted earth tones · intimate and quiet · 2025 moody editorial`

---

## § 海报 · 背板 · 发布图

### P-01 · 主海报背板（展台 A1 竖版）

**用途**：展台后方立板 · 远看是氛围 · 近看是 slogan。

**工具建议**：Midjourney v6 · SDXL · FLUX.1 dev

```
A quiet editorial poster. A single young east-asian woman scrolling her phone
in a warm autumn bedroom, her face soft-lit by the screen glow, her own
breath barely visible in the cool morning air. Behind her, faint concentric
circles of light as if thoughts drifting back to her. The phone shows a
tender card floating in — but you see it only as a glow, not a UI. Ambient
tones: tobacco brown, old-rose, muted cream. Filmic grain. No text on the
image — text will be composited. --ar 2:3 --style raw --v 6
```

**文字合成**（PS/Figma 叠加，不要交给模型）：
- 上缘 1/4 处：`逆风如解意`（手写风或细宋体）
- 下缘 1/6 处：`把你念念不忘的，接回来`（细黑体，80% 不透明）
- 右下角：`蹲到了 · Dundao · 赛道三`

---

### P-02 · 双语版海报（国际评委席）

```
Same composition as P-01. Cooler evening light, single golden hour ray
across her cheek. Hands holding the phone a bit closer to chest — like
cradling something quiet. --ar 2:3 --v 6
```

**文字合成**：
- 主标：`逆风如解意 / As if the wind understood`
- 副标：`把你念念不忘的，接回来 / We bring back what you couldn't let go`

---

### P-03 · 评委桌面小卡（A6 发手上）

```
A minimalist still life on a wooden table. A phone screen off. On the phone
lies a dried autumn leaf and a handwritten note with just three characters
"念念不忘" barely readable. A single thin ring of sunlight around them.
Overhead view. Soft filmic tones. --ar 3:4 --v 6
```

---

## § 商品图 · 替换 CSS 渐变块

### C-01 · 大山·磨毛圆领针织衫（P1 商品卡替换 gradient div）

**用途**：`fixtures.json` 里 `creator_actions[0].payload.product.cover` 新增字段。
**尺寸**：560×560 · 方形。

**工具建议**：Midjourney / SDXL-turbo / electronic commerce LoRA

```
Product photography of a caramel-brown brushed cotton knit crewneck sweater,
lying flat on warm cream linen, soft top-down studio light, subtle fabric
texture visible, tiny pill-free surface, slight fold at the sleeve hinting
at softness. No model. No logo. Background: plain warm cream #f3ebd9.
--ar 1:1 --style raw --v 6
```

**延伸变体**（平替色）：
- 焦糖 caramel brown
- 燕麦 oatmeal beige
- 暖灰 warm dove grey
- 藕粉 blush mauve

---

### C-02 · 30 天变身系列 · 5 张进阶肖像

**用途**：`creator_actions[1].payload.series_thumbnails[]` · 替换 5 张 picsum。
**尺寸**：400×600 · 竖版。

**核心**：**同一个人** · 5 张照片里**姿态 / 光 / 眼神渐变** · 从"僵硬"到"温柔"。

**工具**：Midjourney v6 cref（角色一致性）· 或 SDXL + IP-Adapter。

**Seed 角色描述（全 5 张共用）**：
```
A 24-year-old east-asian woman, oval face, shoulder-length dark brown hair,
natural brows, no makeup. Wears the same oversized white sweater throughout.
Warm interior lighting.
```

**5 张分别的 Prompt**（基于上面 seed）：

```
D1  · First day. She sits on the floor of her room, slight nervous posture,
       arms hugging knees, looking down at a planner. Morning flat light.
       "Day 1 · 我决定开始" --ar 2:3

D7  · One week in. Standing by a window, right hand pressing forehead,
       visible tiredness around eyes, cup of tea half-finished on sill.
       Afternoon overcast light. "Day 7 · 第一次想放弃" --ar 2:3

D14 · Two weeks in. Sitting at a desk writing something, calmer but still
       subdued, a small plant beside her. Warmer golden light. "Day 14 ·
       撑过了平台期" --ar 2:3

D21 · Three weeks in. On the edge of a bed, phone in hand reading messages,
       a very faint smile beginning at the corner of her mouth. Dusk light.
       "Day 21 · 有人开始留言鼓励我" --ar 2:3

D30 · Last day. By the same window as D7, but now with soft open posture,
       chin slightly lifted, eyes looking into distance. Morning sunrise
       light. "Day 30 · 我其实没变 · 但变得温柔了" --ar 2:3
```

**合成提示**：每张右下角手工叠加 `D1/D7/D14/D21/D30` 和一行标题 · 不要让模型写字（AI 汉字目前仍差）。

---

### C-03 · 爷爷的退伍档案 · 封面 + 10s 前情图

**用途**：`creator_actions[2].payload.cover` 替换 · 以及如果真做"10s 前情视频"的首帧。

**工具**：Midjourney v6 · 历史照片修复 LoRA。

```
A respectfully restored black-and-white photograph of an elderly east-asian
veteran, 88 years old, wearing a plain dark cotton jacket, seated in front
of an old wooden table with a tin cup and a folded worn letter. His eyes
are clear but quiet. Slight sepia tone, minimal grain. Dignity first.
Behind him on the wall, a faded photograph of younger him in winter coat
holding a rifle in snow. No uniform logos. --ar 2:3 --style raw --v 6
```

**伦理提醒**：这张是最重的剧本 · 真实人物尊严优先 · 勿追求"感动"过度化。封面落一行："爷爷在朝鲜冻伤的那只脚，70 年后还会疼"。

---

### C-04 · 博主头像 · 3 张替换 dicebear

**用途**：`fixtures.json` 里 3 个 `creators[].avatar` · 替换 dicebear 的机器人头像。
**尺寸**：200×200 圆形裁剪。

```
A-01 大山 · Friendly east-asian woman in her late 20s, warm smile, knitted
        turtleneck, soft studio light, shoulder-up portrait, natural, no
        makeup feel. --ar 1:1

A-02 30天 · Determined east-asian woman in her early 20s, ponytail,
        training top, neutral serene expression, pale interior background.
        --ar 1:1

A-03 爷爷 · Elderly east-asian man in his 80s, kind eyes behind gold-rimmed
        reading glasses, plain grey shirt, looking just off-camera. Sepia
        wash. --ar 1:1
```

---

## § 视频 · 核心展台素材

### V-01 · 6 条 Feed Filler Loop（3–5 秒 MP4 · 无声）

**用途**：替换 `FeedItem.jsx` 里 `<img>` 为 `<video autoPlay muted loop playsInline>` · 让信息流"活过来"。

**工具建议**：Runway Gen-3 · Pika 1.5 · Kling 1.5 · 本地 AnimateDiff

**6 条对应 fixtures.json 里 feed-filler-1 ~ 6**：

```
V-01a 咖啡 · "@街边咖啡图鉴"
  "A slow pour of handdrip coffee into a white porcelain cup on a wooden
   counter, steam rising, warm morning window light, shallow dof. 3 seconds
   loop, no cut." --duration 4s

V-01b 猫 · "@一条猫的日常"
  "A fluffy tabby cat turning its head slowly away from camera, tail
   flicking once, then static. Evening bedroom light. 4 seconds loop."

V-01c 美食 · "@深夜厨房"
  "Overhead shot of hands stirring cabbage and tofu in a shallow pot,
   gentle steam, kitchen counter in background slightly out of focus.
   3 seconds loop."

V-01d 城市 · "@城市建筑笔记"
  "Slow walk past a 1930s Shanghai bund-style building facade, golden
   hour light reflecting off windows, wide angle, handheld gentle motion.
   5 seconds."

V-01e 脑洞 · "@理工科绘画"
  "A pen-plotter drawing a cat-shaped parametric curve on grid paper,
   continuous single line, close-up. 5 seconds loop."

V-01f 户外 · "@徒步阿三"
  "A backpack's point of view walking forward on a misty mountain trail
   with stone steps, autumn leaves, pine trees, low light morning fog.
   4 seconds."
```

**导出规格**：H.264 · 1080×1920 竖版 · < 2MB 单条 · 无音轨。
**放在**：`demo/frontend/public/fillers/filler-1.mp4 ... filler-6.mp4`。

---

### V-02 · 45 秒备援录屏（真录制 · 非 AI）

**用途**：现场网络/电脑挂了时放手机里给评委看（risks-fallbacks 硬要求）。

**脚本（45 秒切片）**：

```
00:00 - 00:05  左面板 · 3 条普通信息流视频滑过（@咖啡 / @猫 / @厨房）
00:05 - 00:10  右面板 · AmbientPulse 呼吸 · "下一次接 · 5 秒"
00:10 - 00:15  第一张卡浮入（剧本 A · 大山链接） · 静音"咚"模拟
00:15 - 00:23  MindCanvas 5 相位走完 · scan → recall → match → seal → emit
00:23 - 00:30  卡片翻到 P2 · 看到"她当时留下的那条"
00:30 - 00:37  第二张卡浮入（剧本 C · 爷爷）· P1 + P2 + P3
00:37 - 00:42  按 `[` 切主题 3 次（暖色→水墨→赛博）
00:42 - 00:45  定格在 slogan 卡："逆风如解意 · 把你念念不忘的，接回来"
```

**录制要点**：
- 手机横屏 · 正对屏幕 · 1080p60
- 无旁白（展台吵）· 后期用 iMovie 加字幕即可
- 录 3 遍挑最顺的一遍 · 不要追求完美
- 导出 `fallback-45s.mp4` · 放 `demo/assets/`（新建目录）

---

### V-03 · 12 秒展台循环宣传片（AI 生成）

**用途**：展台显示屏 or 海报旁小屏 · 循环播 · 吸引评委路过停下。

```
"Cinematic opening: a young woman's thumb scrolls a phone feed in slow
motion. Halfway through, one card softly rises toward her out of the feed
with a faint warm glow, as if it remembered her. She pauses, the corner of
her mouth lifts. Fade to warm type: '逆风如解意 · 把你念念不忘的 · 接回来'.
Total 12 seconds. 2025 editorial cinematography, warm tobacco palette,
shallow dof, anamorphic subtle flare, no dialogue." --duration 12s --ar 9:16
```

**导出**：1080×1920 H.264 · loop · 文件名 `booth-loop-12s.mp4`。

---

## § 音频 · 细节里的情绪

**工具建议**：ElevenLabs（旁白）· Suno v4（音乐）· Freesound（音效 public domain）· 本地 Ableton / Logic 收尾。

### A-01 · 卡片浮入 · "咚"（300ms · 展台峰值声）

```
"A single soft low-frequency wooden bell tone, 200Hz fundamental, warm
reverb tail 1.2s, no attack harshness, like a temple bell heard from far.
Duration 300ms. Format: 48kHz WAV mono. Volume peak -9dB. Named: card-land.wav"
```

**使用**：前端 `onCardGenerated` 回调播放 · 音量 -24dB（展台别扰邻）。

---

### A-02 · 金印落下 · 木章声（400ms · SEAL 阶段）

```
"A short wooden stamp pressing onto paper sound, dry and decisive, slight
ink squish at the end, then silence. Think: courthouse seal, but tender
not authoritarian. 400ms total. Named: seal-press.wav"
```

---

### A-03 · 扫描呼吸 · 环境 pad（无限 loop · SCAN 阶段）

```
"A barely-audible ambient synth pad, C#m drone, 60bpm slow breath cycle,
-30dB average, no melody, just a soft moving texture like someone breathing
in an empty room. 20 seconds loop seamless. Named: scan-breath.wav"
```

**使用**：AgentMind 挂载时开始 · 卸载时渐隐 · 音量 -30dB。

---

### A-04 · 展台背景 pad（30 秒 loop · 展台吵闹时的底子）

**工具**：Suno v4

```
"A 30-second seamless loop of warm lofi-adjacent ambient music, featuring
soft upright piano (low register), tape hiss, a distant wordless female
hum, tempo around 65bpm, key of A minor. Emotional tag: 'nostalgic, patient,
understanding'. No drums. No build-up. End should match start for loop.
Style inspiration: Jon Hopkins 'Immunity' quieter passages, Hania Rani."
```

**导出**：48kHz stereo WAV → MP3 192kbps · `booth-ambient-30s-loop.mp3`。

---

### A-05 · 90 秒 pitch 配音（ElevenLabs 女声旁白）

**脚本**（中文普通话 · 语速慢 · 尾句轻）：

```
第 0-10 秒：
她刷抖音到第 47 条。
三周前那条大山的视频下，
她留过四个字 —— 蹲链接。
她自己早就忘了。
但系统没忘。

第 10-30 秒：
这不是一个帮她找东西的 AI。
这是一个替她记着的 AI。
五秒一次 · 它扫描她还惦记着的念头 ·
对上博主今天的新动作 ·
把这一瞬间，接成一张卡片 · 浮到她的信息流里。

第 30-60 秒：
她什么都没输。
她只是在滑。
而那张卡，以她早已忘记的语气对她说：
"你 21 天前在大山那里留过这几个字，
他今天放了链接，替你接回来了。"

第 60-90 秒：
这不是精准推送。
这是履约。
这不是又一个信息流。
是逆风如解意 —— 把你念念不忘的，接回来。
```

**ElevenLabs 参数建议**：
- Voice: "Xiaoxiao"（或类似温柔中文女声）
- Stability: 0.5 · Similarity: 0.75
- Style: 0.35（克制，不要"情感爆发"）
- 导出 MP3 192kbps · `pitch-vo-90s.mp3`

---

## § 工具矩阵

| 类别 | 第一推荐 | 备选 | 免费替代 |
|---|---|---|---|
| 海报/商品 | Midjourney v6 | SDXL-turbo | FLUX.1 schnell (HF Spaces) |
| 角色一致性 | Midjourney cref | SDXL + IP-Adapter | Kolors(LoRA) |
| 短视频 loop | Runway Gen-3 Turbo | Pika 1.5 / Kling 1.5 | AnimateDiff 本地 |
| 音效 | Freesound CC0 | Elevenlabs SFX | YouTube NCS 授权音效库 |
| 配音 | ElevenLabs Turbo v2.5 | Azure TTS Xiaoxiao | 本地 CosyVoice |
| 音乐 | Suno v4 | Udio | MusicGen-large |

---

## § 合规与伦理

- **爷爷剧本**：不使用真实可识别的退伍军人照片 · AI 生成的"历史风格"画面也要打上 `AI generated · 非真实档案` 水印（角落 10% 不透明）
- **30 天变身**：如果用 AI 生成系列肖像，角色形象不得与任何真人的公开形象高度相似 · 必要时加面部轻度抽象
- **版权**：所有商品品牌去掉 · 店铺名使用虚构 "大山的好物柜"（已在 fixtures）
- **音频**：旁白音色不要模仿真实明星
- **成片都加**：`AI-assisted assets · Demo use only · 2026-04` 文字 · 右下 10% 不透明

---

## § 快速替换清单（按 PROGRESS.md 优先级）

**P0 · 展台前必须换**：
- [ ] C-01 商品图 → 替换 `CardPageP1.jsx` 第 18 行 gradient div
- [ ] C-02 五张系列肖像 → 替换 `fixtures.json` `series_thumbnails`
- [ ] C-03 爷爷封面 → 替换 `fixtures.json` grandpa action `payload.cover`
- [ ] V-01a–f 6 条 filler loop → 改 `FeedItem.jsx` `<img>` 为 `<video>`
- [ ] V-02 45s 备援录屏 → 放 `demo/assets/fallback-45s.mp4`

**P1 · 有时间就做**：
- [ ] A-01 / A-02 音效 · 挂在 store onCardGenerated / step=4
- [ ] A-04 展台 pad loop · 展台开机播
- [ ] V-03 12s 循环宣传片 · 展台小屏
- [ ] P-01 主海报 · 展台背板

**P2 · 锦上添花**：
- [ ] A-03 扫描呼吸 · AgentMind 挂载时
- [ ] A-05 90s 配音 · 展台"自助讲解"按钮
- [ ] P-02 双语海报
- [ ] C-04 3 张博主头像 · 替换 dicebear

---

## § 下一步

→ 跑完素材 · 回 [`../PROGRESS.md`](../PROGRESS.md) 对清单打勾
→ 把素材提交进 `demo/frontend/public/` 和 `demo/assets/`
→ 更新 `fixtures.json` 的 `cover` 字段指向本地路径而非 picsum
