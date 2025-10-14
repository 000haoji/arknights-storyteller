use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use reqwest::blocking::Client;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use zip::ZipArchive;

use crate::models::{
    Activity, Chapter, SearchDebugResponse, SearchResult, StoryCategory, StoryEntry,
    StoryIndexStatus, StorySegment,
};
use crate::parser::parse_story_text;

const REPO_API_URL: &str = "https://api.github.com/repos/Kengxxiao/ArknightsGameData";
const REPO_DOWNLOAD_URL: &str = "https://codeload.github.com/Kengxxiao/ArknightsGameData/zip";
const DEFAULT_BRANCH: &str = "master";
const VERSION_FILE: &str = "version.json";
const SEARCH_RESULT_LIMIT: usize = 500;

#[derive(Clone, serde::Serialize)]
struct SyncProgress {
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
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS story_index_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS story_index USING fts5(
                story_id UNINDEXED,
                story_name,
                category UNINDEXED,
                tokenized_content,
                raw_content UNINDEXED,
                tokenize = 'unicode61'
            );
            ",
        )
        .map_err(|e| format!("Failed to initialize story index database: {}", e))
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

        stories.sort_by(|a, b| a.story.story_id.cmp(&b.story.story_id));
        Ok(stories)
    }

    fn flatten_segments(segments: &[StorySegment]) -> String {
        let mut parts = Vec::with_capacity(segments.len());
        for segment in segments {
            match segment {
                StorySegment::Dialogue {
                    character_name,
                    text,
                } => {
                    parts.push(format!("{}：{}", character_name, text));
                }
                StorySegment::Narration { text }
                | StorySegment::System { text, .. }
                | StorySegment::Subtitle { text, .. }
                | StorySegment::Sticker { text, .. } => {
                    parts.push(text.clone());
                }
                StorySegment::Decision { options } => {
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

    fn build_fts_query(tokens: &[String]) -> Option<String> {
        if tokens.is_empty() {
            return None;
        }
        let mut parts = Vec::with_capacity(tokens.len());

        for token in tokens {
            if token.is_empty() {
                continue;
            }

            let is_ascii = token.chars().all(|c| c.is_ascii_alphanumeric());
            if is_ascii {
                parts.push(format!("{}*", token));
            } else {
                parts.push(token.clone());
            }
        }

        if parts.is_empty() {
            None
        } else {
            Some(parts.join(" AND "))
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

    pub fn import_zip_from_bytes(
        &self,
        data: &[u8],
        app: AppHandle,
    ) -> Result<(), String> {
        let parent_dir = self
            .data_dir
            .parent()
            .ok_or_else(|| "Invalid data directory".to_string())?;

        fs::create_dir_all(parent_dir)
            .map_err(|e| format!("无法创建数据目录: {}", e))?;

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
        let full_path = self
            .data_dir
            .join("zh_CN/gamedata/story")
            .join(format!("{}.txt", story_path));

        fs::read_to_string(&full_path).map_err(|e| format!("Failed to read story file: {}", e))
    }

    /// 读取剧情简介
    pub fn read_story_info(&self, info_path: &str) -> Result<String, String> {
        let full_path = self
            .data_dir
            .join("zh_CN/gamedata/story")
            .join(format!("{}.txt", info_path));

        fs::read_to_string(&full_path).map_err(|e| format!("Failed to read info file: {}", e))
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
                raw_content
            ) VALUES (?1, ?2, ?3, ?4, ?5)
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

        let tokens = Self::tokenize_for_fts(query);
        let Some(fts_query) = Self::build_fts_query(&tokens) else {
            return Ok(Some(Vec::new()));
        };

        let query_sql = format!(
            "
            SELECT story_id, story_name, category, raw_content
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
                Ok((story_id, story_name, category, raw_content))
            })
            .map_err(|e| format!("Failed to execute story index query: {}", e))?;

        let query_lower = query.to_lowercase();
        let mut results = Vec::new();
        for row in rows {
            if let Ok((story_id, story_name, category, raw_content)) = row {
                let mut matched_text = self.extract_context(&raw_content, &query_lower);
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
        let query_lower = query.to_lowercase();

        let stories = self.collect_stories_for_index()?;

        for indexed in &stories {
            let story = &indexed.story;
            let category_label =
                Self::format_category_label(&indexed.entry_type, &indexed.category_name);

            if story.story_name.to_lowercase().contains(&query_lower) {
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
                if content.to_lowercase().contains(&query_lower) {
                    let matched_text = self.extract_context(&content, &query_lower);
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

    /// 搜索剧情
    pub fn search_stories(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        match self.search_stories_with_index(trimmed) {
            Ok(Some(results)) => Ok(results),
            Ok(None) => self.search_stories_fallback(trimmed),
            Err(err) => {
                eprintln!(
                    "[INDEX] Failed to search using index ({}), fallback to linear scan",
                    err
                );
                self.search_stories_fallback(trimmed)
            }
        }
    }

    pub fn search_stories_with_debug(
        &self,
        query: &str,
    ) -> Result<SearchDebugResponse, String> {
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

        let index_attempt_start = Instant::now();
        match self.search_stories_with_index(trimmed) {
            Ok(Some(results)) => {
                let index_elapsed = index_attempt_start.elapsed();
                logs.push(format!(
                    "全文索引查询完成，耗时 {} ms，结果 {} 条",
                    index_elapsed.as_millis(),
                    results.len()
                ));
                if results.is_empty() {
                    logs.push("索引结果为空，转为线性扫描".to_string());
                } else {
                    if results.len() >= SEARCH_RESULT_LIMIT {
                        logs.push(format!(
                            "结果数量达到上限 {} 条，已截断",
                            SEARCH_RESULT_LIMIT
                        ));
                    }
                    logs.push(format!("搜索总耗时 {} ms", start_time.elapsed().as_millis()));
                    return Ok(SearchDebugResponse { results, logs });
                }
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
        logs.push(format!("搜索总耗时 {} ms", start_time.elapsed().as_millis()));

        Ok(SearchDebugResponse {
            results: fallback_results,
            logs,
        })
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

        let content_lower = content.to_lowercase();

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
        let mut groups: HashMap<String, (String, Vec<StoryEntry>)> = HashMap::new();

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
                        groups.insert(id.clone(), (group_name.to_string(), stories));
                    }
                }
            }
        }

        // 转换为有序列表（按ID排序）
        let mut result: Vec<(String, Vec<StoryEntry>)> = groups
            .into_iter()
            .map(|(_, (name, stories))| (name, stories))
            .collect();

        result.sort_by(|a, b| {
            // 提取章节号进行排序
            let a_num =
                a.0.chars()
                    .filter(|c| c.is_numeric())
                    .collect::<String>()
                    .parse::<i32>()
                    .unwrap_or(0);
            let b_num =
                b.0.chars()
                    .filter(|c| c.is_numeric())
                    .collect::<String>()
                    .parse::<i32>()
                    .unwrap_or(0);
            a_num.cmp(&b_num)
        });

        Ok(result)
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

        let mut groups: Vec<(String, Vec<StoryEntry>)> = Vec::new();

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
                            groups.push((activity_name.to_string(), stories));
                        }
                    }
                }
            }
        }

        // 按活动开始时间排序（最新的在前）
        groups.sort_by(|a, b| b.0.cmp(&a.0));

        Ok(groups)
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
}
