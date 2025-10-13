use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::blocking::Client;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use zip::ZipArchive;

use crate::models::{Activity, Chapter, SearchResult, StoryCategory, StoryEntry};

const REPO_API_URL: &str = "https://api.github.com/repos/Kengxxiao/ArknightsGameData";
const REPO_DOWNLOAD_URL: &str = "https://codeload.github.com/Kengxxiao/ArknightsGameData/zip";
const DEFAULT_BRANCH: &str = "master";
const VERSION_FILE: &str = "version.json";

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

fn emit_progress(app: &AppHandle, phase: impl Into<String>, current: usize, total: usize, message: impl Into<String>) {
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

    for entry in fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory {:?}: {}", src, e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_type = entry.file_type().map_err(|e| format!("Failed to read file type: {}", e))?;
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

pub struct DataService {
    data_dir: PathBuf,
}

impl DataService {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            data_dir: app_data_dir.join("ArknightsGameData"),
        }
    }

    /// 下载并解压最新数据包
    pub fn sync_data(&self, app: AppHandle) -> Result<(), String> {
        emit_progress(&app, "准备", 0, 1, "正在初始化同步环境");

        let client = Self::create_http_client()?;
        let remote_commit = match self.fetch_latest_commit(&client) {
            Ok(commit) => {
                let short = commit.get(..7).unwrap_or(commit.as_str());
                emit_progress(&app, "准备", 1, 1, format!("最新版本 {}", short));
                Some(commit)
            }
            Err(err) => {
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
        self.download_and_extract(&client, &app, &reference)?;

        // 写入版本信息
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
            Ok(format!("{} ({})", commit_short, format_timestamp(info.fetched_at)))
        } else {
            Ok("未安装".to_string())
        }
    }

    pub fn get_remote_version(&self) -> Result<String, String> {
        let client = Self::create_http_client()?;
        match self.fetch_latest_commit(&client) {
            Ok(commit) => {
                let short = if commit.len() >= 7 { &commit[..7] } else { commit.as_str() };
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
            Ok(remote) => Ok(current.unwrap().commit != remote),
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
        let parent_dir = self
            .data_dir
            .parent()
            .ok_or_else(|| "Invalid data directory".to_string())?;

        let download_url = format!("{}/{}", REPO_DOWNLOAD_URL, reference);
        emit_progress(app, "下载", 0, 1, format!("从 {} 下载", reference));

        let mut response = client
            .get(&download_url)
            .send()
            .map_err(|e| format!("Download failed: {}", e))?;

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
            let total = if total_bytes == 0 { 1 } else { total_bytes };
            emit_progress(
                app,
                "下载",
                downloaded,
                total,
                format!(
                    "已下载 {:.1}%",
                    (downloaded as f64 / total as f64) * 100.0
                ),
            );
        }
        zip_file.flush().map_err(|e| format!("Failed to flush zip file: {}", e))?;

        emit_progress(app, "解压", 0, 1, "正在解压数据");

        let extract_root = parent_dir.join("ArknightsGameData_extract");
        if extract_root.exists() {
            fs::remove_dir_all(&extract_root)
                .map_err(|e| format!("Failed to clean extract dir: {}", e))?;
        }
        fs::create_dir_all(&extract_root)
            .map_err(|e| format!("Failed to create extract dir: {}", e))?;

        let zip_file = fs::File::open(&zip_path)
            .map_err(|e| format!("Failed to open downloaded zip: {}", e))?;
        let mut archive = ZipArchive::new(zip_file)
            .map_err(|e| format!("Failed to read zip archive: {}", e))?;

        let total_entries = archive.len();
        for i in 0..total_entries {
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

            emit_progress(
                app,
                "解压",
                i + 1,
                total_entries,
                format!("解压 {}/{}", i + 1, total_entries),
            );
        }

        // 找到解压后的根目录（zip 默认包含一个根目录）
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
        fs::remove_file(&zip_path).ok();

        Ok(())
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
        fs::write(&path, content)
            .map_err(|e| format!("Failed to write version info: {}", e))
    }
}

/// 格式化时间戳
fn format_timestamp(timestamp: i64) -> String {
    use std::time::{SystemTime, UNIX_EPOCH, Duration};
    
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
        let chapter_file = self.data_dir
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
        let story_review_file = self.data_dir
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

    /// 获取分类的剧情列表
    pub fn get_story_categories(&self) -> Result<Vec<StoryCategory>, String> {
        let mut categories = Vec::new();
        
        // 主线剧情
        let main_stories = self.get_main_stories()?;
        if !main_stories.is_empty() {
            categories.push(StoryCategory {
                id: "main".to_string(),
                name: "主线剧情".to_string(),
                category_type: "chapter".to_string(),
                stories: main_stories,
            });
        }
        
        // 活动剧情
        let activities = self.get_activities()?;
        for activity in activities {
            if !activity.info_unlock_datas.is_empty() {
                categories.push(StoryCategory {
                    id: activity.id.clone(),
                    name: activity.name.clone(),
                    category_type: "activity".to_string(),
                    stories: activity.info_unlock_datas,
                });
            }
        }
        
        Ok(categories)
    }

    /// 获取主线剧情
    fn get_main_stories(&self) -> Result<Vec<StoryEntry>, String> {
        let story_review_file = self.data_dir
            .join("zh_CN/gamedata/excel/story_review_table.json");
        
        let content = fs::read_to_string(&story_review_file)
            .map_err(|e| format!("Failed to read story review file: {}", e))?;
        
        let data: HashMap<String, Value> = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse story review data: {}", e))?;
        
        let mut stories = Vec::new();
        
        for (_id, value) in data.iter() {
            if let Some(entry_type) = value.get("entryType").and_then(|v| v.as_str()) {
                if entry_type == "MAIN_STORY" {
                    if let Some(unlock_datas) = value.get("infoUnlockDatas").and_then(|v| v.as_array()) {
                        for unlock_data in unlock_datas {
                            if let Ok(story) = serde_json::from_value::<StoryEntry>(unlock_data.clone()) {
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
        let full_path = self.data_dir
            .join("zh_CN/gamedata/story")
            .join(format!("{}.txt", story_path));
        
        fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read story file: {}", e))
    }

    /// 读取剧情简介
    pub fn read_story_info(&self, info_path: &str) -> Result<String, String> {
        let full_path = self.data_dir
            .join("zh_CN/gamedata/story")
            .join(format!("{}.txt", info_path));
        
        fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read info file: {}", e))
    }

    /// 搜索剧情
    pub fn search_stories(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let mut results = Vec::new();
        let query_lower = query.to_lowercase();
        
        let categories = self.get_story_categories()?;
        
        for category in categories {
            for story in category.stories {
                // 搜索剧情名称
                if story.story_name.to_lowercase().contains(&query_lower) {
                    results.push(SearchResult {
                        story_id: story.story_id.clone(),
                        story_name: story.story_name.clone(),
                        matched_text: story.story_name.clone(),
                        category: category.name.clone(),
                    });
                    continue;
                }
                
                // 搜索剧情内容
                if let Ok(content) = self.read_story_text(&story.story_txt) {
                    if content.to_lowercase().contains(&query_lower) {
                        // 提取匹配的上下文
                        let matched_text = self.extract_context(&content, &query_lower);
                        results.push(SearchResult {
                            story_id: story.story_id,
                            story_name: story.story_name,
                            matched_text,
                            category: category.name.clone(),
                        });
                    }
                }
            }
        }
        
        Ok(results)
    }

    /// 提取匹配文本的上下文
    fn extract_context(&self, content: &str, query: &str) -> String {
        if let Some(pos) = content.to_lowercase().find(query) {
            let start = pos.saturating_sub(50);
            let end = (pos + query.len() + 50).min(content.len());
            let context = &content[start..end];
            format!("...{}...", context.trim())
        } else {
            String::new()
        }
    }
}
