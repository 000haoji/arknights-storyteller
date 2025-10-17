use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryEntry {
    #[serde(rename = "storyId")]
    pub story_id: String,
    #[serde(rename = "storyName")]
    pub story_name: String,
    #[serde(rename = "storyCode")]
    pub story_code: Option<String>,
    #[serde(rename = "storyGroup")]
    pub story_group: String,
    #[serde(rename = "storySort")]
    pub story_sort: i32,
    #[serde(rename = "avgTag")]
    pub avg_tag: Option<String>,
    #[serde(rename = "storyTxt")]
    pub story_txt: String,
    #[serde(rename = "storyInfo")]
    pub story_info: Option<String>,
    #[serde(rename = "storyReviewType")]
    pub story_review_type: String,
    #[serde(rename = "unLockType")]
    pub unlock_type: String,
    // 额外元数据
    #[serde(rename = "storyDependence")]
    pub story_dependence: Option<String>,
    #[serde(rename = "storyCanShow")]
    pub story_can_show: Option<i32>,
    #[serde(rename = "storyCanEnter")]
    pub story_can_enter: Option<i32>,
    #[serde(rename = "stageCount")]
    pub stage_count: Option<i32>,
    #[serde(rename = "requiredStages")]
    pub required_stages: Option<Vec<RequiredStage>>,
    #[serde(rename = "costItemType")]
    pub cost_item_type: Option<String>,
    #[serde(rename = "costItemId")]
    pub cost_item_id: Option<String>,
    #[serde(rename = "costItemCount")]
    pub cost_item_count: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequiredStage {
    #[serde(rename = "stageId")]
    pub stage_id: String,
    #[serde(rename = "minState")]
    pub min_state: String,
    #[serde(rename = "maxState")]
    pub max_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    #[serde(rename = "chapterId")]
    pub chapter_id: String,
    #[serde(rename = "chapterName")]
    pub chapter_name: String,
    #[serde(rename = "chapterName2")]
    pub chapter_name2: String,
    #[serde(rename = "chapterIndex")]
    pub chapter_index: i32,
    #[serde(rename = "preposedChapterId")]
    pub preposed_chapter_id: Option<String>,
    #[serde(rename = "startZoneId")]
    pub start_zone_id: String,
    #[serde(rename = "endZoneId")]
    pub end_zone_id: String,
    #[serde(rename = "chapterEndStageId")]
    pub chapter_end_stage_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Activity {
    pub id: String,
    pub name: String,
    #[serde(rename = "entryType")]
    pub entry_type: String,
    #[serde(rename = "actType")]
    pub act_type: String,
    #[serde(rename = "startTime")]
    pub start_time: i64,
    #[serde(rename = "endTime")]
    pub end_time: i64,
    #[serde(rename = "infoUnlockDatas")]
    pub info_unlock_datas: Vec<StoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum StorySegment {
    Dialogue {
        #[serde(rename = "characterName")]
        character_name: String,
        text: String,
        /// 可选的对话位置（例如右侧头像）
        #[serde(skip_serializing_if = "Option::is_none")]
        position: Option<String>,
    },
    Narration {
        text: String,
    },
    Decision {
        options: Vec<String>,
        /// 对应每个选项的值（若存在）
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        values: Vec<String>,
    },
    System {
        #[serde(rename = "speaker")]
        speaker: Option<String>,
        text: String,
    },
    Subtitle {
        text: String,
        #[serde(rename = "alignment")]
        alignment: Option<String>,
    },
    Sticker {
        text: String,
        #[serde(rename = "alignment")]
        alignment: Option<String>,
    },
    Header {
        title: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedStoryContent {
    pub segments: Vec<StorySegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryCategory {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub category_type: String,
    pub stories: Vec<StoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    #[serde(rename = "storyId")]
    pub story_id: String,
    #[serde(rename = "storyName")]
    pub story_name: String,
    #[serde(rename = "matchedText")]
    pub matched_text: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchDebugResponse {
    pub results: Vec<SearchResult>,
    pub logs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryIndexStatus {
    pub ready: bool,
    pub total: usize,
    #[serde(rename = "lastBuiltAt")]
    pub last_built_at: Option<i64>,
}

// ==================== 干员相关数据结构 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterHandbook {
    #[serde(rename = "charId")]
    pub char_id: String,
    #[serde(rename = "charName")]
    pub char_name: String,
    #[serde(rename = "rarity")]
    pub rarity: i32,
    #[serde(rename = "profession")]
    pub profession: String,
    #[serde(rename = "subProfession")]
    pub sub_profession: Option<String>,
    #[serde(rename = "storyTextAudio")]
    pub story_sections: Vec<HandbookStorySection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandbookStorySection {
    #[serde(rename = "storyTitle")]
    pub story_title: String,
    #[serde(rename = "stories")]
    pub stories: Vec<HandbookStory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandbookStory {
    #[serde(rename = "storyText")]
    pub story_text: String,
    #[serde(rename = "unLockType")]
    pub unlock_type: String,
    #[serde(rename = "unLockParam")]
    pub unlock_param: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterVoice {
    #[serde(rename = "charId")]
    pub char_id: String,
    #[serde(rename = "charName")]
    pub char_name: String,
    #[serde(rename = "voices")]
    pub voices: Vec<VoiceLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceLine {
    #[serde(rename = "voiceId")]
    pub voice_id: String,
    #[serde(rename = "voiceTitle")]
    pub voice_title: String,
    #[serde(rename = "voiceText")]
    pub voice_text: String,
    #[serde(rename = "voiceIndex")]
    pub voice_index: i32,
    #[serde(rename = "unlockType")]
    pub unlock_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterBasicInfo {
    #[serde(rename = "charId")]
    pub char_id: String,
    #[serde(rename = "name")]
    pub name: String,
    #[serde(rename = "appellation")]
    pub appellation: String,
    #[serde(rename = "rarity")]
    pub rarity: i32,
    #[serde(rename = "profession")]
    pub profession: String,
    #[serde(rename = "subProfessionId")]
    pub sub_profession_id: String,
    #[serde(rename = "subProfessionName")]
    pub sub_profession_name: Option<String>,
    #[serde(rename = "position")]
    pub position: String,
    #[serde(rename = "nationId")]
    pub nation_id: Option<String>,
    #[serde(rename = "groupId")]
    pub group_id: Option<String>,
    #[serde(rename = "teamId")]
    pub team_id: Option<String>,
    // 新增字段：简介和格言
    #[serde(rename = "itemDesc")]
    pub item_desc: Option<String>,
    #[serde(rename = "itemUsage")]
    pub item_usage: Option<String>,
    #[serde(rename = "description")]
    pub description: Option<String>,
    #[serde(rename = "tagList")]
    pub tag_list: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterEquipment {
    #[serde(rename = "charId")]
    pub char_id: String,
    #[serde(rename = "charName")]
    pub char_name: String,
    #[serde(rename = "equipments")]
    pub equipments: Vec<EquipmentInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquipmentInfo {
    #[serde(rename = "equipId")]
    pub equip_id: String,
    #[serde(rename = "equipName")]
    pub equip_name: String,
    #[serde(rename = "equipDesc")]
    pub equip_desc: String,
    #[serde(rename = "equipShiningColor")]
    pub equip_shining_color: Option<String>,
    #[serde(rename = "typeName")]
    pub type_name: String,
}

// ==================== 新增：潜能信物 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterPotentialToken {
    #[serde(rename = "charId")]
    pub char_id: String,
    #[serde(rename = "charName")]
    pub char_name: String,
    #[serde(rename = "itemId")]
    pub item_id: String,
    #[serde(rename = "tokenName")]
    pub token_name: String,
    #[serde(rename = "tokenDesc")]
    pub token_desc: String,
    #[serde(rename = "tokenUsage")]
    pub token_usage: String,
    #[serde(rename = "rarity")]
    pub rarity: String,
    #[serde(rename = "obtainApproach")]
    pub obtain_approach: String,
}

// ==================== 新增：天赋 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterTalents {
    #[serde(rename = "charId")]
    pub char_id: String,
    #[serde(rename = "charName")]
    pub char_name: String,
    #[serde(rename = "talents")]
    pub talents: Vec<TalentInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TalentInfo {
    #[serde(rename = "talentIndex")]
    pub talent_index: i32,
    #[serde(rename = "candidates")]
    pub candidates: Vec<TalentCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TalentCandidate {
    #[serde(rename = "unlockCondition")]
    pub unlock_condition: TalentUnlockCondition,
    #[serde(rename = "name")]
    pub name: String,
    #[serde(rename = "description")]
    pub description: Option<String>,
    #[serde(rename = "rangeDescription")]
    pub range_description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TalentUnlockCondition {
    #[serde(rename = "phase")]
    pub phase: String,
    #[serde(rename = "level")]
    pub level: i32,
}

// ==================== 新增：特性 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterTrait {
    #[serde(rename = "charId")]
    pub char_id: String,
    #[serde(rename = "charName")]
    pub char_name: String,
    #[serde(rename = "trait")]
    pub trait_info: Option<TraitInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraitInfo {
    #[serde(rename = "candidates")]
    pub candidates: Vec<TraitCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraitCandidate {
    #[serde(rename = "unlockCondition")]
    pub unlock_condition: TraitUnlockCondition,
    #[serde(rename = "overrideDescripton")]
    pub override_descripton: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraitUnlockCondition {
    #[serde(rename = "phase")]
    pub phase: String,
    #[serde(rename = "level")]
    pub level: i32,
}

// ==================== 新增：潜能加成 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterPotentialRanks {
    #[serde(rename = "charId")]
    pub char_id: String,
    #[serde(rename = "charName")]
    pub char_name: String,
    #[serde(rename = "potentialRanks")]
    pub potential_ranks: Vec<PotentialRank>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PotentialRank {
    #[serde(rename = "rank")]
    pub rank: i32,
    #[serde(rename = "description")]
    pub description: String,
}

// ==================== 新增：技能 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterSkills {
    #[serde(rename = "charId")]
    pub char_id: String,
    #[serde(rename = "charName")]
    pub char_name: String,
    #[serde(rename = "skills")]
    pub skills: Vec<SkillInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    #[serde(rename = "skillId")]
    pub skill_id: String,
    #[serde(rename = "iconId")]
    pub icon_id: Option<String>,
    #[serde(rename = "levels")]
    pub levels: Vec<SkillLevel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillLevel {
    #[serde(rename = "level")]
    pub level: i32,
    #[serde(rename = "name")]
    pub name: String,
    #[serde(rename = "description")]
    pub description: String,
    #[serde(rename = "skillType")]
    pub skill_type: String,
    #[serde(rename = "durationType")]
    pub duration_type: String,
    #[serde(rename = "spData")]
    pub sp_data: SkillSPData,
    #[serde(rename = "duration")]
    pub duration: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillSPData {
    #[serde(rename = "spType")]
    pub sp_type: String,
    #[serde(rename = "spCost")]
    pub sp_cost: i32,
    #[serde(rename = "initSp")]
    pub init_sp: i32,
}

// ==================== 新增：皮肤 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterSkins {
    #[serde(rename = "charId")]
    pub char_id: String,
    #[serde(rename = "charName")]
    pub char_name: String,
    #[serde(rename = "skins")]
    pub skins: Vec<SkinInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkinInfo {
    #[serde(rename = "skinId")]
    pub skin_id: String,
    #[serde(rename = "skinName")]
    pub skin_name: Option<String>,
    #[serde(rename = "illustId")]
    pub illust_id: Option<String>,
    #[serde(rename = "avatarId")]
    pub avatar_id: String,
    #[serde(rename = "portraitId")]
    pub portrait_id: Option<String>,
    #[serde(rename = "isBuySkin")]
    pub is_buy_skin: bool,
    #[serde(rename = "skinGroupName")]
    pub skin_group_name: Option<String>,
    #[serde(rename = "content")]
    pub content: Option<String>,
    #[serde(rename = "dialog")]
    pub dialog: Option<String>,
    #[serde(rename = "usage")]
    pub usage: Option<String>,
    #[serde(rename = "description")]
    pub description: Option<String>,
    #[serde(rename = "obtainApproach")]
    pub obtain_approach: Option<String>,
    #[serde(rename = "drawerList")]
    pub drawer_list: Vec<String>,
}

// ==================== 新增：子职业信息 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubProfessionInfo {
    #[serde(rename = "subProfessionId")]
    pub sub_profession_id: String,
    #[serde(rename = "subProfessionName")]
    pub sub_profession_name: String,
    #[serde(rename = "subProfessionCatagory")]
    pub sub_profession_catagory: i32,
}

// ==================== 新增：势力/团队信息 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamPowerInfo {
    #[serde(rename = "powerId")]
    pub power_id: String,
    #[serde(rename = "powerName")]
    pub power_name: String,
    #[serde(rename = "powerCode")]
    pub power_code: String,
    #[serde(rename = "color")]
    pub color: String,
    #[serde(rename = "isLimited")]
    pub is_limited: bool,
}

// ==================== 新增：基建技能 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterBuildingSkills {
    #[serde(rename = "charId")]
    pub char_id: String,
    #[serde(rename = "charName")]
    pub char_name: String,
    #[serde(rename = "buildingSkills")]
    pub building_skills: Vec<BuildingSkillInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildingSkillInfo {
    #[serde(rename = "buffId")]
    pub buff_id: String,
    #[serde(rename = "buffName")]
    pub buff_name: String,
    #[serde(rename = "description")]
    pub description: String,
    #[serde(rename = "roomType")]
    pub room_type: String,
    #[serde(rename = "unlockCondition")]
    pub unlock_condition: BuildingSkillUnlockCondition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildingSkillUnlockCondition {
    #[serde(rename = "phase")]
    pub phase: String,
    #[serde(rename = "level")]
    pub level: i32,
}
