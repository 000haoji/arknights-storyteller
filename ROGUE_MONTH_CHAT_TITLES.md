# 肉鸽模式月度聊天标题映射

本文档记录了所有肉鸽模式的月度聊天剧情ID及其对应的中文标题。

## 数据来源

这些标题来源于 `roguelike_topic_table.json` 中的 `details.[rogue_id].monthSquad` 字段。每个月度小队都有：
- `chatId`: 月度聊天剧情ID
- `teamName`: 小队名称（用作剧情标题）

## 标题映射表

### 傀影与猩红孤钻 (Rogue 1)

| 剧情ID | 中文标题 |
|--------|---------|
| month_chat_rogue_1_1 | 卡兹戴尔联谊会 |
| month_chat_rogue_1_2 | 年长与新生 |
| month_chat_rogue_1_3 | 超级叙拉古人 |
| month_chat_rogue_1_4 | 荒野大爆炸 |
| month_chat_rogue_1_5 | 阿达克利斯向前冲 |
| month_chat_rogue_1_6 | 直到春天来临 |
| month_chat_rogue_1_7 |  今日下午茶 |
| month_chat_rogue_1_8 | 临时搭伙 |

### 水月与深蓝之树 (Rogue 2)

| 剧情ID | 中文标题 |
|--------|---------|
| month_chat_rogue_2_1 | 危险注药 |
| month_chat_rogue_2_2 | 提灯之人 |
| month_chat_rogue_2_3 | 守望者 |
| month_chat_rogue_2_4 | 星辰泡沫 |
| month_chat_rogue_2_5 | 自虚无中 |
| month_chat_rogue_2_6 | 海葬 |
| month_chat_rogue_2_7 | 碑文倒影 |
| month_chat_rogue_2_8 | 童年的终结 |

### 探索者的银凇止境 (Rogue 3)

| 剧情ID | 中文标题 |
|--------|---------|
| month_chat_rogue_3_1 | 探足 |
| month_chat_rogue_3_2 | 直视 |
| month_chat_rogue_3_3 | 告别 |
| month_chat_rogue_3_4 | 未见终局 |
| month_chat_rogue_3_5 | 没有终点的小径 |
| month_chat_rogue_3_6 | 血脉 |
| month_chat_rogue_3_7 | 使命 |
| month_chat_rogue_3_8 | 恒在 |

### 萨卡兹的无终奇语 (Rogue 4)

| 剧情ID | 中文标题 |
|--------|---------|
| month_chat_rogue_4_1 | 新生代的创想 |
| month_chat_rogue_4_2 | 带我进卡兹戴尔去 |
| month_chat_rogue_4_3 | 提前述职 |
| month_chat_rogue_4_4 | 非调谐回响的诗 |
| month_chat_rogue_4_5 | 阿纳萨的路 |
| month_chat_rogue_4_6 | 往诞律 |
| month_chat_rogue_4_7 | 弯路的终点 |
| month_chat_rogue_4_8 | 接触 |

### 岁的界园志异 (Rogue 5)

| 剧情ID | 中文标题 |
|--------|---------|
| month_chat_rogue_5_1 | 忆峥嵘 |
| month_chat_rogue_5_2 | 小玩意 |
| month_chat_rogue_5_3 | 我见青山 |
| month_chat_rogue_5_4 | 今朝醉 |

## 实现说明

在 `data_service.rs` 的 `get_roguelike_stories_grouped()` 函数中，应该从 `roguelike_topic_table.json` 的 `details.[rogue_id].monthSquad` 中提取这些月度聊天的标题，并在构建 `StoryEntry` 时使用 `teamName` 作为 `story_name`。

当前实现通过递归函数 `extract_story_data_from_value()` 来提取剧情数据，该函数会查找 `chatStoryId` 和 `chatDesc` 字段。由于 `monthSquad` 中使用的是 `chatId` 和 `teamName`，需要确保代码能够正确处理这些字段。

## 文件路径结构

月度聊天的剧情文件位于：
```
obt/rogue/month_chat_rogue_[X]_[Y]/
```

其中：
- `[X]` 是肉鸽编号 (1-5)
- `[Y]` 是月度聊天序号

每个目录包含 3 个剧情文件：
- `month_chat_rogue_[X]_[Y]_1.txt`
- `month_chat_rogue_[X]_[Y]_2.txt`
- `month_chat_rogue_[X]_[Y]_3.txt`

