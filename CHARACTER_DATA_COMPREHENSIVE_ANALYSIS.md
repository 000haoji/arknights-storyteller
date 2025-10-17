# 明日方舟人物相关数据全面分析报告

## 📋 执行概述

本报告全面检查了游戏数据中所有与人物（干员）相关的信息，并对比当前已解析和未解析的内容进行了系统梳理。

---

## ✅ 已解析的人物数据

### 1. **干员基础信息** (`character_table.json`)
- **来源**: `CharacterBasicInfo` 结构
- **解析内容**:
  - `char_id`: 干员ID
  - `name`: 干员名称
  - `appellation`: 英文代号
  - `rarity`: 稀有度
  - `profession`: 职业
  - `sub_profession_id`: 子职业ID
  - `position`: 攻击位置（近战/远程）
  - `nation_id`: 所属国家/地区
  - `group_id`: 所属组织
  - `team_id`: 所属小队

### 2. **干员档案** (`handbook_info_table.json`)
- **来源**: `CharacterHandbook` 结构
- **解析内容**:
  - 档案标题和内容
  - 解锁条件（好感度等）
  - 多个档案章节

### 3. **干员语音** (`charword_table.json`)
- **来源**: `CharacterVoice` 结构
- **解析内容**:
  - 语音标题
  - 语音文本
  - 解锁类型

### 4. **干员模组** (`uniequip_table.json`)
- **来源**: `CharacterEquipment` 结构
- **解析内容**:
  - 模组ID和名称
  - 模组描述
  - 模组类型

---

## ❌ 未解析的人物数据

### 1. **干员潜能信物** (`item_table.json`) ⭐ **高优先级**
- **位置**: `items.p_char_{干员id}`
- **包含数据**:
  - `name`: "XX的信物"
  - `description`: **潜能信物的描述文本**（通常包含干员背景故事的引用语句）
  - `usage`: 用途说明
  - `rarity`: 稀有度
  - `obtainApproach`: 获取途径
- **示例**:
  ```json
  {
    "itemId": "p_char_002_amiya",
    "name": "阿米娅的信物",
    "description": ""总有一天你会理解我的选择......原谅我。"",
    "usage": "用于提升阿米娅的潜能。"
  }
  ```
- **影响**: 潜能信物的描述通常是角色的经典台词或背景故事引用，具有很高的剧情价值

### 2. **干员基础描述文本** (`character_table.json`) ⭐ **高优先级**
- **位置**: `char_{id}.itemDesc` 和 `char_{id}.itemUsage`
- **包含数据**:
  - `itemDesc`: 干员简介/格言（如"加油，博士。"）
  - `itemUsage`: 干员获得时的介绍文本
  - `description`: 干员的攻击方式描述
- **示例**:
  ```json
  {
    "itemDesc": "加油，博士。",
    "itemUsage": "罗德岛公开领导人阿米娅，将与你并肩作战。"
  }
  ```

### 3. **干员天赋** (`character_table.json`) ⭐ **中优先级**
- **位置**: `char_{id}.talents[].candidates[]`
- **包含数据**:
  - `name`: 天赋名称
  - `description`: 天赋描述
  - `rangeDescription`: 天赋范围描述
  - 不同潜能等级的天赋变化
- **影响**: 天赋是干员战斗机制的重要组成部分，包含详细的文本描述

### 4. **干员特性** (`character_table.json`) ⭐ **中优先级**
- **位置**: `char_{id}.trait.candidates[]`
- **包含数据**:
  - `overrideDescripton`: 特性描述（如"攻击造成法术伤害"）
  - 不同精英化阶段的特性变化
- **影响**: 特性是干员基础机制的文本说明

### 5. **干员潜能加成** (`character_table.json`) ⭐ **中优先级**
- **位置**: `char_{id}.potentialRanks[]`
- **包含数据**:
  - `description`: 每个潜能等级的加成描述
  - 如"生命上限+200"、"部署费用-1"等
- **示例**:
  ```json
  "potentialRanks": [
    {"description": "生命上限+200"},
    {"description": "部署费用-1"},
    {"description": "攻击力+30"},
    {"description": "部署费用-1"},
    {"description": "天赋效果增强"}
  ]
  ```

### 6. **干员技能** (`skill_table.json`) ⭐ **中优先级**
- **位置**: `skill_{id}.levels[]`
- **包含数据**:
  - `name`: 技能名称
  - `description`: 技能描述（含详细效果说明）
  - `skillType`: 技能类型
  - `spData`: 技力数据
  - `duration`: 持续时间
- **示例**:
  ```json
  {
    "name": "执法模式",
    "description": "攻击力+{atk:0%}，优先攻击当前生命百分比最低的敌人\n持续时间无限",
    "skillType": "AUTO"
  }
  ```

### 7. **干员皮肤** (`skin_table.json`) ⭐ **低优先级**
- **位置**: `charSkins.{skinId}`
- **包含数据**:
  - `displaySkin.skinName`: 皮肤名称
  - `displaySkin.content`: 皮肤描述文本
  - `displaySkin.dialog`: 皮肤相关对话
  - `displaySkin.usage`: 皮肤使用说明
  - `displaySkin.drawerList`: 画师信息
  - `displaySkin.designerList`: 设计师信息
  - `displaySkin.skinGroupName`: 皮肤系列名
- **示例**:
  ```json
  {
    "skinName": "默认服装",
    "content": "阿米娅最常穿着的服装，过大的尺寸似乎暗示了这件衣服曾不属于她\n不少细节部分都经过手工改造，而时间的痕迹也多有残留。",
    "drawerList": ["唯@W"]
  }
  ```

### 8. **干员标签** (`character_table.json`)
- **位置**: `char_{id}.tagList`
- **包含数据**: 干员的标签列表（如"输出"、"生存"、"支援"等）
- **影响**: 用于干员分类和公开招募

### 9. **干员势力关系** (`character_table.json`)
- **位置**: `char_{id}.nationId`, `groupId`, `teamId`
- **补充数据**: 
  - `handbook_team_table.json`: 势力/团队详细信息
    - `powerName`: 势力名称（如"黑钢国际"）
    - `powerCode`: 势力代号（如"BSW"）
    - `color`: 势力颜色
    - `isLimited`: 是否限定
- **影响**: 用于展示干员的组织归属和人际关系

### 10. **子职业信息** (`uniequip_table.json` - `subProfDict`)
- **位置**: `subProfDict.{subProfId}`
- **包含数据**:
  - `subProfessionName`: 子职业名称（如"剑豪"、"领主"、"破阵者"等）
  - `subProfessionId`: 子职业ID
  - `subProfessionCatagory`: 子职业类别编号
- **影响**: 用于更精确地分类干员的职业定位

### 11. **干员召唤物** (`token_table.json`) ⭐ **低优先级**
- **位置**: `trap_{id}` 或通过 `character_table.json` 的 `displayTokenDict` 引用
- **包含数据**:
  - `name`: 召唤物名称
  - `description`: 召唤物描述
  - `appellation`: 召唤物英文名
  - `itemDesc`: 召唤物简介
- **影响**: 部分干员（如凯尔希、玛恩纳、铃兰等）有召唤物

### 12. **玩家头像** (`player_avatar_table.json`) ⭐ **低优先级**
- **位置**: `avatarList[]`
- **包含数据**:
  - `avatarId`: 头像ID
  - `avatarType`: 头像类型（ASSISTANT、MEDAL等）
  - `avatarIdDesc`: 头像描述
  - `avatarItemName`: 头像名称
  - `obtainApproach`: 获取途径
- **影响**: 包含干员助理头像等信息

### 13. **干员模组任务** (`uniequip_table.json` - `missionList`)
- **位置**: `missionList[].desc`
- **包含数据**: 模组解锁任务的描述文本
- **影响**: 与干员成长和故事相关的任务文本

### 14. **干员模组故事** (`uniequip_data.json`)
- **需要确认**: 是否包含模组相关的故事文本
- **影响**: 模组通常附带背景故事

---

## 📊 数据覆盖率统计

### 文本内容类型分布

| 类型 | 状态 | 数据源 | 优先级 |
|------|------|--------|--------|
| 基础信息 | ✅ 已解析 | `character_table.json` | - |
| 档案资料 | ✅ 已解析 | `handbook_info_table.json` | - |
| 语音台词 | ✅ 已解析 | `charword_table.json` | - |
| 模组信息 | ✅ 已解析 | `uniequip_table.json` | - |
| **潜能信物** | ❌ 未解析 | `item_table.json` | ⭐⭐⭐ 高 |
| **简介格言** | ❌ 未解析 | `character_table.json` | ⭐⭐⭐ 高 |
| **天赋** | ❌ 未解析 | `character_table.json` | ⭐⭐ 中 |
| **特性** | ❌ 未解析 | `character_table.json` | ⭐⭐ 中 |
| **潜能加成** | ❌ 未解析 | `character_table.json` | ⭐⭐ 中 |
| **技能** | ❌ 未解析 | `skill_table.json` | ⭐⭐ 中 |
| **皮肤** | ❌ 未解析 | `skin_table.json` | ⭐ 低 |
| 标签 | ❌ 未解析 | `character_table.json` | ⭐ 低 |
| 势力关系 | ❌ 未解析 | `handbook_team_table.json` | ⭐ 低 |
| 子职业 | ❌ 未解析 | `uniequip_table.json` | ⭐ 低 |
| 召唤物 | ❌ 未解析 | `token_table.json` | ⭐ 低 |

### 数据表完整度

| 数据表文件 | 是否访问 | 解析字段比例 | 备注 |
|-----------|---------|-------------|------|
| `character_table.json` | ✅ 是 | ~30% | 仅解析了基础字段，大量文本字段未提取 |
| `handbook_info_table.json` | ✅ 是 | ~90% | 档案内容已完整解析 |
| `charword_table.json` | ✅ 是 | ~90% | 语音内容已完整解析 |
| `uniequip_table.json` | ✅ 是 | ~40% | 仅解析了模组基础信息，未解析子职业等 |
| `item_table.json` | ❌ 否 | 0% | 完全未解析（包含潜能信物） |
| `skill_table.json` | ❌ 否 | 0% | 完全未解析 |
| `skin_table.json` | ❌ 否 | 0% | 完全未解析 |
| `handbook_team_table.json` | ❌ 否 | 0% | 完全未解析 |
| `token_table.json` | ❌ 否 | 0% | 完全未解析 |
| `favor_table.json` | ❌ 否 | 0% | 好感度数据（非文本） |
| `range_table.json` | ❌ 否 | 0% | 攻击范围数据（非文本） |

---

## 🎯 建议实施优先级

### 第一优先级（重要文本内容）
1. **潜能信物** - 包含角色经典台词，具有高剧情价值
2. **简介格言** - 角色的核心表达，展示个性

### 第二优先级（战斗机制文本）
3. **天赋描述** - 详细的机制说明文本
4. **特性描述** - 职业基础机制文本
5. **技能描述** - 完整的技能说明文本
6. **潜能加成** - 潜能等级的效果说明

### 第三优先级（扩展内容）
7. **皮肤信息** - 皮肤描述和设计师信息
8. **子职业信息** - 精确的职业分类
9. **势力关系** - 组织归属详情

### 第四优先级（补充内容）
10. **标签系统** - 干员特点标签
11. **召唤物信息** - 部分干员的召唤物
12. **玩家头像** - 头像相关文本

---

## 💡 实施建议

### 短期目标（1-2天）
- 实现潜能信物解析功能
- 添加简介格言到干员基础信息中
- 在前端CharactersPanel添加"潜能信物"标签页

### 中期目标（3-5天）
- 实现天赋、特性、技能的解析
- 添加"技能与天赋"标签页
- 实现皮肤信息展示

### 长期目标（1-2周）
- 完善所有人物相关数据的解析
- 建立完整的干员数据库视图
- 支持按多维度（势力、子职业、标签）筛选干员

---

## 📝 技术实现路径

### 后端（Rust）
1. 在 `models.rs` 中添加新的数据结构：
   - `CharacterPotentialToken`（潜能信物）
   - `CharacterTalent`（天赋）
   - `CharacterSkill`（技能）
   - `CharacterSkin`（皮肤）
   
2. 在 `data_service.rs` 中添加新的解析方法：
   - `get_character_potential_token(char_id: &str)`
   - `get_character_talents(char_id: &str)`
   - `get_character_skills(char_id: &str)`
   - `get_character_skins(char_id: &str)`

3. 在 `commands.rs` 中注册新的命令

### 前端（TypeScript + React）
1. 在 `types/story.ts` 中添加类型定义
2. 在 `services/api.ts` 中添加API调用
3. 在 `CharactersPanel.tsx` 中添加新的标签页
4. 实现对应的UI组件

---

## 🔍 附录：相关数据表文件清单

### 核心人物数据表
- ✅ `character_table.json` - 干员主表（1017条）
- ✅ `handbook_info_table.json` - 干员档案
- ✅ `charword_table.json` - 干员语音
- ✅ `uniequip_table.json` - 干员模组
- ❌ `item_table.json` - 物品表（含潜能信物）
- ❌ `skill_table.json` - 技能表
- ❌ `skin_table.json` - 皮肤表
- ❌ `handbook_team_table.json` - 势力/团队表
- ❌ `token_table.json` - 召唤物表

### 辅助数据表
- `char_meta_table.json` - 干员元数据
- `char_patch_table.json` - 干员补丁数据
- `char_master_table.json` - 干员大师数据
- `favor_table.json` - 好感度数据
- `player_avatar_table.json` - 玩家头像
- `range_table.json` - 攻击范围
- `battle_equip_table.json` - 战斗装备
- `uniequip_data.json` - 模组数据

---

## 📅 报告生成时间
**2025-10-17**

## 🔗 相关文档
- 参见 `CHARACTER_DATA_ANALYSIS.md` - 之前的分析
- 参见 `MISSING_STORY_ANALYSIS.md` - 剧情数据分析

