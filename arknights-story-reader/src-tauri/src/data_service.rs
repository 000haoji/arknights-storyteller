use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use reqwest::blocking::Client;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use unicode_normalization::UnicodeNormalization;
use zip::ZipArchive;

use crate::models::{
    Activity, BlackboardValue, BuildingSkillInfo, BuildingSkillUnlockCondition, Chapter,
    CharacterAllData, CharacterBasicInfo, CharacterBuildingSkills, CharacterEquipment,
    CharacterHandbook, CharacterPotentialRanks, CharacterPotentialToken, CharacterSkins,
    CharacterSkills, CharacterTalents, CharacterTrait, CharacterVoice, EquipmentInfo,
    HandbookStory, HandbookStorySection, PotentialRank, SearchDebugResponse, SearchResult,
    SkinInfo, SkillInfo, SkillLevel, SkillSPData, StoryCategory, StoryEntry, StoryIndexStatus,
    StorySegment, SubProfessionInfo, TalentCandidate, TalentInfo, TalentUnlockCondition,
    TeamPowerInfo, TraitCandidate, TraitInfo, TraitUnlockCondition, VoiceLine,
};
use crate::parser::parse_story_text;

const REPO_API_URL: &str = "https://api.github.com/repos/Kengxxiao/ArknightsGameData";
const REPO_DOWNLOAD_URL: &str = "https://codeload.github.com/Kengxxiao/ArknightsGameData/zip";
const DEFAULT_BRANCH: &str = "master";
const VERSION_FILE: &str = "version.json";
const SEARCH_RESULT_LIMIT: usize = 500;
const INDEX_VERSION: i32 = 2; // bump when FTS schema changes

#[derive(Clone, serde::Serialize)]
struct SyncProgress {
    phase: String,
    current: usize,
    total: usize,
    message: String,
}

#[derive(Clone, serde::Serialize)]
pub struct SearchProgress {
    phase: String,
    current: usize,
    total: usize,
    message: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct VersionInfo {
    commit: String,
    fetched_at: i64,
}

#[derive(Clone)]
struct IndexedStory {
    category_name: String,
    entry_type: String,
    story: StoryEntry,
}

fn emit_progress(
    app: &AppHandle,
    phase: impl Into<String>,
    current: usize,
    total: usize,
    message: impl Into<String>,
) {
    let progress = SyncProgress {
        phase: phase.into(),
        current,
        total,
        message: message.into(),
    };
    let _ = app.emit("sync-progress", progress);
}

fn emit_search_progress(
    app: &AppHandle,
    phase: impl Into<String>,
    current: usize,
    total: usize,
    message: impl Into<String>,
) {
    let progress = SearchProgress {
        phase: phase.into(),
        current,
        total,
        message: message.into(),
    };
    let _ = app.emit("search-progress", progress);
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    if !dst.exists() {
        fs::create_dir_all(dst)
            .map_err(|e| format!("Failed to create directory {:?}: {}", dst, e))?;
    }

    for entry in
        fs::read_dir(src).map_err(|e| format!("Failed to read directory {:?}: {}", src, e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to read file type: {}", e))?;
        let dest_path = dst.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), &dest_path)
                .map_err(|e| format!("Failed to copy file {:?}: {}", entry.path(), e))?;
        }
    }

    Ok(())
}

fn is_common_punctuation(ch: char) -> bool {
    if ch.is_ascii_punctuation() {
        return true;
    }

    matches!(
        ch,
        '，' | '、'
            | '。'
            | '！'
            | '？'
            | '：'
            | '；'
            | '（'
            | '）'
            | '【'
            | '】'
            | '「'
            | '」'
            | '『'
            | '』'
            | '《'
            | '》'
            | '〈'
            | '〉'
            | '—'
            | '～'
            | '…'
            | '·'
            | '﹑'
            | '﹔'
            | '﹗'
            | '﹖'
            | '﹐'
            | '﹒'
            | '﹕'
            | '︰'
    )
}

fn is_cjk(ch: char) -> bool {
    // Basic + Ext A/B ranges (not exhaustive but sufficient here)
    (ch >= '\u{4E00}' && ch <= '\u{9FFF}') // CJK Unified Ideographs
        || (ch >= '\u{3400}' && ch <= '\u{4DBF}') // Extension A
        || (ch >= '\u{20000}' && ch <= '\u{2A6DF}') // Extension B
        || (ch >= '\u{2A700}' && ch <= '\u{2B73F}')
        || (ch >= '\u{2B740}' && ch <= '\u{2B81F}')
        || (ch >= '\u{2B820}' && ch <= '\u{2CEAF}')
}

fn normalize_nfkc_lower_strip_marks(text: &str) -> String {
    // NFKC + lowercase + strip combining marks (e.g., café -> cafe)
    text.nfkc()
        .flat_map(|c| c.to_lowercase())
        .filter(|c| unicode_normalization::char::canonical_combining_class(*c) == 0)
        .collect()
}

fn extract_numeric_parts(text: &str) -> Vec<i32> {
    let mut parts = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        if ch.is_ascii_digit() {
            current.push(ch);
        } else if !current.is_empty() {
            if let Ok(num) = current.parse::<i32>() {
                parts.push(num);
            }
            current.clear();
        }
    }

    if !current.is_empty() {
        if let Ok(num) = current.parse::<i32>() {
            parts.push(num);
        }
    }

    parts
}

fn compare_story_group_ids(a: &str, b: &str) -> Ordering {
    let mut a_parts = extract_numeric_parts(a);
    let mut b_parts = extract_numeric_parts(b);

    if !a_parts.is_empty() || !b_parts.is_empty() {
        let len = a_parts.len().max(b_parts.len());
        a_parts.resize(len, 0);
        b_parts.resize(len, 0);

        for (a_part, b_part) in a_parts.iter().zip(b_parts.iter()) {
            match a_part.cmp(b_part) {
                Ordering::Equal => continue,
                non_eq => return non_eq,
            }
        }
    }

    a.cmp(b)
}

#[derive(Clone)]
pub struct DataService {
    data_dir: PathBuf,
    index_db_path: PathBuf,
}

impl DataService {
    pub fn is_installed(&self) -> bool {
        self.data_dir
            .join("zh_CN/gamedata/excel/story_review_table.json")
            .exists()
    }
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            data_dir: app_data_dir.join("ArknightsGameData"),
            index_db_path: app_data_dir.join("story_index.db"),
        }
    }

    fn open_index_connection(&self) -> Result<Connection, String> {
        if let Some(parent) = self.index_db_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create index directory: {}", e))?;
        }
        let conn = Connection::open(&self.index_db_path)
            .map_err(|e| format!("Failed to open story index database: {}", e))?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            ",
        )
        .map_err(|e| format!("Failed to configure index database: {}", e))?;
        Ok(conn)
    }

    fn try_open_index_connection(&self) -> Result<Option<Connection>, String> {
        if !self.index_db_path.exists() {
            return Ok(None);
        }
        match self.open_index_connection() {
            Ok(conn) => Ok(Some(conn)),
            Err(err) => {
                eprintln!("[INDEX] Failed to open story index: {}", err);
                Ok(None)
            }
        }
    }

    fn init_index_tables(conn: &Connection) -> Result<(), String> {
        // meta table
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS story_index_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            );
            ",
        )
        .map_err(|e| format!("Failed to init story index meta: {}", e))?;

        // read current version
        let current_version: i32 = conn
            .query_row(
                "SELECT value FROM story_index_meta WHERE key = 'index_version'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|s| s.parse::<i32>().ok())
            .unwrap_or(0);

        let should_recreate = current_version < INDEX_VERSION;

        if should_recreate {
            // Drop and recreate virtual table with new schema
            conn.execute_batch(
                "
                DROP TABLE IF EXISTS story_index;
                CREATE VIRTUAL TABLE story_index USING fts5(
                    story_id UNINDEXED,
                    story_name,
                    category UNINDEXED,
                    tokenized_content,
                    story_code,
                    raw_content UNINDEXED,
                    tokenize = 'unicode61 remove_diacritics 2',
                    prefix='2 3 4'
                );
                ",
            )
            .map_err(|e| format!("Failed to (re)create story index: {}", e))?;

            conn.execute(
                "INSERT INTO story_index_meta (key, value) VALUES ('index_version', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![INDEX_VERSION.to_string()],
            )
            .map_err(|e| format!("Failed to update index version: {}", e))?;
        } else {
            // Ensure table exists (fresh install)
            conn.execute_batch(
                "
                CREATE VIRTUAL TABLE IF NOT EXISTS story_index USING fts5(
                    story_id UNINDEXED,
                    story_name,
                    category UNINDEXED,
                    tokenized_content,
                    story_code,
                    raw_content UNINDEXED,
                    tokenize = 'unicode61 remove_diacritics 2',
                    prefix='2 3 4'
                );
                ",
            )
            .map_err(|e| format!("Failed to ensure story index table: {}", e))?;
        }

        Ok(())
    }

    fn clear_story_index(&self) -> Result<(), String> {
        if self.index_db_path.exists() {
            fs::remove_file(&self.index_db_path)
                .map_err(|e| format!("Failed to remove story index: {}", e))?;
        }
        Ok(())
    }

    fn entry_type_display(entry_type: &str) -> String {
        match entry_type {
            "MAINLINE" => "主线".to_string(),
            "ACTIVITY" | "MINI_ACTIVITY" => "活动".to_string(),
            "ROGUELIKE" => "肉鸽".to_string(),
            "SIDESTORY" => "支线".to_string(),
            "NONE" => "干员密录".to_string(),
            "RECORD" => "主线笔记".to_string(),
            "RUNE" => "危机合约".to_string(),
            _ => entry_type.to_string(),
        }
    }

    fn resolve_category_name(entry_type: &str, entry_id: &str, value: &Value) -> String {
        if let Some(name) = value
            .get("name")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            return name.to_string();
        }

        let display = Self::entry_type_display(entry_type);
        if display == entry_type {
            format!("{} ({})", entry_type, entry_id)
        } else {
            format!("{} ({})", display, entry_id)
        }
    }

    fn format_category_label(entry_type: &str, category_name: &str) -> String {
        let prefix = Self::entry_type_display(entry_type);
        let name = category_name.trim();
        if name.is_empty() || name == prefix {
            prefix
        } else {
            format!("{} | {}", prefix, name)
        }
    }

    fn collect_stories_for_index(&self) -> Result<Vec<IndexedStory>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let story_review_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/story_review_table.json");

        let content = fs::read_to_string(&story_review_file)
            .map_err(|e| format!("Failed to read story review file: {}", e))?;

        let data: HashMap<String, Value> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse story review data: {}", e))?;

        let mut seen_ids = HashSet::new();
        let mut stories = Vec::new();

        for (entry_id, value) in data.iter() {
            let entry_type = value
                .get("entryType")
                .and_then(|v| v.as_str())
                .unwrap_or("UNKNOWN");

            let Some(unlock_datas) = value.get("infoUnlockDatas").and_then(|v| v.as_array()) else {
                continue;
            };

            let category_name = Self::resolve_category_name(entry_type, entry_id, value);

            for unlock_data in unlock_datas {
                if let Ok(story) = serde_json::from_value::<StoryEntry>(unlock_data.clone()) {
                    if story.story_txt.trim().is_empty() {
                        continue;
                    }
                    if seen_ids.insert(story.story_id.clone()) {
                        stories.push(IndexedStory {
                            category_name: category_name.clone(),
                            entry_type: entry_type.to_string(),
                            story,
                        });
                    }
                }
            }
        }

        self.extend_index_with_additional_sources(&mut stories, &mut seen_ids);

        stories.sort_by(|a, b| a.story.story_id.cmp(&b.story.story_id));
        Ok(stories)
    }

    fn extend_index_with_additional_sources(
        &self,
        stories: &mut Vec<IndexedStory>,
        seen_ids: &mut HashSet<String>,
    ) {
        match self.get_roguelike_stories_grouped() {
            Ok(groups) => {
                for (group_name, entries) in groups {
                    let category_name = if group_name.trim().is_empty() {
                        "肉鸽".to_string()
                    } else {
                        group_name.clone()
                    };
                    for story in entries {
                        if story.story_txt.trim().is_empty() {
                            continue;
                        }
                        if seen_ids.insert(story.story_id.clone()) {
                            stories.push(IndexedStory {
                                category_name: category_name.clone(),
                                entry_type: "ROGUELIKE".to_string(),
                                story,
                            });
                        }
                    }
                }
            }
            Err(err) => {
                eprintln!("[INDEX] Skip roguelike stories: {}", err);
            }
        }

        match self.get_record_stories_grouped() {
            Ok(groups) => {
                for (chapter_name, entries) in groups {
                    let category_name = if chapter_name.trim().is_empty() {
                        "主线笔记".to_string()
                    } else {
                        chapter_name.clone()
                    };
                    for story in entries {
                        if story.story_txt.trim().is_empty() {
                            continue;
                        }
                        if seen_ids.insert(story.story_id.clone()) {
                            stories.push(IndexedStory {
                                category_name: category_name.clone(),
                                entry_type: "RECORD".to_string(),
                                story,
                            });
                        }
                    }
                }
            }
            Err(err) => {
                eprintln!("[INDEX] Skip record stories: {}", err);
            }
        }

        match self.get_rune_stories() {
            Ok(entries) => {
                let category_name = "危机合约".to_string();
                for story in entries {
                    if story.story_txt.trim().is_empty() {
                        continue;
                    }
                    if seen_ids.insert(story.story_id.clone()) {
                        stories.push(IndexedStory {
                            category_name: category_name.clone(),
                            entry_type: "RUNE".to_string(),
                            story,
                        });
                    }
                }
            }
            Err(err) => {
                eprintln!("[INDEX] Skip rune stories: {}", err);
            }
        }
    }

    fn flatten_segments(segments: &[StorySegment]) -> String {
        let mut parts = Vec::with_capacity(segments.len());
        for segment in segments {
            match segment {
                StorySegment::Dialogue {
                    character_name,
                    text,
                    ..
                } => {
                    parts.push(format!("{}：{}", character_name, text));
                }
                StorySegment::Narration { text }
                | StorySegment::System { text, .. }
                | StorySegment::Subtitle { text, .. }
                | StorySegment::Sticker { text, .. } => {
                    parts.push(text.clone());
                }
                StorySegment::Decision { options, .. } => {
                    parts.push(options.join(" / "));
                }
                StorySegment::Header { title } => {
                    parts.push(title.clone());
                }
            }
        }
        parts.join("\n")
    }

    fn tokenize_for_fts(text: &str) -> Vec<String> {
        let text = normalize_nfkc_lower_strip_marks(text);
        let mut tokens = Vec::new();
        let mut ascii_buffer = String::new();

        for ch in text.chars() {
            if ch.is_ascii_alphanumeric() {
                ascii_buffer.push(ch.to_ascii_lowercase());
                continue;
            }

            if !ascii_buffer.is_empty() {
                let token = std::mem::take(&mut ascii_buffer);
                tokens.push(token);
            }

            if ch.is_whitespace() {
                continue;
            }

            if is_common_punctuation(ch) {
                continue;
            }

            if ch.is_alphanumeric() {
                let token: String = ch.to_lowercase().collect();
                if !token.is_empty() {
                    tokens.push(token);
                }
                continue;
            }

            tokens.push(ch.to_string());
        }

        if !ascii_buffer.is_empty() {
            tokens.push(ascii_buffer);
        }

        tokens
    }

    fn build_tokenized_content(text: &str) -> String {
        Self::tokenize_for_fts(text).join(" ")
    }

    // Build a more expressive FTS query:
    // - Normalize (NFKC + lowercase + strip marks)
    // - Chinese contiguous sequences (len>=2) -> quoted phrase of spaced characters: "凯 尔 希"
    // - ASCII terms -> add * suffix for prefix match
    // - Support simple NOT via leading '-' and OR keyword, default AND
    fn build_fts_query_advanced(raw_query: &str) -> Option<String> {
        let q = normalize_nfkc_lower_strip_marks(raw_query.trim());
        if q.is_empty() {
            return None;
        }

        // Simple tokenizer that respects quoted phrases
        let mut terms: Vec<(String, bool, bool)> = Vec::new(); // (term, is_not, is_or_before)
        let mut buf = String::new();
        let mut in_quotes = false;
        let mut prev_was_or = false;
        let mut chars = q.chars().peekable();
        while let Some(ch) = chars.next() {
            match ch {
                '"' => {
                    if in_quotes {
                        in_quotes = false;
                        let t = std::mem::take(&mut buf);
                        if !t.is_empty() {
                            terms.push((t, false, prev_was_or));
                            prev_was_or = false;
                        }
                    } else {
                        if !buf.trim().is_empty() {
                            let t = std::mem::take(&mut buf);
                            if t == "or" {
                                prev_was_or = true;
                            } else {
                                let is_not = t.starts_with('-');
                                let content = if is_not {
                                    t.trim_start_matches('-').to_string()
                                } else {
                                    t
                                };
                                if !content.is_empty() {
                                    terms.push((content, is_not, prev_was_or));
                                    prev_was_or = false;
                                }
                            }
                        }
                        in_quotes = true;
                    }
                }
                c if c.is_whitespace() && !in_quotes => {
                    if !buf.is_empty() {
                        let t = std::mem::take(&mut buf);
                        if t == "or" {
                            prev_was_or = true;
                        } else {
                            let is_not = t.starts_with('-');
                            let content = if is_not {
                                t.trim_start_matches('-').to_string()
                            } else {
                                t
                            };
                            if !content.is_empty() {
                                terms.push((content, is_not, prev_was_or));
                                prev_was_or = false;
                            }
                        }
                    }
                }
                _ => buf.push(ch),
            }
        }
        if !buf.is_empty() {
            let t = std::mem::take(&mut buf);
            if t == "or" {
                // dangling OR, ignore
            } else {
                let is_not = t.starts_with('-');
                let content = if is_not {
                    t.trim_start_matches('-').to_string()
                } else {
                    t
                };
                if !content.is_empty() {
                    terms.push((content, is_not, prev_was_or));
                }
            }
        }

        if terms.is_empty() {
            return None;
        }

        fn to_phrase_if_cjk(s: &str) -> String {
            let mut has_cjk = false;
            let mut all_cjk = true;
            for ch in s.chars() {
                if is_cjk(ch) {
                    has_cjk = true;
                } else if !ch.is_whitespace() {
                    all_cjk = false;
                }
            }
            if has_cjk && all_cjk {
                let parts: Vec<String> = s
                    .chars()
                    .filter(|c| !c.is_whitespace())
                    .map(|c| if c == '"' { ' ' } else { c })
                    .map(|c| c.to_string())
                    .collect();
                let spaced = parts.join(" ");
                format!("\"{}\"", spaced)
            } else if s.chars().all(|c| c.is_ascii_alphanumeric()) {
                format!("{}*", s)
            } else {
                // mixed or others: quote as is
                let escaped = s.replace('"', "");
                format!("\"{}\"", escaped)
            }
        }

        let mut parts: Vec<String> = Vec::new();
        for (i, (raw, is_not, is_or)) in terms.into_iter().enumerate() {
            if raw.is_empty() {
                continue;
            }
            let mut piece = to_phrase_if_cjk(&raw);
            if is_not {
                piece = format!("NOT {}", piece);
            }
            if i > 0 {
                if is_or {
                    parts.push("OR".to_string());
                } else {
                    parts.push("AND".to_string());
                }
            }
            parts.push(piece);
        }

        if parts.is_empty() {
            None
        } else {
            Some(parts.join(" "))
        }
    }

    fn extract_meta_value(conn: &Connection, key: &str) -> Result<Option<String>, String> {
        conn.query_row(
            "SELECT value FROM story_index_meta WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| format!("Failed to read story index meta {}: {}", key, e))
    }

    /// 下载并解压最新数据包
    pub fn sync_data(&self, app: AppHandle) -> Result<(), String> {
        eprintln!("[SYNC] === 开始同步数据 ===");
        emit_progress(&app, "准备", 0, 1, "正在初始化同步环境");

        eprintln!("[SYNC] 创建 HTTP 客户端");
        let client = Self::create_http_client()?;

        eprintln!("[SYNC] 获取最新 commit");
        let remote_commit = match self.fetch_latest_commit(&client) {
            Ok(commit) => {
                eprintln!("[SYNC] 成功获取 commit: {}", &commit);
                let short = commit.get(..7).unwrap_or(commit.as_str());
                emit_progress(&app, "准备", 1, 1, format!("最新版本 {}", short));
                Some(commit)
            }
            Err(err) => {
                eprintln!("[SYNC] 获取 commit 失败: {}", err);
                emit_progress(
                    &app,
                    "准备",
                    0,
                    1,
                    format!("获取版本信息失败，回退到 {}: {}", DEFAULT_BRANCH, err),
                );
                None
            }
        };

        let reference = remote_commit
            .clone()
            .unwrap_or_else(|| DEFAULT_BRANCH.to_string());
        eprintln!("[SYNC] 使用引用: {}", reference);

        eprintln!("[SYNC] 开始下载和解压");
        self.download_and_extract(&client, &app, &reference)?;
        eprintln!("[SYNC] 下载和解压完成");

        if let Err(err) = self.clear_story_index() {
            eprintln!("[SYNC] Failed to reset story index: {}", err);
        }

        // 写入版本信息
        eprintln!("[SYNC] 写入版本信息");
        let commit_to_store = remote_commit.unwrap_or_else(|| "unknown".to_string());
        let fetched_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let info = VersionInfo {
            commit: commit_to_store,
            fetched_at,
        };
        self.write_version(&info)?;

        eprintln!("[SYNC] === 同步完成 ===");
        emit_progress(&app, "完成", 1, 1, "同步完成");
        Ok(())
    }

    pub fn get_current_version(&self) -> Result<String, String> {
        if let Some(info) = self.read_version() {
            let commit_short = if info.commit.len() >= 7 {
                &info.commit[..7]
            } else {
                info.commit.as_str()
            };
            Ok(format!(
                "{} ({})",
                commit_short,
                format_timestamp(info.fetched_at)
            ))
        } else {
            Ok("未安装".to_string())
        }
    }

    pub fn get_remote_version(&self) -> Result<String, String> {
        let client = Self::create_http_client()?;
        match self.fetch_latest_commit(&client) {
            Ok(commit) => {
                let short = if commit.len() >= 7 {
                    &commit[..7]
                } else {
                    commit.as_str()
                };
                Ok(short.to_string())
            }
            Err(_) => Ok("未知".to_string()),
        }
    }

    pub fn check_update(&self) -> Result<bool, String> {
        let current = self.read_version();
        if current.is_none() {
            return Ok(true);
        }

        let client = Self::create_http_client()?;
        match self.fetch_latest_commit(&client) {
            Ok(remote) => {
                if let Some(cur) = current {
                    Ok(cur.commit != remote)
                } else {
                    Ok(true)
                }
            }
            Err(_) => Ok(true),
        }
    }

    fn create_http_client() -> Result<Client, String> {
        Client::builder()
            .user_agent("arknights-story-reader")
            .build()
            .map_err(|e| format!("Failed to create http client: {}", e))
    }

    fn fetch_latest_commit(&self, client: &Client) -> Result<String, String> {
        let url = format!("{}/commits/{}", REPO_API_URL, DEFAULT_BRANCH);
        let response = client
            .get(&url)
            .send()
            .map_err(|e| format!("Failed to request latest commit: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("GitHub API returned status {}", response.status()));
        }

        let value: serde_json::Value = response
            .json()
            .map_err(|e| format!("Failed to parse commit response: {}", e))?;

        value
            .get("sha")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Failed to read commit sha".to_string())
    }

    fn download_and_extract(
        &self,
        client: &Client,
        app: &AppHandle,
        reference: &str,
    ) -> Result<(), String> {
        eprintln!("[SYNC] download_and_extract 开始");
        let parent_dir = self
            .data_dir
            .parent()
            .ok_or_else(|| "Invalid data directory".to_string())?;
        eprintln!("[SYNC] parent_dir: {:?}", parent_dir);

        let download_url = format!("{}/{}", REPO_DOWNLOAD_URL, reference);
        eprintln!("[SYNC] download_url: {}", download_url);
        emit_progress(app, "下载", 0, 100, format!("从 {} 下载", reference));

        eprintln!("[SYNC] 发起 HTTP GET 请求");
        let mut response = client.get(&download_url).send().map_err(|e| {
            eprintln!("[SYNC ERROR] HTTP 请求失败: {}", e);
            format!("Download failed: {}", e)
        })?;

        eprintln!("[SYNC] HTTP 状态码: {}", response.status());
        if !response.status().is_success() {
            return Err(format!("Download returned status {}", response.status()));
        }

        let total_bytes = response.content_length().unwrap_or(0) as usize;
        let zip_path = parent_dir.join("ArknightsGameData.zip");
        let mut zip_file = fs::File::create(&zip_path)
            .map_err(|e| format!("Failed to create temp zip file: {}", e))?;

        let mut downloaded: usize = 0;
        let mut buffer = [0u8; 8192];
        loop {
            let bytes_read = response
                .read(&mut buffer)
                .map_err(|e| format!("Failed to read download stream: {}", e))?;
            if bytes_read == 0 {
                break;
            }
            zip_file
                .write_all(&buffer[..bytes_read])
                .map_err(|e| format!("Failed to write zip data: {}", e))?;
            downloaded += bytes_read;

            let percent = if total_bytes > 0 {
                (downloaded as f64 / total_bytes as f64 * 100.0).min(100.0)
            } else {
                0.0
            };
            let downloaded_mb = downloaded as f64 / 1_048_576.0;
            let total_mb = total_bytes as f64 / 1_048_576.0;
            let message = if total_bytes > 0 {
                format!("已下载 {:.1}/{:.1} MB", downloaded_mb, total_mb.max(0.1))
            } else {
                format!("已下载 {:.1} MB", downloaded_mb)
            };
            emit_progress(app, "下载", percent.round() as usize, 100, message);
        }
        zip_file
            .flush()
            .map_err(|e| format!("Failed to flush zip file: {}", e))?;

        emit_progress(app, "下载", 100, 100, "下载完成");
        self.extract_zip_at(&zip_path, parent_dir, app)?;
        fs::remove_file(&zip_path).ok();

        Ok(())
    }

    fn extract_zip_at(
        &self,
        zip_path: &Path,
        parent_dir: &Path,
        app: &AppHandle,
    ) -> Result<(), String> {
        emit_progress(app, "解压", 0, 100, "正在解压数据");
        let extract_root = parent_dir.join("ArknightsGameData_extract");
        if extract_root.exists() {
            fs::remove_dir_all(&extract_root)
                .map_err(|e| format!("Failed to clean extract dir: {}", e))?;
        }
        fs::create_dir_all(&extract_root)
            .map_err(|e| format!("Failed to create extract dir: {}", e))?;

        let zip_file = fs::File::open(zip_path)
            .map_err(|e| format!("Failed to open downloaded zip: {}", e))?;
        let mut archive =
            ZipArchive::new(zip_file).map_err(|e| format!("Failed to read zip archive: {}", e))?;

        let total_entries = usize::max(archive.len(), 1);
        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| format!("Failed to access zip entry: {}", e))?;
            let relative_path = match file.enclosed_name() {
                Some(path) => path.to_owned(),
                None => continue,
            };
            let out_path = extract_root.join(&relative_path);

            if file.is_dir() {
                fs::create_dir_all(&out_path)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            } else {
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                }
                let mut outfile = fs::File::create(&out_path)
                    .map_err(|e| format!("Failed to create file: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to write file: {}", e))?;
            }

            let percent = ((i + 1) as f64 / total_entries as f64 * 100.0).min(100.0);
            emit_progress(
                app,
                "解压",
                percent.round() as usize,
                100,
                format!("解压 {}/{} ({:.1}%)", i + 1, total_entries, percent),
            );
        }

        emit_progress(app, "解压", 100, 100, "解压完成");

        let extracted_root = fs::read_dir(&extract_root)
            .map_err(|e| format!("Failed to read extracted directory: {}", e))?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .find(|path| path.is_dir())
            .ok_or_else(|| "解压后的文件结构不正确".to_string())?;

        if self.data_dir.exists() {
            fs::remove_dir_all(&self.data_dir)
                .map_err(|e| format!("Failed to remove old data: {}", e))?;
        }

        match fs::rename(&extracted_root, &self.data_dir) {
            Ok(_) => {}
            Err(_) => {
                copy_dir_all(&extracted_root, &self.data_dir)?;
                fs::remove_dir_all(&extracted_root).ok();
            }
        }

        fs::remove_dir_all(&extract_root).ok();
        Ok(())
    }

    fn finalize_manual_import(&self, temp_path: &Path, app: &AppHandle) -> Result<(), String> {
        let parent_dir = self
            .data_dir
            .parent()
            .ok_or_else(|| "Invalid data directory".to_string())?;

        emit_progress(app, "导入", 40, 100, "正在解压 ZIP 文件");
        self.extract_zip_at(temp_path, parent_dir, app)?;
        fs::remove_file(temp_path).ok();

        if let Err(err) = self.clear_story_index() {
            eprintln!("[IMPORT] Failed to reset story index: {}", err);
        }

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let info = VersionInfo {
            commit: format!("manual-{}", timestamp),
            fetched_at: timestamp,
        };
        self.write_version(&info)?;

        emit_progress(app, "完成", 100, 100, "导入完成");
        Ok(())
    }

    pub fn import_zip_from_path<P: AsRef<Path>>(
        &self,
        source: P,
        app: AppHandle,
    ) -> Result<(), String> {
        let source_path = source.as_ref();
        if !source_path.exists() {
            return Err("ZIP 文件不存在".to_string());
        }

        let parent_dir = self
            .data_dir
            .parent()
            .ok_or_else(|| "Invalid data directory".to_string())?;

        let temp_path = parent_dir.join("ArknightsGameData_import.zip");
        emit_progress(&app, "导入", 0, 100, "正在复制 ZIP 文件");
        fs::copy(source_path, &temp_path).map_err(|e| format!("复制 ZIP 文件失败: {}", e))?;

        emit_progress(&app, "导入", 30, 100, "正在校验 ZIP 文件");
        self.finalize_manual_import(&temp_path, &app)
    }

    pub fn import_zip_from_bytes(&self, data: &[u8], app: AppHandle) -> Result<(), String> {
        let parent_dir = self
            .data_dir
            .parent()
            .ok_or_else(|| "Invalid data directory".to_string())?;

        fs::create_dir_all(parent_dir).map_err(|e| format!("无法创建数据目录: {}", e))?;

        let temp_path = parent_dir.join("ArknightsGameData_import.zip");
        emit_progress(&app, "导入", 0, 100, "正在写入 ZIP 数据");
        fs::write(&temp_path, data).map_err(|e| format!("写入 ZIP 数据失败: {}", e))?;

        emit_progress(&app, "导入", 30, 100, "正在校验 ZIP 文件");
        self.finalize_manual_import(&temp_path, &app)
    }

    fn version_file_path(&self) -> PathBuf {
        self.data_dir.join(VERSION_FILE)
    }

    fn read_version(&self) -> Option<VersionInfo> {
        let path = self.version_file_path();
        if !path.exists() {
            return None;
        }
        let content = fs::read_to_string(&path).ok()?;
        serde_json::from_str(&content).ok()
    }

    fn write_version(&self, info: &VersionInfo) -> Result<(), String> {
        if !self.data_dir.exists() {
            fs::create_dir_all(&self.data_dir)
                .map_err(|e| format!("Failed to create data directory: {}", e))?;
        }
        let path = self.version_file_path();
        let content = serde_json::to_string_pretty(info)
            .map_err(|e| format!("Failed to serialize version info: {}", e))?;
        fs::write(&path, content).map_err(|e| format!("Failed to write version info: {}", e))
    }
}

/// 格式化时间戳
fn format_timestamp(timestamp: i64) -> String {
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    let duration = Duration::from_secs(timestamp as u64);
    let datetime = UNIX_EPOCH + duration;

    if let Ok(elapsed) = SystemTime::now().duration_since(datetime) {
        let days = elapsed.as_secs() / 86400;
        if days == 0 {
            let hours = elapsed.as_secs() / 3600;
            if hours == 0 {
                let mins = elapsed.as_secs() / 60;
                return format!("{}分钟前", mins.max(1));
            }
            return format!("{}小时前", hours);
        } else if days < 30 {
            return format!("{}天前", days);
        }
    }

    "较早前".to_string()
}

impl DataService {
    /// 获取所有章节
    pub fn get_chapters(&self) -> Result<Vec<Chapter>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }
        let chapter_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/chapter_table.json");

        let content = fs::read_to_string(&chapter_file)
            .map_err(|e| format!("Failed to read chapter file: {}", e))?;

        let data: HashMap<String, Chapter> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse chapter data: {}", e))?;

        let mut chapters: Vec<Chapter> = data.into_values().collect();
        chapters.sort_by_key(|c| c.chapter_index);

        Ok(chapters)
    }

    /// 获取所有活动
    pub fn get_activities(&self) -> Result<Vec<Activity>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }
        let story_review_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/story_review_table.json");

        let content = fs::read_to_string(&story_review_file)
            .map_err(|e| format!("Failed to read story review file: {}", e))?;

        let data: HashMap<String, Value> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse story review data: {}", e))?;

        let mut activities = Vec::new();

        for (id, value) in data.iter() {
            if let Some(entry_type) = value.get("entryType").and_then(|v| v.as_str()) {
                if entry_type == "ACTIVITY" {
                    let activity: Activity = serde_json::from_value(value.clone())
                        .map_err(|e| format!("Failed to parse activity: {}", e))?;
                    activities.push(Activity {
                        id: id.clone(),
                        ..activity
                    });
                }
            }
        }

        Ok(activities)
    }

    /// 获取分类的剧情列表（仅返回分类，不含故事列表）
    pub fn get_story_categories(&self) -> Result<Vec<StoryCategory>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let story_review_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/story_review_table.json");

        let content = fs::read_to_string(&story_review_file)
            .map_err(|e| format!("Failed to read story review file: {}", e))?;

        let data: HashMap<String, Value> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse story review data: {}", e))?;

        let mut categories = Vec::new();

        // 主线剧情
        let main_stories = self.parse_stories_by_entry_type(&data, "MAINLINE")?;
        if !main_stories.is_empty() {
            categories.push(StoryCategory {
                id: "mainline".to_string(),
                name: "主线剧情".to_string(),
                category_type: "chapter".to_string(),
                stories: main_stories,
            });
        }

        Ok(categories)
    }

    /// 根据 entryType 解析剧情
    fn parse_stories_by_entry_type(
        &self,
        data: &HashMap<String, Value>,
        entry_type: &str,
    ) -> Result<Vec<StoryEntry>, String> {
        let mut stories = Vec::new();

        for (_id, value) in data.iter() {
            if let Some(et) = value.get("entryType").and_then(|v| v.as_str()) {
                if et == entry_type {
                    if let Some(unlock_datas) =
                        value.get("infoUnlockDatas").and_then(|v| v.as_array())
                    {
                        for unlock_data in unlock_datas {
                            if let Ok(story) =
                                serde_json::from_value::<StoryEntry>(unlock_data.clone())
                            {
                                stories.push(story);
                            }
                        }
                    }
                }
            }
        }

        stories.sort_by_key(|s| s.story_sort);
        Ok(stories)
    }

    /// 获取主线剧情
    fn get_main_stories(&self) -> Result<Vec<StoryEntry>, String> {
        let story_review_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/story_review_table.json");

        let content = fs::read_to_string(&story_review_file)
            .map_err(|e| format!("Failed to read story review file: {}", e))?;

        let data: HashMap<String, Value> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse story review data: {}", e))?;

        let mut stories = Vec::new();

        for (_id, value) in data.iter() {
            if let Some(entry_type) = value.get("entryType").and_then(|v| v.as_str()) {
                if entry_type == "MAINLINE" {
                    if let Some(unlock_datas) =
                        value.get("infoUnlockDatas").and_then(|v| v.as_array())
                    {
                        for unlock_data in unlock_datas {
                            if let Ok(story) =
                                serde_json::from_value::<StoryEntry>(unlock_data.clone())
                            {
                                stories.push(story);
                            }
                        }
                    }
                }
            }
        }

        stories.sort_by_key(|s| s.story_sort);
        Ok(stories)
    }

    /// 读取剧情文本
    pub fn read_story_text(&self, story_path: &str) -> Result<String, String> {
        let base_dir = self.data_dir.join("zh_CN/gamedata/story");

        // 首先检查是否为目录（月度聊天类型）
        let dir_path = base_dir.join(story_path);
        if dir_path.is_dir() {
            // 读取目录下的所有 .txt 文件并按顺序拼接
            let mut story_files = Vec::new();
            if let Ok(entries) = fs::read_dir(&dir_path) {
                for entry in entries.flatten() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.ends_with(".txt") {
                        story_files.push(file_name);
                    }
                }
            }

            // 排序文件（按 _1, _2, _3 等顺序）
            story_files.sort();

            if story_files.is_empty() {
                return Err(format!("No story files found in directory: {}", story_path));
            }

            // 按顺序读取并拼接所有文件
            let mut combined_content = String::new();
            for (idx, file_name) in story_files.iter().enumerate() {
                let file_path = dir_path.join(file_name);
                let content = fs::read_to_string(&file_path)
                    .map_err(|e| format!("Failed to read story file {}: {}", file_name, e))?;

                if idx > 0 {
                    // 在文件之间添加分隔符（保持剧情连续性）
                    combined_content.push_str("\n\n");
                }
                combined_content.push_str(&content);
            }

            return Ok(combined_content);
        }

        // 如果不是目录，按原逻辑读取单个文件
        let full_path = base_dir.join(format!("{}.txt", story_path));
        fs::read_to_string(&full_path).map_err(|e| format!("Failed to read story file: {}", e))
    }

    /// 读取剧情简介
    pub fn read_story_info(&self, info_path: &str) -> Result<String, String> {
        let base_dir = self.data_dir.join("zh_CN/gamedata/story");

        let trimmed = info_path.trim();
        if trimmed.is_empty() {
            return Err("Failed to read info file: empty info path".to_string());
        }

        let normalized = trimmed
            .trim_matches(|c| c == '/' || c == '\\')
            .replace('\\', "/");

        let mut candidates = Vec::new();
        candidates.push(base_dir.join(format!("{}.txt", normalized)));

        if normalized.starts_with("info/") {
            let replaced = normalized.replacen("info/", "[uc]info/", 1);
            candidates.push(base_dir.join(format!("{}.txt", replaced)));
        }

        for candidate in &candidates {
            match fs::read_to_string(candidate) {
                Ok(content) => return Ok(content),
                Err(err) if err.kind() == ErrorKind::NotFound => continue,
                Err(err) => {
                    return Err(format!("Failed to read info file: {}", err));
                }
            }
        }

        Err(format!(
            "Failed to read info file: {} (candidates: {})",
            info_path,
            candidates
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ))
    }

    /// 重建剧情全文索引
    pub fn rebuild_story_index(&self) -> Result<(), String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let mut conn = self.open_index_connection()?;
        Self::init_index_tables(&conn)?;

        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to start index transaction: {}", e))?;

        tx.execute("DELETE FROM story_index", [])
            .map_err(|e| format!("Failed to clear story index: {}", e))?;

        let indexed_stories = self.collect_stories_for_index()?;
        let mut insert_stmt = tx
            .prepare(
                "
            INSERT INTO story_index (
                story_id,
                story_name,
                category,
                tokenized_content,
                story_code,
                raw_content
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ",
            )
            .map_err(|e| format!("Failed to prepare story index insert: {}", e))?;

        let mut total = 0usize;

        for indexed in &indexed_stories {
            let story_id = &indexed.story.story_id;
            let story_name = &indexed.story.story_name;
            let story_path = &indexed.story.story_txt;

            let raw_text = match self.read_story_text(story_path) {
                Ok(text) => text,
                Err(err) => {
                    eprintln!(
                        "[INDEX] Skip story {}: failed to read text ({})",
                        story_id, err
                    );
                    continue;
                }
            };

            let parsed = parse_story_text(&raw_text);
            let flattened = Self::flatten_segments(&parsed.segments);

            let combined_raw = if flattened.trim().is_empty() {
                story_name.clone()
            } else {
                format!("{}\n{}", story_name, flattened)
            };

            let tokenized = Self::build_tokenized_content(&combined_raw);
            if tokenized.trim().is_empty() {
                continue;
            }

            let category_label =
                Self::format_category_label(&indexed.entry_type, &indexed.category_name);

            insert_stmt
                .execute(params![
                    story_id,
                    story_name,
                    &category_label,
                    tokenized,
                    indexed
                        .story
                        .story_code
                        .as_ref()
                        .map(|s| normalize_nfkc_lower_strip_marks(s))
                        .unwrap_or_default(),
                    combined_raw
                ])
                .map_err(|e| format!("Failed to insert story into index: {}", e))?;
            total += 1;
        }

        drop(insert_stmt);

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        tx.execute(
            "
            INSERT INTO story_index_meta (key, value)
            VALUES ('last_built_at', ?1)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        ",
            params![timestamp.to_string()],
        )
        .map_err(|e| format!("Failed to update index metadata: {}", e))?;

        tx.execute(
            "
            INSERT INTO story_index_meta (key, value)
            VALUES ('total_count', ?1)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        ",
            params![total.to_string()],
        )
        .map_err(|e| format!("Failed to update index total: {}", e))?;

        tx.commit()
            .map_err(|e| format!("Failed to commit story index rebuild: {}", e))?;

        Ok(())
    }

    /// 获取索引状态
    pub fn get_story_index_status(&self) -> Result<StoryIndexStatus, String> {
        let Some(conn) = self.try_open_index_connection()? else {
            return Ok(StoryIndexStatus {
                ready: false,
                total: 0,
                last_built_at: None,
            });
        };

        Self::init_index_tables(&conn)?;

        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM story_index", [], |row| row.get(0))
            .unwrap_or(0);

        let last_built_at = Self::extract_meta_value(&conn, "last_built_at")?
            .and_then(|value| value.parse::<i64>().ok());

        Ok(StoryIndexStatus {
            ready: total > 0,
            total: total.max(0) as usize,
            last_built_at,
        })
    }

    fn search_stories_with_index(&self, query: &str) -> Result<Option<Vec<SearchResult>>, String> {
        let Some(conn) = self.try_open_index_connection()? else {
            return Ok(None);
        };

        Self::init_index_tables(&conn)?;

        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM story_index", [], |row| row.get(0))
            .unwrap_or(0);
        if total == 0 {
            return Ok(None);
        }

        let Some(fts_query) = Self::build_fts_query_advanced(query) else {
            return Ok(Some(Vec::new()));
        };

        let query_sql = format!(
            "
            SELECT story_id, story_name, category, raw_content,
                   snippet(story_index, -1, '', '', '...', 24) as snip
            FROM story_index
            WHERE story_index MATCH ?1
            ORDER BY bm25(story_index)
            LIMIT {}
        ",
            SEARCH_RESULT_LIMIT
        );

        let mut stmt = conn
            .prepare(&query_sql)
            .map_err(|e| format!("Failed to prepare story index query: {}", e))?;

        let rows = stmt
            .query_map(params![fts_query], |row| {
                let story_id: String = row.get(0)?;
                let story_name: String = row.get(1)?;
                let category: String = row.get(2)?;
                let raw_content: String = row.get(3)?;
                let snip: String = row.get(4).unwrap_or_else(|_| String::new());
                Ok((story_id, story_name, category, raw_content, snip))
            })
            .map_err(|e| format!("Failed to execute story index query: {}", e))?;

        let query_lower = query.to_lowercase();
        let mut results = Vec::new();
        for row in rows {
            if let Ok((story_id, story_name, category, raw_content, snip)) = row {
                // 优先使用原始内容提取上下文，避免 tokenized_content 导致的空格断字
                let mut matched_text = self.extract_context(&raw_content, &query_lower);
                if matched_text.trim().is_empty() && !snip.trim().is_empty() {
                    // 兜底：少数情况下 extract_context 未命中，回退 snippet 再做一次去空格优化
                    let cleaned = snip
                        .replace('\n', " ")
                        .replace('\r', " ")
                        .replace("  ", " ");
                    matched_text = cleaned;
                }
                if matched_text.is_empty() {
                    let preview: String = raw_content.chars().take(120).collect();
                    matched_text = if preview.len() < raw_content.len() {
                        format!("{}...", preview)
                    } else {
                        preview
                    };
                }
                results.push(SearchResult {
                    story_id,
                    story_name,
                    matched_text,
                    category,
                });
            }
        }

        Ok(Some(results))
    }

    fn search_stories_fallback(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let mut results = Vec::new();
        let query_norm = normalize_nfkc_lower_strip_marks(query);

        let stories = self.collect_stories_for_index()?;

        for indexed in &stories {
            let story = &indexed.story;
            let category_label =
                Self::format_category_label(&indexed.entry_type, &indexed.category_name);

            let story_name_norm = normalize_nfkc_lower_strip_marks(&story.story_name);
            if story_name_norm.contains(&query_norm) {
                results.push(SearchResult {
                    story_id: story.story_id.clone(),
                    story_name: story.story_name.clone(),
                    matched_text: story.story_name.clone(),
                    category: category_label,
                });
                if results.len() >= SEARCH_RESULT_LIMIT {
                    return Ok(results);
                }
                continue;
            }

            if let Ok(content) = self.read_story_text(&story.story_txt) {
                let content_norm = normalize_nfkc_lower_strip_marks(&content);
                if content_norm.contains(&query_norm) {
                    // Use original content for extracting visible context
                    let matched_text = self.extract_context(&content, &query_norm);
                    results.push(SearchResult {
                        story_id: story.story_id.clone(),
                        story_name: story.story_name.clone(),
                        matched_text,
                        category: category_label,
                    });
                    if results.len() >= SEARCH_RESULT_LIMIT {
                        return Ok(results);
                    }
                }
            }
        }

        Ok(results)
    }

    /// 搜索剧情（混合：索引优先 + 线性扫描补全，防止遗漏）
    pub fn search_stories(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        // 先走索引
        let mut combined: Vec<SearchResult> = match self.search_stories_with_index(trimmed) {
            Ok(Some(results)) => results,
            Ok(None) => Vec::new(),
            Err(err) => {
                eprintln!(
                    "[INDEX] Failed to search using index ({}), fallback to linear scan",
                    err
                );
                Vec::new()
            }
        };

        // 线性扫描补全（去重 by story_id）
        let mut seen = std::collections::HashSet::new();
        for r in &combined {
            seen.insert(r.story_id.clone());
        }

        let fallback_results = self.search_stories_fallback(trimmed)?;
        for r in fallback_results {
            if seen.insert(r.story_id.clone()) {
                combined.push(r);
                if combined.len() >= SEARCH_RESULT_LIMIT {
                    break;
                }
            }
        }

        Ok(combined)
    }

    pub fn search_stories_with_debug(&self, query: &str) -> Result<SearchDebugResponse, String> {
        let mut logs = Vec::new();
        let trimmed = query.trim();
        if trimmed.is_empty() {
            logs.push("查询为空，直接返回".to_string());
            return Ok(SearchDebugResponse {
                results: Vec::new(),
                logs,
            });
        }

        let start_time = Instant::now();
        logs.push(format!("开始搜索: \"{}\"", trimmed));

        // Show normalized and FTS query preview
        let normalized = normalize_nfkc_lower_strip_marks(trimmed);
        logs.push(format!("规范化后的查询: \"{}\"", normalized));
        if let Some(fts_query_preview) = Self::build_fts_query_advanced(trimmed) {
            logs.push(format!("FTS 查询: {}", fts_query_preview));
        } else {
            logs.push("FTS 查询为空（可能仅包含标点或无效字符）".to_string());
        }

        let index_attempt_start = Instant::now();
        let mut index_results: Vec<SearchResult> = Vec::new();
        match self.search_stories_with_index(trimmed) {
            Ok(Some(results)) => {
                let index_elapsed = index_attempt_start.elapsed();
                logs.push(format!(
                    "全文索引查询完成，耗时 {} ms，结果 {} 条",
                    index_elapsed.as_millis(),
                    results.len()
                ));
                index_results = results;
            }
            Ok(None) => {
                logs.push(format!(
                    "全文索引不可用或未建立，耗时 {} ms",
                    index_attempt_start.elapsed().as_millis()
                ));
            }
            Err(err) => {
                logs.push(format!(
                    "全文索引查询失败: {} (耗时 {} ms)，将回退线性扫描",
                    err,
                    index_attempt_start.elapsed().as_millis()
                ));
            }
        }

        let fallback_start = Instant::now();
        let fallback_results = self.search_stories_fallback(trimmed)?;
        logs.push(format!(
            "线性扫描完成，耗时 {} ms，结果 {} 条",
            fallback_start.elapsed().as_millis(),
            fallback_results.len()
        ));
        if fallback_results.len() >= SEARCH_RESULT_LIMIT {
            logs.push(format!(
                "结果数量达到上限 {} 条，建议缩小检索范围",
                SEARCH_RESULT_LIMIT
            ));
        }
        // 合并结果（索引优先顺序），去重并截断
        let mut seen = std::collections::HashSet::new();
        let mut merged = Vec::new();
        for r in index_results {
            if seen.insert(r.story_id.clone()) {
                merged.push(r);
                if merged.len() >= SEARCH_RESULT_LIMIT {
                    break;
                }
            }
        }
        let mut added = 0usize;
        if merged.len() < SEARCH_RESULT_LIMIT {
            for r in fallback_results {
                if seen.insert(r.story_id.clone()) {
                    merged.push(r);
                    added += 1;
                    if merged.len() >= SEARCH_RESULT_LIMIT {
                        break;
                    }
                }
            }
        }
        if added > 0 {
            logs.push(format!("线性扫描补全 {} 条结果", added));
        }
        logs.push(format!(
            "搜索总耗时 {} ms",
            start_time.elapsed().as_millis()
        ));

        Ok(SearchDebugResponse {
            results: merged,
            logs,
        })
    }

    /// 带进度事件的搜索：优先使用索引；当回退线性扫描时，实时发送遍历进度
    pub fn search_stories_with_progress(
        &self,
        app: &AppHandle,
        query: &str,
    ) -> Result<Vec<SearchResult>, String> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            emit_search_progress(app, "完成", 1, 1, "查询为空");
            return Ok(Vec::new());
        }

        // 尝试索引
        match self.search_stories_with_index(trimmed) {
            Ok(Some(results)) => {
                emit_search_progress(app, "索引检索", 1, 1, "使用全文索引完成");
                return Ok(results);
            }
            Ok(None) => {
                // fallthrough
            }
            Err(_err) => {
                // fallthrough to fallback scan
            }
        }

        // 线性扫描，实时进度
        let stories = self.collect_stories_for_index()?;
        let total = stories.len();
        emit_search_progress(app, "线性扫描", 0, total.max(1), "开始遍历");

        let mut results = Vec::new();
        let query_norm = normalize_nfkc_lower_strip_marks(trimmed);
        for (idx, indexed) in stories.iter().enumerate() {
            let story = &indexed.story;
            let category_label =
                Self::format_category_label(&indexed.entry_type, &indexed.category_name);

            let story_name_norm = normalize_nfkc_lower_strip_marks(&story.story_name);
            if story_name_norm.contains(&query_norm) {
                results.push(SearchResult {
                    story_id: story.story_id.clone(),
                    story_name: story.story_name.clone(),
                    matched_text: story.story_name.clone(),
                    category: category_label.clone(),
                });
            } else if let Ok(content) = self.read_story_text(&story.story_txt) {
                let content_norm = normalize_nfkc_lower_strip_marks(&content);
                if content_norm.contains(&query_norm) {
                    let matched_text = self.extract_context(&content, &query_norm);
                    results.push(SearchResult {
                        story_id: story.story_id.clone(),
                        story_name: story.story_name.clone(),
                        matched_text,
                        category: category_label.clone(),
                    });
                }
            }

            emit_search_progress(
                app,
                "线性扫描",
                (idx + 1).min(total),
                total.max(1),
                format!("已扫描 {} / {}", idx + 1, total),
            );

            if results.len() >= SEARCH_RESULT_LIMIT {
                break;
            }
        }

        Ok(results)
    }

    pub fn get_story_entry(&self, story_id: &str) -> Result<StoryEntry, String> {
        let stories = self.collect_stories_for_index()?;
        for indexed in stories {
            if indexed.story.story_id == story_id {
                return Ok(indexed.story);
            }
        }
        Err(format!("Story {} 不存在", story_id))
    }

    /// 提取匹配文本的上下文
    fn extract_context(&self, content: &str, query: &str) -> String {
        if content.is_empty() || query.is_empty() {
            return String::new();
        }

        let content_lower = normalize_nfkc_lower_strip_marks(content);

        if let Some(pos) = content_lower.find(query) {
            return Self::build_context_snippet(content, pos, query.len());
        }

        for token in query.split_whitespace().filter(|t| !t.is_empty()) {
            if let Some(pos) = content_lower.find(token) {
                return Self::build_context_snippet(content, pos, token.len());
            }
        }

        String::new()
    }

    fn build_context_snippet(content: &str, byte_start: usize, pattern_bytes: usize) -> String {
        let prefix = match content.get(..byte_start) {
            Some(slice) => slice,
            None => return String::new(),
        };

        let byte_end = byte_start.saturating_add(pattern_bytes).min(content.len());
        let matched_slice = match content.get(byte_start..byte_end) {
            Some(slice) => slice,
            None => "",
        };

        let start_char_index = prefix.chars().count();
        let matched_char_len = matched_slice.chars().count();

        let chars: Vec<char> = content.chars().collect();
        if chars.is_empty() {
            return String::new();
        }

        let window = 50usize;
        let snippet_start = start_char_index.saturating_sub(window);
        let snippet_end = (start_char_index + matched_char_len + window).min(chars.len());

        let snippet: String = chars[snippet_start..snippet_end].iter().collect();
        if snippet.is_empty() {
            return String::new();
        }

        format!("...{}...", snippet.trim())
    }

    pub fn get_main_stories_grouped(&self) -> Result<Vec<(String, Vec<StoryEntry>)>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let story_review_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/story_review_table.json");

        let content = fs::read_to_string(&story_review_file)
            .map_err(|e| format!("Failed to read story review file: {}", e))?;

        let data: HashMap<String, Value> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse story review data: {}", e))?;

        // 按分组ID收集主线剧情
        let mut groups: Vec<(String, String, Vec<StoryEntry>)> = Vec::new();

        for (id, value) in data.iter() {
            if let Some(et) = value.get("entryType").and_then(|v| v.as_str()) {
                if et == "MAINLINE" {
                    let group_name = value
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("未知章节");

                    if let Some(unlock_datas) =
                        value.get("infoUnlockDatas").and_then(|v| v.as_array())
                    {
                        let mut stories = Vec::new();
                        for unlock_data in unlock_datas {
                            if let Ok(story) =
                                serde_json::from_value::<StoryEntry>(unlock_data.clone())
                            {
                                stories.push(story);
                            }
                        }
                        stories.sort_by_key(|s| s.story_sort);
                        groups.push((id.clone(), group_name.to_string(), stories));
                    }
                }
            }
        }

        groups.sort_by(|a, b| compare_story_group_ids(&a.0, &b.0));

        Ok(groups
            .into_iter()
            .map(|(_, name, stories)| (name, stories))
            .collect())
    }

    pub fn get_activity_stories_grouped(&self) -> Result<Vec<(String, Vec<StoryEntry>)>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let story_review_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/story_review_table.json");

        let content = fs::read_to_string(&story_review_file)
            .map_err(|e| format!("Failed to read story review file: {}", e))?;

        let data: HashMap<String, Value> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse story review data: {}", e))?;

        let mut groups: Vec<(String, Vec<StoryEntry>, i64, String)> = Vec::new();

        for (_id, value) in data.iter() {
            if let Some(et) = value.get("entryType").and_then(|v| v.as_str()) {
                if et == "ACTIVITY" || et == "MINI_ACTIVITY" {
                    let activity_name = value
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("未知活动");

                    if let Some(unlock_datas) =
                        value.get("infoUnlockDatas").and_then(|v| v.as_array())
                    {
                        let mut stories = Vec::new();
                        for unlock_data in unlock_datas {
                            if let Ok(story) =
                                serde_json::from_value::<StoryEntry>(unlock_data.clone())
                            {
                                stories.push(story);
                            }
                        }

                        if !stories.is_empty() {
                            stories.sort_by_key(|s| s.story_sort);
                            let start_time = value
                                .get("startTime")
                                .and_then(|v| v.as_i64())
                                .unwrap_or(i64::MAX);
                            let normalized_start = if start_time <= 0 {
                                i64::MAX
                            } else {
                                start_time
                            };
                            let sort_id = value
                                .get("id")
                                .and_then(|v| v.as_str())
                                .unwrap_or_else(|| _id.as_str());

                            groups.push((
                                activity_name.to_string(),
                                stories,
                                normalized_start,
                                sort_id.to_string(),
                            ));
                        }
                    }
                }
            }
        }

        // 按活动开始时间排序（旧活动在前，时间缺失的放在末尾）
        groups.sort_by(|a, b| match a.2.cmp(&b.2) {
            Ordering::Equal => compare_story_group_ids(&a.3, &b.3),
            other => other,
        });

        Ok(groups
            .into_iter()
            .map(|(name, stories, _, _)| (name, stories))
            .collect())
    }

    pub fn get_sidestory_stories_grouped(&self) -> Result<Vec<(String, Vec<StoryEntry>)>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let story_review_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/story_review_table.json");

        let content = fs::read_to_string(&story_review_file)
            .map_err(|e| format!("Failed to read story review file: {}", e))?;

        let data: HashMap<String, Value> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse story review data: {}", e))?;

        let mut groups: Vec<(String, Vec<StoryEntry>, String)> = Vec::new();

        for (id, value) in data.iter() {
            let Some(entry_type) = value.get("entryType").and_then(|v| v.as_str()) else {
                continue;
            };
            let act_type = value.get("actType").and_then(|v| v.as_str()).unwrap_or("");
            // 支线=大型活动（ACTIVITY + ACTIVITY_STORY）
            if entry_type == "ACTIVITY" && act_type == "ACTIVITY_STORY" {
                let group_name = value
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("支线剧情");

                if let Some(unlock_datas) = value.get("infoUnlockDatas").and_then(|v| v.as_array())
                {
                    let mut stories = Vec::new();
                    for unlock_data in unlock_datas {
                        if let Ok(story) = serde_json::from_value::<StoryEntry>(unlock_data.clone())
                        {
                            stories.push(story);
                        }
                    }
                    if !stories.is_empty() {
                        stories.sort_by_key(|s| s.story_sort);
                        groups.push((group_name.to_string(), stories, id.clone()));
                    }
                }
            }
        }

        groups.sort_by(|a, b| compare_story_group_ids(&a.2, &b.2));
        Ok(groups
            .into_iter()
            .map(|(name, stories, _)| (name, stories))
            .collect())
    }

    pub fn get_roguelike_stories_grouped(&self) -> Result<Vec<(String, Vec<StoryEntry>)>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        // 首先读取 meta，提取 contentPath -> desc 映射（用于更友好的命名）
        let meta_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/story_review_meta_table.json");
        let meta_content = fs::read_to_string(&meta_file)
            .map_err(|e| format!("Failed to read story review meta file: {}", e))?;
        let meta_value: Value = serde_json::from_str(&meta_content)
            .map_err(|e| format!("Failed to parse story review meta data: {}", e))?;

        let mut path_desc_map: HashMap<String, String> = HashMap::new();

        // 从 meta 中收集 contentPath 映射
        fn collect_content_paths(map: &mut HashMap<String, String>, val: &Value) {
            match val {
                Value::Object(obj) => {
                    if let Some(cp) = obj.get("contentPath").and_then(|x| x.as_str()) {
                        let lower = cp.to_ascii_lowercase();
                        if lower.starts_with("obt/roguelike/") || lower.starts_with("obt/rogue/") {
                            let desc = obj
                                .get("desc")
                                .and_then(|x| x.as_str())
                                .or_else(|| obj.get("name").and_then(|x| x.as_str()))
                                .or_else(|| obj.get("rawBrief").and_then(|x| x.as_str()))
                                .unwrap_or("")
                                .trim()
                                .to_string();
                            if !desc.is_empty() {
                                map.insert(lower, desc);
                            }
                        }
                    }
                    for v in obj.values() {
                        collect_content_paths(map, v);
                    }
                }
                Value::Array(arr) => {
                    for v in arr {
                        collect_content_paths(map, v);
                    }
                }
                _ => {}
            }
        }
        collect_content_paths(&mut path_desc_map, &meta_value);

        // 1. 使用 story_table 作为权威来源，枚举所有 Obt/Roguelike 文本（ro1~ro5的关卡剧情）
        let story_table_file = self.data_dir.join("zh_CN/gamedata/excel/story_table.json");
        let story_table_content = fs::read_to_string(&story_table_file)
            .map_err(|e| format!("Failed to read story table file: {}", e))?;
        let table_obj: HashMap<String, Value> = serde_json::from_str(&story_table_content)
            .map_err(|e| format!("Failed to parse story table: {}", e))?;

        // 2. 使用 roguelike_topic_table 获取 Obt/Rogue 下的剧情（月度聊天、终章、挑战等）
        let roguelike_topic_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/roguelike_topic_table.json");
        let roguelike_topic_content = fs::read_to_string(&roguelike_topic_file)
            .map_err(|e| format!("Failed to read roguelike topic file: {}", e))?;
        let roguelike_topic_value: Value = serde_json::from_str(&roguelike_topic_content)
            .map_err(|e| format!("Failed to parse roguelike topic data: {}", e))?;

        let mut grouped: HashMap<String, Vec<StoryEntry>> = HashMap::new();
        let mut counters: HashMap<String, i32> = HashMap::new();

        // Helper: 递归提取所有包含剧情路径的字段，同时提取友好标题
        fn extract_story_data_from_value(
            val: &Value,
            story_data: &mut Vec<(String, Option<String>)>,
            path_desc_map: &mut HashMap<String, String>,
        ) {
            match val {
                Value::Object(obj) => {
                    // 检查是否包含 textId/chatStoryId/avgId 等剧情路径字段
                    let mut story_path: Option<String> = None;
                    let mut title: Option<String> = None;

                    if let Some(text_id) = obj.get("textId").and_then(|v| v.as_str()) {
                        story_path = Some(text_id.to_string());
                    } else if let Some(chat_id) = obj.get("chatStoryId").and_then(|v| v.as_str()) {
                        story_path = Some(chat_id.to_string());
                    } else if let Some(chat_id) = obj.get("chatId").and_then(|v| v.as_str()) {
                        story_path = Some(chat_id.to_string());
                    } else if let Some(avg_id) = obj.get("avgId").and_then(|v| v.as_str()) {
                        story_path = Some(avg_id.to_string());
                    }

                    // 提取标题
                    if let Some(name) = obj.get("endbookName").and_then(|v| v.as_str()) {
                        title = Some(name.to_string());
                    } else if let Some(name) = obj.get("teamName").and_then(|v| v.as_str()) {
                        title = Some(name.to_string());
                    } else if let Some(name) = obj.get("chatDesc").and_then(|v| v.as_str()) {
                        title = Some(name.to_string());
                    } else if let Some(name) = obj.get("title").and_then(|v| v.as_str()) {
                        title = Some(name.to_string());
                    }

                    if let Some(path) = story_path {
                        let lower = path.to_ascii_lowercase();
                        if lower.starts_with("obt/rogue/")
                            || lower.starts_with("obt/roguelike/")
                            || lower.starts_with("month_chat_rogue_")
                        {
                            story_data.push((path.clone(), title.clone()));
                            // 同时更新映射表
                            if let Some(t) = &title {
                                if !t.is_empty() && !t.trim().is_empty() {
                                    path_desc_map.insert(lower.clone(), t.clone());
                                }
                            }
                        }
                    }

                    // 继续递归
                    for v in obj.values() {
                        extract_story_data_from_value(v, story_data, path_desc_map);
                    }
                }
                Value::Array(arr) => {
                    for v in arr {
                        extract_story_data_from_value(v, story_data, path_desc_map);
                    }
                }
                _ => {}
            }
        }

        // 从 roguelike_topic_table 中提取剧情数据
        let mut roguelike_story_data = Vec::new();
        extract_story_data_from_value(
            &roguelike_topic_value,
            &mut roguelike_story_data,
            &mut path_desc_map,
        );

        // 辅助函数：为给定路径查找最佳匹配的标题
        // 例如 "obt/rogue/month_chat_rogue_1_1/month_chat_rogue_1_1_1.txt"
        // 应该能找到 "month_chat_rogue_1_1" 的标题
        let find_title_for_path = |path: &str, map: &HashMap<String, String>| -> Option<String> {
            let lower = path.to_ascii_lowercase();

            // 首先尝试精确匹配
            if let Some(title) = map.get(&lower) {
                return Some(title.clone());
            }

            // 对于 month_chat 类型的路径，尝试查找父级标题
            // 例如 "obt/rogue/month_chat_rogue_1_1/month_chat_rogue_1_1_1.txt" -> "month_chat_rogue_1_1"
            if lower.contains("month_chat_rogue_") {
                let parts: Vec<&str> = lower.split('/').collect();
                if parts.len() >= 3 {
                    let parent_id = parts[2]; // month_chat_rogue_1_1
                    if let Some(title) = map.get(parent_id) {
                        return Some(title.clone());
                    }
                }
            }

            None
        };

        // 处理 story_table 中的条目
        for (key, _v) in table_obj.into_iter() {
            let lower = key.to_ascii_lowercase();
            // 支持两个肉鸽目录：obt/roguelike/ 和 obt/rogue/
            if !lower.starts_with("obt/roguelike/") && !lower.starts_with("obt/rogue/") {
                continue;
            }

            // 跳过月度聊天的分片文件（这些会在后面的文件系统扫描中作为合并条目添加）
            if lower.contains("/month_chat_rogue_") {
                continue;
            }

            // 智能提取分组键
            // obt/roguelike/ro1/... -> RO1
            // obt/rogue/month_chat_rogue_1_1/... -> MONTH_CHAT_ROGUE_1
            // obt/rogue/rogue_2/endbook/... -> ROGUE_2
            let group_key = if lower.starts_with("obt/roguelike/") {
                // roguelike 目录：使用第三段作为分组键
                lower
                    .split('/')
                    .nth(2)
                    .map(|s| s.to_uppercase())
                    .unwrap_or_else(|| "ROGUE".to_string())
            } else {
                // rogue 目录：需要特殊处理多层结构
                let parts: Vec<&str> = lower.split('/').collect();
                if parts.len() >= 3 {
                    let third_part = parts[2];
                    // month_chat_rogue_1_1 -> MONTH_CHAT_ROGUE_1
                    if third_part.starts_with("month_chat_rogue_") {
                        // 提取到倒数第二个下划线之前
                        let prefix = third_part.rsplitn(2, '_').nth(1).unwrap_or(third_part);
                        prefix.to_uppercase()
                    } else if third_part.starts_with("rogue_") {
                        // rogue_2, rogue_3, ... -> ROGUE_2, ROGUE_3, ...
                        third_part.to_uppercase()
                    } else {
                        third_part.to_uppercase()
                    }
                } else {
                    "ROGUE".to_string()
                }
            };

            let sort = counters
                .entry(group_key.clone())
                .and_modify(|x| *x += 1)
                .or_insert(1);
            let name = find_title_for_path(&key, &path_desc_map).unwrap_or_else(|| {
                // 取最后一段作为兜底标题
                key.split('/').last().unwrap_or(&key).to_string()
            });

            let entry = StoryEntry {
                story_id: key.clone(),
                story_name: name,
                story_code: None,
                story_group: group_key.clone(),
                story_sort: *sort,
                avg_tag: None,
                story_txt: lower.clone(),
                story_info: None,
                story_review_type: "ROGUELIKE".to_string(),
                unlock_type: "NONE".to_string(),
                story_dependence: None,
                story_can_show: None,
                story_can_enter: None,
                stage_count: None,
                required_stages: None,
                cost_item_type: None,
                cost_item_id: None,
                cost_item_count: None,
            };

            grouped.entry(group_key).or_default().push(entry);
        }

        // 处理 roguelike_topic_table 中提取的剧情数据
        for (story_id, explicit_title) in roguelike_story_data {
            let lower = story_id.to_ascii_lowercase();

            // 跳过月度聊天的分片文件（这些会在后面的文件系统扫描中作为合并条目添加）
            if lower.contains("/month_chat_rogue_") || lower.starts_with("month_chat_rogue_") {
                continue;
            }

            // 智能提取分组键（同样的逻辑）
            let group_key = if lower.starts_with("obt/roguelike/") {
                lower
                    .split('/')
                    .nth(2)
                    .map(|s| s.to_uppercase())
                    .unwrap_or_else(|| "ROGUE".to_string())
            } else {
                let parts: Vec<&str> = lower.split('/').collect();
                if parts.len() >= 3 {
                    let third_part = parts[2];
                    if third_part.starts_with("month_chat_rogue_") {
                        let prefix = third_part.rsplitn(2, '_').nth(1).unwrap_or(third_part);
                        prefix.to_uppercase()
                    } else if third_part.starts_with("rogue_") {
                        third_part.to_uppercase()
                    } else {
                        third_part.to_uppercase()
                    }
                } else {
                    "ROGUE".to_string()
                }
            };

            let sort = counters
                .entry(group_key.clone())
                .and_modify(|x| *x += 1)
                .or_insert(1);

            // 优先使用显式标题，否则查找映射（包括父级标题），最后回退到文件名
            let name = explicit_title
                .filter(|s| !s.trim().is_empty())
                .or_else(|| find_title_for_path(&story_id, &path_desc_map))
                .unwrap_or_else(|| story_id.split('/').last().unwrap_or(&story_id).to_string());

            let entry = StoryEntry {
                story_id: story_id.clone(),
                story_name: name,
                story_code: None,
                story_group: group_key.clone(),
                story_sort: *sort,
                avg_tag: None,
                story_txt: lower.clone(),
                story_info: None,
                story_review_type: "ROGUELIKE".to_string(),
                unlock_type: "NONE".to_string(),
                story_dependence: None,
                story_can_show: None,
                story_can_enter: None,
                stage_count: None,
                required_stages: None,
                cost_item_type: None,
                cost_item_id: None,
                cost_item_count: None,
            };

            grouped.entry(group_key).or_default().push(entry);
        }

        // 扫描文件系统中的月度聊天文件（不在 story_table 中）
        // 月度聊天通常分成多个部分，需要合并成一个条目
        let rogue_dir = self.data_dir.join("zh_CN/gamedata/story/obt/rogue");
        if rogue_dir.exists() {
            if let Ok(entries) = fs::read_dir(&rogue_dir) {
                for entry in entries.flatten() {
                    let dir_name = entry.file_name().to_string_lossy().to_string();
                    if !dir_name.starts_with("month_chat_rogue_") {
                        continue;
                    }

                    // 收集该目录下的所有 .txt 文件并排序
                    let mut story_files = Vec::new();
                    if let Ok(files) = fs::read_dir(entry.path()) {
                        for story_file in files.flatten() {
                            let file_name = story_file.file_name().to_string_lossy().to_string();
                            if file_name.ends_with(".txt") {
                                story_files.push(file_name);
                            }
                        }
                    }

                    // 排序文件（按 _1, _2, _3 等顺序）
                    story_files.sort();

                    if story_files.is_empty() {
                        continue;
                    }

                    // 使用第一个文件构造基础路径来查找标题
                    let base_story_id = format!(
                        "Obt/Rogue/{}/{}",
                        dir_name,
                        story_files[0].trim_end_matches(".txt")
                    );

                    // 提取分组键
                    let group_key = {
                        let prefix = dir_name.rsplitn(2, '_').nth(1).unwrap_or(&dir_name);
                        prefix.to_uppercase()
                    };

                    let sort = counters
                        .entry(group_key.clone())
                        .and_modify(|x| *x += 1)
                        .or_insert(1);

                    // 查找标题（使用目录名或第一个文件）
                    let name = find_title_for_path(&base_story_id, &path_desc_map)
                        .unwrap_or_else(|| dir_name.clone());

                    // 创建一个合并的 story_id，包含所有部分
                    // 格式：Obt/Rogue/month_chat_rogue_1_1 (将在读取时自动拼接所有部分)
                    let merged_story_id = format!("Obt/Rogue/{}", dir_name);
                    let lower = merged_story_id.to_ascii_lowercase();

                    let entry = StoryEntry {
                        story_id: merged_story_id.clone(),
                        story_name: name,
                        story_code: None,
                        story_group: group_key.clone(),
                        story_sort: *sort,
                        avg_tag: None,
                        story_txt: lower.clone(),
                        story_info: None,
                        story_review_type: "ROGUELIKE".to_string(),
                        unlock_type: "NONE".to_string(),
                        story_dependence: None,
                        story_can_show: None,
                        story_can_enter: None,
                        stage_count: None,
                        required_stages: None,
                        cost_item_type: None,
                        cost_item_id: None,
                        cost_item_count: None,
                    };

                    grouped.entry(group_key).or_default().push(entry);
                }
            }
        }

        let mut out: Vec<(String, Vec<StoryEntry>)> = grouped
            .into_iter()
            .map(|(name, mut stories)| {
                stories.sort_by_key(|e| e.story_sort);
                (name, stories)
            })
            .collect();
        out.sort_by(|a, b| compare_story_group_ids(&a.0, &b.0));
        Ok(out)
    }

    pub fn get_memory_stories(&self) -> Result<Vec<StoryEntry>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let story_review_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/story_review_table.json");

        let content = fs::read_to_string(&story_review_file)
            .map_err(|e| format!("Failed to read story review file: {}", e))?;

        let data: HashMap<String, Value> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse story review data: {}", e))?;

        let stories = self.parse_stories_by_entry_type(&data, "NONE")?;
        Ok(stories)
    }

    /// 获取主线笔记剧情（按章节分组）
    pub fn get_record_stories_grouped(&self) -> Result<Vec<(String, Vec<StoryEntry>)>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let zone_table_file = self.data_dir.join("zh_CN/gamedata/excel/zone_table.json");

        let content = fs::read_to_string(&zone_table_file)
            .map_err(|e| format!("Failed to read zone table file: {}", e))?;

        let data: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse zone table data: {}", e))?;

        // 获取章节信息
        let zones = data
            .get("zones")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "zones not found in zone_table".to_string())?;

        // 获取笔记信息
        let zone_records = data
            .get("zoneRecordGroupedData")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "zoneRecordGroupedData not found in zone_table".to_string())?;

        let mut groups: Vec<(String, Vec<StoryEntry>, String)> = Vec::new();

        for (zone_id, zone_record_value) in zone_records.iter() {
            // 只处理主线章节的笔记
            if !zone_id.starts_with("main_") {
                continue;
            }

            let empty_vec = vec![];
            let records = zone_record_value
                .get("records")
                .and_then(|v| v.as_array())
                .unwrap_or(&empty_vec);

            if records.is_empty() {
                continue;
            }

            // 获取章节名称
            let chapter_name = zones
                .get(zone_id)
                .and_then(|z| {
                    let first = z
                        .get("zoneNameFirst")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let second = z
                        .get("zoneNameSecond")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if first.is_empty() && second.is_empty() {
                        None
                    } else if second.is_empty() {
                        Some(first.to_string())
                    } else {
                        Some(format!("{} {}", first, second))
                    }
                })
                .unwrap_or_else(|| zone_id.to_uppercase());

            let mut stories = Vec::new();
            for (idx, record) in records.iter().enumerate() {
                let record_id = record
                    .get("recordId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let title_name = record
                    .get("recordTitleName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                // 从 rewards 中找到包含 textPath 的条目
                if let Some(rewards) = record.get("rewards").and_then(|v| v.as_array()) {
                    for reward in rewards {
                        if let Some(text_path) = reward
                            .get("textPath")
                            .and_then(|v| v.as_str())
                            .filter(|s| !s.is_empty())
                        {
                            let story_name = if title_name.is_empty() {
                                format!("笔记 {}", idx + 1)
                            } else {
                                format!("笔记 {}", title_name)
                            };

                            // 转换路径：Obt/Record/... -> obt/record/...
                            let normalized_path = text_path.replace('\\', "/").to_ascii_lowercase();

                            let entry = StoryEntry {
                                story_id: format!("{}_{}", zone_id, record_id),
                                story_name,
                                story_code: None,
                                story_group: zone_id.to_string(),
                                story_sort: idx as i32 + 1,
                                avg_tag: Some("笔记".to_string()),
                                story_txt: normalized_path,
                                story_info: None,
                                story_review_type: "RECORD".to_string(),
                                unlock_type: "NONE".to_string(),
                                story_dependence: None,
                                story_can_show: None,
                                story_can_enter: None,
                                stage_count: None,
                                required_stages: None,
                                cost_item_type: None,
                                cost_item_id: None,
                                cost_item_count: None,
                            };
                            stories.push(entry);
                            break; // 只取第一个有效的 textPath
                        }
                    }
                }
            }

            if !stories.is_empty() {
                groups.push((chapter_name, stories, zone_id.clone()));
            }
        }

        // 按 zone_id 排序
        groups.sort_by(|a, b| compare_story_group_ids(&a.2, &b.2));

        Ok(groups
            .into_iter()
            .map(|(name, stories, _)| (name, stories))
            .collect())
    }

    /// 获取危机合约剧情
    pub fn get_rune_stories(&self) -> Result<Vec<StoryEntry>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let rune_dir = self.data_dir.join("zh_CN/gamedata/story/obt/rune");
        if !rune_dir.exists() {
            return Ok(Vec::new());
        }

        let mut stories = Vec::new();

        // 扫描 rune 目录
        let entries =
            fs::read_dir(&rune_dir).map_err(|e| format!("Failed to read rune directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();

            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("txt") {
                let file_name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown");

                let story_name = if file_name.contains("overall") {
                    "危机合约 - 序章".to_string()
                } else {
                    format!("危机合约 - {}", file_name.replace('_', " "))
                };

                let story_txt = format!(
                    "obt/rune/{}",
                    path.file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or(file_name)
                )
                .replace(".txt", "");

                stories.push(StoryEntry {
                    story_id: format!("rune_{}", file_name),
                    story_name,
                    story_code: None,
                    story_group: "rune".to_string(),
                    story_sort: stories.len() as i32 + 1,
                    avg_tag: Some("危机合约".to_string()),
                    story_txt,
                    story_info: None,
                    story_review_type: "RUNE".to_string(),
                    unlock_type: "NONE".to_string(),
                    story_dependence: None,
                    story_can_show: None,
                    story_can_enter: None,
                    stage_count: None,
                    required_stages: None,
                    cost_item_type: None,
                    cost_item_id: None,
                    cost_item_count: None,
                });
            } else if path.is_dir() {
                // 扫描子目录
                let sub_entries = fs::read_dir(&path)
                    .map_err(|e| format!("Failed to read rune subdirectory: {}", e))?;

                for sub_entry in sub_entries {
                    let sub_entry =
                        sub_entry.map_err(|e| format!("Failed to read entry: {}", e))?;
                    let sub_path = sub_entry.path();

                    if sub_path.is_file()
                        && sub_path.extension().and_then(|s| s.to_str()) == Some("txt")
                    {
                        let file_name = sub_path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("unknown");

                        let folder_name = path
                            .file_name()
                            .and_then(|s| s.to_str())
                            .unwrap_or("unknown");

                        let story_name = format!("危机合约 - {} - {}", folder_name, file_name);

                        let story_txt = format!(
                            "obt/rune/{}/{}",
                            folder_name,
                            sub_path
                                .file_name()
                                .and_then(|s| s.to_str())
                                .unwrap_or(file_name)
                        )
                        .replace(".txt", "");

                        stories.push(StoryEntry {
                            story_id: format!("rune_{}_{}", folder_name, file_name),
                            story_name,
                            story_code: None,
                            story_group: "rune".to_string(),
                            story_sort: stories.len() as i32 + 1,
                            avg_tag: Some("危机合约".to_string()),
                            story_txt,
                            story_info: None,
                            story_review_type: "RUNE".to_string(),
                            unlock_type: "NONE".to_string(),
                            story_dependence: None,
                            story_can_show: None,
                            story_can_enter: None,
                            stage_count: None,
                            required_stages: None,
                            cost_item_type: None,
                            cost_item_id: None,
                            cost_item_count: None,
                        });
                    }
                }
            }
        }

        stories.sort_by_key(|s| s.story_sort);
        Ok(stories)
    }

    /// 获取所有干员基础信息
    pub fn get_characters_list(&self) -> Result<Vec<CharacterBasicInfo>, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let character_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/character_table.json");

        let content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;

        let data: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;

        let mut characters = Vec::new();

        if let Some(obj) = data.as_object() {
            for (char_id, char_data) in obj.iter() {
                // 跳过非干员条目
                if !char_id.starts_with("char_") {
                    continue;
                }

                let name = char_data
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                // 跳过空名字的（通常是测试数据）
                if name.is_empty() || name == "Unknown" {
                    continue;
                }

                // 解析稀有度：TIER_1 -> 0, TIER_2 -> 1, ..., TIER_6 -> 5
                let rarity = char_data
                    .get("rarity")
                    .and_then(|v| v.as_str())
                    .and_then(|s| {
                        if let Some(tier) = s.strip_prefix("TIER_") {
                            tier.parse::<i32>().ok().map(|t| t - 1)
                        } else {
                            None
                        }
                    })
                    .unwrap_or(0);

                let tag_list: Vec<String> = char_data
                    .get("tagList")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();

                let character = CharacterBasicInfo {
                    char_id: char_id.clone(),
                    name,
                    appellation: char_data
                        .get("appellation")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    rarity,
                    profession: char_data
                        .get("profession")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    sub_profession_id: char_data
                        .get("subProfessionId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    sub_profession_name: None, // Will be filled later if needed
                    position: char_data
                        .get("position")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    nation_id: char_data
                        .get("nationId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    group_id: char_data
                        .get("groupId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    team_id: char_data
                        .get("teamId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    item_desc: char_data
                        .get("itemDesc")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    item_usage: char_data
                        .get("itemUsage")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    description: char_data
                        .get("description")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    tag_list,
                };

                characters.push(character);
            }
        }

        // 按稀有度和名字排序
        characters.sort_by(|a, b| b.rarity.cmp(&a.rarity).then_with(|| a.name.cmp(&b.name)));

        Ok(characters)
    }

    /// 获取指定干员的档案
    pub fn get_character_handbook(&self, char_id: &str) -> Result<CharacterHandbook, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let handbook_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/handbook_info_table.json");

        let content = fs::read_to_string(&handbook_file)
            .map_err(|e| format!("Failed to read handbook table: {}", e))?;

        let data: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse handbook table: {}", e))?;

        let handbook_dict = data
            .get("handbookDict")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "handbookDict not found".to_string())?;

        let char_data = handbook_dict
            .get(char_id)
            .ok_or_else(|| format!("Character {} not found in handbook", char_id))?;

        // 获取干员名字
        let character_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/character_table.json");
        let char_content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;
        let char_table: Value = serde_json::from_str(&char_content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;

        let char_name = char_table
            .get(char_id)
            .and_then(|v| v.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let rarity = char_table
            .get(char_id)
            .and_then(|v| v.get("rarity"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;

        let profession = char_table
            .get(char_id)
            .and_then(|v| v.get("profession"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let sub_profession = char_table
            .get(char_id)
            .and_then(|v| v.get("subProfessionId"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let story_sections: Vec<HandbookStorySection> = char_data
            .get("storyTextAudio")
            .and_then(|v| v.as_array())
            .map(|sections| {
                sections
                    .iter()
                    .filter_map(|section| {
                        let title = section
                            .get("storyTitle")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        let stories: Vec<HandbookStory> = section
                            .get("stories")
                            .and_then(|v| v.as_array())
                            .map(|stories_arr| {
                                stories_arr
                                    .iter()
                                    .filter_map(|story| {
                                        Some(HandbookStory {
                                            story_text: story
                                                .get("storyText")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("")
                                                .to_string(),
                                            unlock_type: story
                                                .get("unLockType")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("DIRECT")
                                                .to_string(),
                                            unlock_param: story
                                                .get("unLockParam")
                                                .and_then(|v| v.as_str())
                                                .map(|s| s.to_string())
                                                .or_else(|| {
                                                    story.get("unLockParam").and_then(|v| {
                                                        v.as_i64().map(|i| i.to_string())
                                                    })
                                                })
                                                .unwrap_or_default(),
                                        })
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();

                        if title.is_empty() || stories.is_empty() {
                            None
                        } else {
                            Some(HandbookStorySection {
                                story_title: title,
                                stories,
                            })
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(CharacterHandbook {
            char_id: char_id.to_string(),
            char_name,
            rarity,
            profession,
            sub_profession,
            story_sections,
        })
    }

    /// 获取指定干员的语音
    pub fn get_character_voices(&self, char_id: &str) -> Result<CharacterVoice, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let charword_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/charword_table.json");

        let content = fs::read_to_string(&charword_file)
            .map_err(|e| format!("Failed to read charword table: {}", e))?;

        let data: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse charword table: {}", e))?;

        let char_words = data
            .get("charWords")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "charWords not found".to_string())?;

        // 获取干员名字
        let character_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/character_table.json");
        let char_content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;
        let char_table: Value = serde_json::from_str(&char_content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;

        let char_name = char_table
            .get(char_id)
            .and_then(|v| v.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let mut voices = Vec::new();

        for (_, voice_data) in char_words.iter() {
            if let Some(voice_char_id) = voice_data.get("charId").and_then(|v| v.as_str()) {
                if voice_char_id == char_id {
                    let voice = VoiceLine {
                        voice_id: voice_data
                            .get("voiceId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        voice_title: voice_data
                            .get("voiceTitle")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        voice_text: voice_data
                            .get("voiceText")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        voice_index: voice_data
                            .get("voiceIndex")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0) as i32,
                        unlock_type: voice_data
                            .get("unlockType")
                            .and_then(|v| v.as_str())
                            .unwrap_or("DIRECT")
                            .to_string(),
                    };
                    voices.push(voice);
                }
            }
        }

        voices.sort_by_key(|v| v.voice_index);

        Ok(CharacterVoice {
            char_id: char_id.to_string(),
            char_name,
            voices,
        })
    }

    /// 获取干员模组信息
    pub fn get_character_equipment(&self, char_id: &str) -> Result<CharacterEquipment, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let uniequip_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/uniequip_table.json");

        let content = fs::read_to_string(&uniequip_file)
            .map_err(|e| format!("Failed to read uniequip table: {}", e))?;

        let data: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse uniequip table: {}", e))?;

        // 获取干员的模组列表
        let char_equip = data
            .get("charEquip")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "charEquip not found".to_string())?;

        let equip_dict = data
            .get("equipDict")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "equipDict not found".to_string())?;

        // 获取干员名字
        let character_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/character_table.json");
        let char_content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;
        let char_table: Value = serde_json::from_str(&char_content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;

        let char_name = char_table
            .get(char_id)
            .and_then(|v| v.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let mut equipments = Vec::new();

        // 获取该干员的所有模组ID
        if let Some(equip_ids) = char_equip.get(char_id).and_then(|v| v.as_array()) {
            for equip_id_value in equip_ids {
                if let Some(equip_id) = equip_id_value.as_str() {
                    // 获取模组详细信息
                    if let Some(equip_data) = equip_dict.get(equip_id) {
                        let equipment = EquipmentInfo {
                            equip_id: equip_id.to_string(),
                            equip_name: equip_data
                                .get("uniEquipName")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            equip_desc: equip_data
                                .get("uniEquipDesc")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            equip_shining_color: equip_data
                                .get("equipShiningColor")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            type_name: equip_data
                                .get("typeName")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        };
                        equipments.push(equipment);
                    }
                }
            }
        }

        Ok(CharacterEquipment {
            char_id: char_id.to_string(),
            char_name,
            equipments,
        })
    }

    /// 获取干员潜能信物
    pub fn get_character_potential_token(
        &self,
        char_id: &str,
    ) -> Result<CharacterPotentialToken, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let item_file = self.data_dir.join("zh_CN/gamedata/excel/item_table.json");
        let content = fs::read_to_string(&item_file)
            .map_err(|e| format!("Failed to read item table: {}", e))?;
        let data: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse item table: {}", e))?;

        let items = data
            .get("items")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "items not found".to_string())?;

        // 潜能信物ID格式：p_char_{char_id}
        let token_id = format!("p_{}", char_id);
        let token_data = items
            .get(&token_id)
            .ok_or_else(|| format!("Potential token not found for character {}", char_id))?;

        // 获取干员名字
        let character_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/character_table.json");
        let char_content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;
        let char_table: Value = serde_json::from_str(&char_content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;

        let char_name = char_table
            .get(char_id)
            .and_then(|v| v.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        Ok(CharacterPotentialToken {
            char_id: char_id.to_string(),
            char_name,
            item_id: token_id,
            token_name: token_data
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            token_desc: token_data
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            token_usage: token_data
                .get("usage")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            rarity: token_data
                .get("rarity")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            obtain_approach: token_data
                .get("obtainApproach")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
    }

    /// 获取干员天赋
    pub fn get_character_talents(&self, char_id: &str) -> Result<CharacterTalents, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let character_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/character_table.json");
        let content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;
        let data: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;

        let char_data = data
            .get(char_id)
            .ok_or_else(|| format!("Character {} not found", char_id))?;

        let char_name = char_data
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let talents: Vec<TalentInfo> = char_data
            .get("talents")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .enumerate()
                    .filter_map(|(idx, talent)| {
                        let candidates: Vec<TalentCandidate> = talent
                            .get("candidates")
                            .and_then(|v| v.as_array())
                            .map(|cands| {
                                cands
                                    .iter()
                                    .filter_map(|cand| {
                                        Some(TalentCandidate {
                                            unlock_condition: TalentUnlockCondition {
                                                phase: cand
                                                    .get("unlockCondition")
                                                    .and_then(|v| v.get("phase"))
                                                    .and_then(|v| v.as_str())
                                                    .unwrap_or("PHASE_0")
                                                    .to_string(),
                                                level: cand
                                                    .get("unlockCondition")
                                                    .and_then(|v| v.get("level"))
                                                    .and_then(|v| v.as_i64())
                                                    .unwrap_or(1)
                                                    as i32,
                                            },
                                            name: cand
                                                .get("name")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("")
                                                .to_string(),
                                            description: cand
                                                .get("description")
                                                .and_then(|v| v.as_str())
                                                .map(|s| s.to_string()),
                                            range_description: cand
                                                .get("rangeDescription")
                                                .and_then(|v| v.as_str())
                                                .map(|s| s.to_string()),
                                        })
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();

                        if candidates.is_empty() {
                            None
                        } else {
                            Some(TalentInfo {
                                talent_index: idx as i32,
                                candidates,
                            })
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(CharacterTalents {
            char_id: char_id.to_string(),
            char_name,
            talents,
        })
    }

    /// 获取干员特性
    pub fn get_character_trait(&self, char_id: &str) -> Result<CharacterTrait, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let character_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/character_table.json");
        let content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;
        let data: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;

        let char_data = data
            .get(char_id)
            .ok_or_else(|| format!("Character {} not found", char_id))?;

        let char_name = char_data
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let trait_info = char_data.get("trait").and_then(|trait_data| {
            let candidates: Vec<TraitCandidate> = trait_data
                .get("candidates")
                .and_then(|v| v.as_array())
                .map(|cands| {
                    cands
                        .iter()
                        .filter_map(|cand| {
                            Some(TraitCandidate {
                                unlock_condition: TraitUnlockCondition {
                                    phase: cand
                                        .get("unlockCondition")
                                        .and_then(|v| v.get("phase"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("PHASE_0")
                                        .to_string(),
                                    level: cand
                                        .get("unlockCondition")
                                        .and_then(|v| v.get("level"))
                                        .and_then(|v| v.as_i64())
                                        .unwrap_or(1) as i32,
                                },
                                override_descripton: cand
                                    .get("overrideDescripton")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string()),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            if candidates.is_empty() {
                None
            } else {
                Some(TraitInfo { candidates })
            }
        });

        Ok(CharacterTrait {
            char_id: char_id.to_string(),
            char_name,
            trait_info,
        })
    }

    /// 获取干员潜能加成
    pub fn get_character_potential_ranks(
        &self,
        char_id: &str,
    ) -> Result<CharacterPotentialRanks, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let character_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/character_table.json");
        let content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;
        let data: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;

        let char_data = data
            .get(char_id)
            .ok_or_else(|| format!("Character {} not found", char_id))?;

        let char_name = char_data
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let potential_ranks: Vec<PotentialRank> = char_data
            .get("potentialRanks")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .enumerate()
                    .filter_map(|(idx, rank)| {
                        Some(PotentialRank {
                            rank: idx as i32,
                            description: rank
                                .get("description")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(CharacterPotentialRanks {
            char_id: char_id.to_string(),
            char_name,
            potential_ranks,
        })
    }

    /// 获取干员技能
    pub fn get_character_skills(&self, char_id: &str) -> Result<CharacterSkills, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        // 读取character_table获取技能ID列表
        let character_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/character_table.json");
        let char_content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;
        let char_table: Value = serde_json::from_str(&char_content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;

        let char_data = char_table
            .get(char_id)
            .ok_or_else(|| format!("Character {} not found", char_id))?;

        let char_name = char_data
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // 读取skill_table获取技能详情
        let skill_file = self.data_dir.join("zh_CN/gamedata/excel/skill_table.json");
        let skill_content = fs::read_to_string(&skill_file)
            .map_err(|e| format!("Failed to read skill table: {}", e))?;
        let skill_table: Value = serde_json::from_str(&skill_content)
            .map_err(|e| format!("Failed to parse skill table: {}", e))?;

        let mut skills = Vec::new();

        if let Some(skill_arr) = char_data.get("skills").and_then(|v| v.as_array()) {
            for skill_ref in skill_arr {
                if let Some(skill_id) = skill_ref.get("skillId").and_then(|v| v.as_str()) {
                    if let Some(skill_data) = skill_table.get(skill_id) {
                        let levels: Vec<SkillLevel> = skill_data
                            .get("levels")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .enumerate()
                                    .filter_map(|(idx, level)| {
                                        let sp_data = level.get("spData")?;
                                        let blackboard: Vec<BlackboardValue> = level.get("blackboard")
                                            .and_then(|v| v.as_array())
                                            .map(|bb| {
                                                bb.iter().filter_map(|item| {
                                                    Some(BlackboardValue {
                                                        key: item.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                                        value: item.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32,
                                                    })
                                                }).collect()
                                            })
                                            .unwrap_or_default();
                                        Some(SkillLevel {
                                            level: (idx + 1) as i32,
                                            name: level
                                                .get("name")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("")
                                                .to_string(),
                                            description: level
                                                .get("description")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("")
                                                .to_string(),
                                            skill_type: level
                                                .get("skillType")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("")
                                                .to_string(),
                                            duration_type: level
                                                .get("durationType")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("")
                                                .to_string(),
                                            sp_data: SkillSPData {
                                                sp_type: sp_data
                                                    .get("spType")
                                                    .and_then(|v| v.as_str())
                                                    .unwrap_or("")
                                                    .to_string(),
                                                sp_cost: sp_data
                                                    .get("spCost")
                                                    .and_then(|v| v.as_i64())
                                                    .unwrap_or(0)
                                                    as i32,
                                                init_sp: sp_data
                                                    .get("initSp")
                                                    .and_then(|v| v.as_i64())
                                                    .unwrap_or(0)
                                                    as i32,
                                            },
                                            duration: level
                                                .get("duration")
                                                .and_then(|v| v.as_f64())
                                                .unwrap_or(0.0)
                                                as f32,
                                            blackboard,
                                        })
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();

                        if !levels.is_empty() {
                            skills.push(SkillInfo {
                                skill_id: skill_id.to_string(),
                                icon_id: skill_data
                                    .get("iconId")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string()),
                                levels,
                            });
                        }
                    }
                }
            }
        }

        Ok(CharacterSkills {
            char_id: char_id.to_string(),
            char_name,
            skills,
        })
    }

    /// 获取干员皮肤
    pub fn get_character_skins(&self, char_id: &str) -> Result<CharacterSkins, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        // 读取character_table获取干员名字
        let character_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/character_table.json");
        let char_content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;
        let char_table: Value = serde_json::from_str(&char_content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;

        let char_name = char_table
            .get(char_id)
            .and_then(|v| v.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // 读取skin_table
        let skin_file = self.data_dir.join("zh_CN/gamedata/excel/skin_table.json");
        let skin_content = fs::read_to_string(&skin_file)
            .map_err(|e| format!("Failed to read skin table: {}", e))?;
        let skin_table: Value = serde_json::from_str(&skin_content)
            .map_err(|e| format!("Failed to parse skin table: {}", e))?;

        let char_skins_obj = skin_table
            .get("charSkins")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "charSkins not found".to_string())?;

        let mut skins = Vec::new();

        // 遍历所有皮肤，找出属于该干员的
        for (skin_id, skin_data) in char_skins_obj.iter() {
            let skin_char_id = skin_data
                .get("charId")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if skin_char_id == char_id {
                let display_skin = skin_data.get("displaySkin");
                let drawer_list: Vec<String> = display_skin
                    .and_then(|ds| ds.get("drawerList"))
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();

                skins.push(SkinInfo {
                    skin_id: skin_id.clone(),
                    skin_name: display_skin
                        .and_then(|ds| ds.get("skinName"))
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string()),
                    illust_id: skin_data
                        .get("illustId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    avatar_id: skin_data
                        .get("avatarId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    portrait_id: skin_data
                        .get("portraitId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    is_buy_skin: skin_data
                        .get("isBuySkin")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                    skin_group_name: display_skin
                        .and_then(|ds| ds.get("skinGroupName"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    content: display_skin
                        .and_then(|ds| ds.get("content"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    dialog: display_skin
                        .and_then(|ds| ds.get("dialog"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    usage: display_skin
                        .and_then(|ds| ds.get("usage"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    description: display_skin
                        .and_then(|ds| ds.get("description"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    obtain_approach: display_skin
                        .and_then(|ds| ds.get("obtainApproach"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    drawer_list,
                });
            }
        }

        // 按sortId排序（如果有的话）
        skins.sort_by(|a, b| a.skin_id.cmp(&b.skin_id));

        Ok(CharacterSkins {
            char_id: char_id.to_string(),
            char_name,
            skins,
        })
    }

    /// 获取子职业信息
    pub fn get_sub_profession_info(&self, sub_prof_id: &str) -> Result<SubProfessionInfo, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let uniequip_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/uniequip_table.json");
        let content = fs::read_to_string(&uniequip_file)
            .map_err(|e| format!("Failed to read uniequip table: {}", e))?;
        let data: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse uniequip table: {}", e))?;

        let sub_prof_dict = data
            .get("subProfDict")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "subProfDict not found".to_string())?;

        let sub_prof_data = sub_prof_dict
            .get(sub_prof_id)
            .ok_or_else(|| format!("Sub profession {} not found", sub_prof_id))?;

        Ok(SubProfessionInfo {
            sub_profession_id: sub_prof_data
                .get("subProfessionId")
                .and_then(|v| v.as_str())
                .unwrap_or(sub_prof_id)
                .to_string(),
            sub_profession_name: sub_prof_data
                .get("subProfessionName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            sub_profession_catagory: sub_prof_data
                .get("subProfessionCatagory")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32,
        })
    }

    /// 获取势力/团队信息
    pub fn get_team_power_info(&self, power_id: &str) -> Result<TeamPowerInfo, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        let team_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/handbook_team_table.json");
        let content = fs::read_to_string(&team_file)
            .map_err(|e| format!("Failed to read handbook team table: {}", e))?;
        let data: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse handbook team table: {}", e))?;

        let power_data = data
            .get(power_id)
            .ok_or_else(|| format!("Power {} not found", power_id))?;

        Ok(TeamPowerInfo {
            power_id: power_data
                .get("powerId")
                .and_then(|v| v.as_str())
                .unwrap_or(power_id)
                .to_string(),
            power_name: power_data
                .get("powerName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            power_code: power_data
                .get("powerCode")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            color: power_data
                .get("color")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            is_limited: power_data
                .get("isLimited")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        })
    }

    /// 一次性获取干员所有数据（优化版，避免重复读取文件）
    pub fn get_character_all_data(&self, char_id: &str) -> Result<CharacterAllData, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        // 一次性读取所有需要的文件
        let character_file = self.data_dir.join("zh_CN/gamedata/excel/character_table.json");
        let handbook_file = self.data_dir.join("zh_CN/gamedata/excel/handbook_info_table.json");
        let charword_file = self.data_dir.join("zh_CN/gamedata/excel/charword_table.json");
        let uniequip_file = self.data_dir.join("zh_CN/gamedata/excel/uniequip_table.json");
        let item_file = self.data_dir.join("zh_CN/gamedata/excel/item_table.json");
        let skill_file = self.data_dir.join("zh_CN/gamedata/excel/skill_table.json");
        let skin_file = self.data_dir.join("zh_CN/gamedata/excel/skin_table.json");
        let building_file = self.data_dir.join("zh_CN/gamedata/excel/building_data.json");

        let char_content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;
        let handbook_content = fs::read_to_string(&handbook_file)
            .map_err(|e| format!("Failed to read handbook table: {}", e))?;
        let charword_content = fs::read_to_string(&charword_file)
            .map_err(|e| format!("Failed to read charword table: {}", e))?;
        let uniequip_content = fs::read_to_string(&uniequip_file)
            .map_err(|e| format!("Failed to read uniequip table: {}", e))?;
        let item_content = fs::read_to_string(&item_file)
            .map_err(|e| format!("Failed to read item table: {}", e))?;
        let skill_content = fs::read_to_string(&skill_file)
            .map_err(|e| format!("Failed to read skill table: {}", e))?;
        let skin_content = fs::read_to_string(&skin_file)
            .map_err(|e| format!("Failed to read skin table: {}", e))?;
        let building_content = fs::read_to_string(&building_file)
            .map_err(|e| format!("Failed to read building data: {}", e))?;

        let char_table: Value = serde_json::from_str(&char_content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;
        let handbook_table: Value = serde_json::from_str(&handbook_content)
            .map_err(|e| format!("Failed to parse handbook table: {}", e))?;
        let charword_table: Value = serde_json::from_str(&charword_content)
            .map_err(|e| format!("Failed to parse charword table: {}", e))?;
        let uniequip_table: Value = serde_json::from_str(&uniequip_content)
            .map_err(|e| format!("Failed to parse uniequip table: {}", e))?;
        let item_table: Value = serde_json::from_str(&item_content)
            .map_err(|e| format!("Failed to parse item table: {}", e))?;
        let skill_table: Value = serde_json::from_str(&skill_content)
            .map_err(|e| format!("Failed to parse skill table: {}", e))?;
        let skin_table: Value = serde_json::from_str(&skin_content)
            .map_err(|e| format!("Failed to parse skin table: {}", e))?;
        let building_table: Value = serde_json::from_str(&building_content)
            .map_err(|e| format!("Failed to parse building table: {}", e))?;

        let char_data = char_table.get(char_id).ok_or("Character not found")?;
        let char_name = char_data.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();

        // 解析各部分数据（复用内部逻辑）
        let handbook = self.parse_handbook_from_tables(char_id, &handbook_table, &char_table)?;
        let voices = self.parse_voices_from_tables(char_id, &charword_table, &char_table)?;
        let equipment = self.parse_equipment_from_tables(char_id, &uniequip_table, &char_table)?;
        let potential_token = self.parse_potential_token_from_tables(char_id, &item_table, &char_table).ok();
        let talents = self.parse_talents_from_table(char_id, &char_table).ok();
        let trait_data = self.parse_trait_from_table(char_id, &char_table).ok();
        let potential_ranks = self.parse_potential_ranks_from_table(char_id, &char_table).ok();
        let skills = self.parse_skills_from_tables(char_id, &char_table, &skill_table).ok();
        let skins = self.parse_skins_from_tables(char_id, &char_table, &skin_table).ok();
        let building_skills = self.parse_building_skills_from_tables(char_id, &char_table, &building_table).ok();

        Ok(CharacterAllData {
            char_id: char_id.to_string(),
            char_name,
            handbook,
            voices,
            equipment,
            potential_token,
            talents,
            trait_data,
            potential_ranks,
            skills,
            skins,
            building_skills,
        })
    }

    // 内部辅助方法 - 从已加载的表中解析数据
    fn parse_handbook_from_tables(&self, char_id: &str, handbook_table: &Value, char_table: &Value) -> Result<CharacterHandbook, String> {
        let handbook_dict = handbook_table.get("handbookDict").and_then(|v| v.as_object()).ok_or("handbookDict not found")?;
        let char_data = handbook_dict.get(char_id).ok_or("Character not found in handbook")?;
        
        let char_name = char_table.get(char_id).and_then(|v| v.get("name")).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let rarity = char_table.get(char_id).and_then(|v| v.get("rarity")).and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let profession = char_table.get(char_id).and_then(|v| v.get("profession")).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let sub_profession = char_table.get(char_id).and_then(|v| v.get("subProfessionId")).and_then(|v| v.as_str()).map(|s| s.to_string());

        let story_sections: Vec<HandbookStorySection> = char_data.get("storyTextAudio").and_then(|v| v.as_array()).map(|sections| {
            sections.iter().filter_map(|section| {
                let title = section.get("storyTitle").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let stories: Vec<HandbookStory> = section.get("stories").and_then(|v| v.as_array()).map(|stories_arr| {
                    stories_arr.iter().filter_map(|story| {
                        Some(HandbookStory {
                            story_text: story.get("storyText").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            unlock_type: story.get("unLockType").and_then(|v| v.as_str()).unwrap_or("DIRECT").to_string(),
                            unlock_param: story.get("unLockParam").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        })
                    }).collect()
                }).unwrap_or_default();

                if title.is_empty() || stories.is_empty() { None } else { Some(HandbookStorySection { story_title: title, stories }) }
            }).collect()
        }).unwrap_or_default();

        Ok(CharacterHandbook { char_id: char_id.to_string(), char_name, rarity, profession, sub_profession, story_sections })
    }

    fn parse_voices_from_tables(&self, char_id: &str, charword_table: &Value, char_table: &Value) -> Result<CharacterVoice, String> {
        let char_words = charword_table.get("charWords").and_then(|v| v.as_object()).ok_or("charWords not found")?;
        let char_name = char_table.get(char_id).and_then(|v| v.get("name")).and_then(|v| v.as_str()).unwrap_or("").to_string();
        
        let voices: Vec<VoiceLine> = char_words.iter().filter_map(|(_, voice_data)| {
            if voice_data.get("charId").and_then(|v| v.as_str()) == Some(char_id) {
                Some(VoiceLine {
                    voice_id: voice_data.get("voiceId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    voice_title: voice_data.get("voiceTitle").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    voice_text: voice_data.get("voiceText").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    voice_index: voice_data.get("voiceIndex").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                    unlock_type: voice_data.get("unlockType").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                })
            } else { None }
        }).collect();

        Ok(CharacterVoice { char_id: char_id.to_string(), char_name, voices })
    }

    fn parse_equipment_from_tables(&self, char_id: &str, uniequip_table: &Value, char_table: &Value) -> Result<CharacterEquipment, String> {
        let char_equip = uniequip_table.get("charEquip").and_then(|v| v.as_object()).ok_or("charEquip not found")?;
        let equip_dict = uniequip_table.get("equipDict").and_then(|v| v.as_object()).ok_or("equipDict not found")?;
        let char_name = char_table.get(char_id).and_then(|v| v.get("name")).and_then(|v| v.as_str()).unwrap_or("").to_string();

        let mut equipments = Vec::new();
        if let Some(equip_ids) = char_equip.get(char_id).and_then(|v| v.as_array()) {
            for equip_id_value in equip_ids {
                if let Some(equip_id) = equip_id_value.as_str() {
                    if let Some(equip_data) = equip_dict.get(equip_id) {
                        equipments.push(EquipmentInfo {
                            equip_id: equip_id.to_string(),
                            equip_name: equip_data.get("uniEquipName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            equip_desc: equip_data.get("uniEquipDesc").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            equip_shining_color: equip_data.get("equipShiningColor").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            type_name: equip_data.get("typeName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        });
                    }
                }
            }
        }

        Ok(CharacterEquipment { char_id: char_id.to_string(), char_name, equipments })
    }

    fn parse_potential_token_from_tables(&self, char_id: &str, item_table: &Value, char_table: &Value) -> Result<CharacterPotentialToken, String> {
        let items = item_table.get("items").and_then(|v| v.as_object()).ok_or("items not found")?;
        let token_id = format!("p_{}", char_id);
        let token_data = items.get(&token_id).ok_or("Token not found")?;
        let char_name = char_table.get(char_id).and_then(|v| v.get("name")).and_then(|v| v.as_str()).unwrap_or("").to_string();

        Ok(CharacterPotentialToken {
            char_id: char_id.to_string(),
            char_name,
            item_id: token_id,
            token_name: token_data.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            token_desc: token_data.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            token_usage: token_data.get("usage").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            rarity: token_data.get("rarity").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            obtain_approach: token_data.get("obtainApproach").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        })
    }

    fn parse_talents_from_table(&self, char_id: &str, char_table: &Value) -> Result<CharacterTalents, String> {
        let char_data = char_table.get(char_id).ok_or("Character not found")?;
        let char_name = char_data.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let talents: Vec<TalentInfo> = char_data.get("talents").and_then(|v| v.as_array()).map(|arr| {
            arr.iter().enumerate().filter_map(|(idx, talent)| {
                let candidates: Vec<TalentCandidate> = talent.get("candidates").and_then(|v| v.as_array()).map(|cands| {
                    cands.iter().filter_map(|cand| {
                        Some(TalentCandidate {
                            unlock_condition: TalentUnlockCondition {
                                phase: cand.get("unlockCondition").and_then(|v| v.get("phase")).and_then(|v| v.as_str()).unwrap_or("PHASE_0").to_string(),
                                level: cand.get("unlockCondition").and_then(|v| v.get("level")).and_then(|v| v.as_i64()).unwrap_or(1) as i32,
                            },
                            name: cand.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            description: cand.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            range_description: cand.get("rangeDescription").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        })
                    }).collect()
                }).unwrap_or_default();

                if candidates.is_empty() { None } else { Some(TalentInfo { talent_index: idx as i32, candidates }) }
            }).collect()
        }).unwrap_or_default();

        Ok(CharacterTalents { char_id: char_id.to_string(), char_name, talents })
    }

    fn parse_trait_from_table(&self, char_id: &str, char_table: &Value) -> Result<CharacterTrait, String> {
        let char_data = char_table.get(char_id).ok_or("Character not found")?;
        let char_name = char_data.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let trait_info = char_data.get("trait").and_then(|trait_data| {
            let candidates: Vec<TraitCandidate> = trait_data.get("candidates").and_then(|v| v.as_array()).map(|cands| {
                cands.iter().filter_map(|cand| {
                    Some(TraitCandidate {
                        unlock_condition: TraitUnlockCondition {
                            phase: cand.get("unlockCondition").and_then(|v| v.get("phase")).and_then(|v| v.as_str()).unwrap_or("PHASE_0").to_string(),
                            level: cand.get("unlockCondition").and_then(|v| v.get("level")).and_then(|v| v.as_i64()).unwrap_or(1) as i32,
                        },
                        override_descripton: cand.get("overrideDescripton").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    })
                }).collect()
            }).unwrap_or_default();

            if candidates.is_empty() { None } else { Some(TraitInfo { candidates }) }
        });

        Ok(CharacterTrait { char_id: char_id.to_string(), char_name, trait_info })
    }

    fn parse_potential_ranks_from_table(&self, char_id: &str, char_table: &Value) -> Result<CharacterPotentialRanks, String> {
        let char_data = char_table.get(char_id).ok_or("Character not found")?;
        let char_name = char_data.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let potential_ranks: Vec<PotentialRank> = char_data.get("potentialRanks").and_then(|v| v.as_array()).map(|arr| {
            arr.iter().enumerate().filter_map(|(idx, rank)| {
                Some(PotentialRank {
                    rank: idx as i32,
                    description: rank.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                })
            }).collect()
        }).unwrap_or_default();

        Ok(CharacterPotentialRanks { char_id: char_id.to_string(), char_name, potential_ranks })
    }

    fn parse_skills_from_tables(&self, char_id: &str, char_table: &Value, skill_table: &Value) -> Result<CharacterSkills, String> {
        let char_data = char_table.get(char_id).ok_or("Character not found")?;
        let char_name = char_data.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let mut skills = Vec::new();
        if let Some(skill_arr) = char_data.get("skills").and_then(|v| v.as_array()) {
            for skill_ref in skill_arr {
                if let Some(skill_id) = skill_ref.get("skillId").and_then(|v| v.as_str()) {
                    if let Some(skill_data) = skill_table.get(skill_id) {
                        let levels: Vec<SkillLevel> = skill_data.get("levels").and_then(|v| v.as_array()).map(|arr| {
                            arr.iter().enumerate().filter_map(|(idx, level)| {
                                let sp_data = level.get("spData")?;
                                let blackboard: Vec<BlackboardValue> = level.get("blackboard")
                                    .and_then(|v| v.as_array())
                                    .map(|bb| {
                                        bb.iter().filter_map(|item| {
                                            Some(BlackboardValue {
                                                key: item.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                                value: item.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32,
                                            })
                                        }).collect()
                                    })
                                    .unwrap_or_default();
                                Some(SkillLevel {
                                    level: (idx + 1) as i32,
                                    name: level.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    description: level.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    skill_type: level.get("skillType").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    duration_type: level.get("durationType").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    sp_data: SkillSPData {
                                        sp_type: sp_data.get("spType").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                        sp_cost: sp_data.get("spCost").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                                        init_sp: sp_data.get("initSp").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                                    },
                                    duration: level.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32,
                                    blackboard,
                                })
                            }).collect()
                        }).unwrap_or_default();

                        if !levels.is_empty() {
                            skills.push(SkillInfo {
                                skill_id: skill_id.to_string(),
                                icon_id: skill_data.get("iconId").and_then(|v| v.as_str()).map(|s| s.to_string()),
                                levels,
                            });
                        }
                    }
                }
            }
        }

        Ok(CharacterSkills { char_id: char_id.to_string(), char_name, skills })
    }

    fn parse_skins_from_tables(&self, char_id: &str, char_table: &Value, skin_table: &Value) -> Result<CharacterSkins, String> {
        let char_name = char_table.get(char_id).and_then(|v| v.get("name")).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let char_skins_obj = skin_table.get("charSkins").and_then(|v| v.as_object()).ok_or("charSkins not found")?;

        let mut skins = Vec::new();
        for (skin_id, skin_data) in char_skins_obj.iter() {
            if skin_data.get("charId").and_then(|v| v.as_str()) == Some(char_id) {
                let display_skin = skin_data.get("displaySkin");
                let drawer_list: Vec<String> = display_skin.and_then(|ds| ds.get("drawerList")).and_then(|v| v.as_array()).map(|arr| {
                    arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
                }).unwrap_or_default();

                skins.push(SkinInfo {
                    skin_id: skin_id.clone(),
                    skin_name: display_skin.and_then(|ds| ds.get("skinName")).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string()),
                    illust_id: skin_data.get("illustId").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    avatar_id: skin_data.get("avatarId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    portrait_id: skin_data.get("portraitId").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    is_buy_skin: skin_data.get("isBuySkin").and_then(|v| v.as_bool()).unwrap_or(false),
                    skin_group_name: display_skin.and_then(|ds| ds.get("skinGroupName")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                    content: display_skin.and_then(|ds| ds.get("content")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                    dialog: display_skin.and_then(|ds| ds.get("dialog")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                    usage: display_skin.and_then(|ds| ds.get("usage")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                    description: display_skin.and_then(|ds| ds.get("description")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                    obtain_approach: display_skin.and_then(|ds| ds.get("obtainApproach")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                    drawer_list,
                });
            }
        }

        skins.sort_by(|a, b| a.skin_id.cmp(&b.skin_id));
        Ok(CharacterSkins { char_id: char_id.to_string(), char_name, skins })
    }

    fn parse_building_skills_from_tables(&self, char_id: &str, char_table: &Value, building_table: &Value) -> Result<CharacterBuildingSkills, String> {
        let char_name = char_table.get(char_id).and_then(|v| v.get("name")).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let chars = building_table.get("chars").and_then(|v| v.as_object()).ok_or("chars not found")?;
        let buffs = building_table.get("buffs").and_then(|v| v.as_object()).ok_or("buffs not found")?;
        let char_building_data = chars.get(char_id).ok_or("Character not found in building data")?;

        let mut building_skills = Vec::new();
        if let Some(buff_char) = char_building_data.get("buffChar").and_then(|v| v.as_array()) {
            for buff_phase in buff_char {
                if let Some(buff_data_arr) = buff_phase.get("buffData").and_then(|v| v.as_array()) {
                    for buff_ref in buff_data_arr {
                        if let Some(buff_id) = buff_ref.get("buffId").and_then(|v| v.as_str()) {
                            if let Some(buff_info) = buffs.get(buff_id) {
                                let unlock_cond = buff_ref.get("cond");
                                building_skills.push(BuildingSkillInfo {
                                    buff_id: buff_id.to_string(),
                                    buff_name: buff_info.get("buffName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    description: buff_info.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    room_type: buff_info.get("roomType").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    unlock_condition: BuildingSkillUnlockCondition {
                                        phase: unlock_cond.and_then(|v| v.get("phase")).and_then(|v| v.as_str()).unwrap_or("PHASE_0").to_string(),
                                        level: unlock_cond.and_then(|v| v.get("level")).and_then(|v| v.as_i64()).unwrap_or(1) as i32,
                                    },
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(CharacterBuildingSkills { char_id: char_id.to_string(), char_name, building_skills })
    }

    /// 获取干员基建技能
    pub fn get_character_building_skills(
        &self,
        char_id: &str,
    ) -> Result<CharacterBuildingSkills, String> {
        if !self.is_installed() {
            return Err("NOT_INSTALLED".to_string());
        }

        // 读取building_data获取干员的基建技能引用
        let building_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/building_data.json");
        let building_content = fs::read_to_string(&building_file)
            .map_err(|e| format!("Failed to read building data: {}", e))?;
        let building_data: Value = serde_json::from_str(&building_content)
            .map_err(|e| format!("Failed to parse building data: {}", e))?;

        // 获取干员名字
        let character_file = self
            .data_dir
            .join("zh_CN/gamedata/excel/character_table.json");
        let char_content = fs::read_to_string(&character_file)
            .map_err(|e| format!("Failed to read character table: {}", e))?;
        let char_table: Value = serde_json::from_str(&char_content)
            .map_err(|e| format!("Failed to parse character table: {}", e))?;

        let char_name = char_table
            .get(char_id)
            .and_then(|v| v.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let chars = building_data
            .get("chars")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "chars not found in building data".to_string())?;

        let buffs = building_data
            .get("buffs")
            .and_then(|v| v.as_object())
            .ok_or_else(|| "buffs not found in building data".to_string())?;

        let char_building_data = chars
            .get(char_id)
            .ok_or_else(|| format!("Character {} not found in building data", char_id))?;

        let mut building_skills = Vec::new();

        // 获取干员的所有基建技能
        if let Some(buff_char) = char_building_data.get("buffChar").and_then(|v| v.as_array()) {
            for buff_phase in buff_char {
                if let Some(buff_data_arr) = buff_phase.get("buffData").and_then(|v| v.as_array())
                {
                    for buff_ref in buff_data_arr {
                        if let Some(buff_id) = buff_ref.get("buffId").and_then(|v| v.as_str()) {
                            if let Some(buff_info) = buffs.get(buff_id) {
                                let unlock_cond = buff_ref.get("cond");
                                building_skills.push(BuildingSkillInfo {
                                    buff_id: buff_id.to_string(),
                                    buff_name: buff_info
                                        .get("buffName")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    description: buff_info
                                        .get("description")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    room_type: buff_info
                                        .get("roomType")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    unlock_condition: BuildingSkillUnlockCondition {
                                        phase: unlock_cond
                                            .and_then(|v| v.get("phase"))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("PHASE_0")
                                            .to_string(),
                                        level: unlock_cond
                                            .and_then(|v| v.get("level"))
                                            .and_then(|v| v.as_i64())
                                            .unwrap_or(1) as i32,
                                    },
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(CharacterBuildingSkills {
            char_id: char_id.to_string(),
            char_name,
            building_skills,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_story_info_supports_uc_prefix() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temp_root = std::env::temp_dir().join(format!("story_reader_test_{}", timestamp));
        let data_dir = temp_root.join("ArknightsGameData");
        let info_dir = data_dir.join("zh_CN/gamedata/story/[uc]info/demo");
        fs::create_dir_all(&info_dir).unwrap();
        fs::write(info_dir.join("sample.txt"), "test summary").unwrap();

        let service = DataService {
            data_dir: data_dir.clone(),
            index_db_path: temp_root.join("story_index.db"),
        };

        let content = service
            .read_story_info("info/demo/sample")
            .expect("should read summary from [uc]info directory");
        assert_eq!(content, "test summary");

        let _ = fs::remove_dir_all(&temp_root);
    }
}
