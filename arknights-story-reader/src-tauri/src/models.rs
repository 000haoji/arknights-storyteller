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
    },
    Narration {
        text: String,
    },
    Decision {
        options: Vec<String>,
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
