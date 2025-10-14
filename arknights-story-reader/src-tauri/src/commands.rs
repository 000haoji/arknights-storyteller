use crate::data_service::DataService;
use crate::models::{Chapter, ParsedStoryContent, SearchResult, StoryCategory, StoryEntry};
use crate::parser::parse_story_text;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

pub struct AppState {
    pub data_service: Arc<Mutex<DataService>>,
}

// 安全获取锁，即使 Mutex 被 panic 污染也能恢复
fn lock_service(mutex: &Arc<Mutex<DataService>>) -> std::sync::MutexGuard<'_, DataService> {
    mutex.lock().unwrap_or_else(|poisoned| {
        eprintln!("[WARNING] Mutex was poisoned, recovering data");
        poisoned.into_inner()
    })
}

fn clone_service(state: &State<'_, AppState>) -> DataService {
    let guard = lock_service(&state.data_service);
    let service = guard.clone();
    drop(guard);
    service
}

#[tauri::command]
pub async fn sync_data(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let service = clone_service(&state);
    tauri::async_runtime::spawn_blocking(move || service.sync_data(app))
        .await
        .map_err(|err| format!("Failed to join sync task: {}", err))?
}

#[tauri::command]
pub async fn get_current_version(state: State<'_, AppState>) -> Result<String, String> {
    let service = lock_service(&state.data_service);
    service.get_current_version()
}

#[tauri::command]
pub async fn get_remote_version(state: State<'_, AppState>) -> Result<String, String> {
    let service = clone_service(&state);
    tauri::async_runtime::spawn_blocking(move || service.get_remote_version())
        .await
        .map_err(|err| format!("Failed to join remote version task: {}", err))?
}

#[tauri::command]
pub async fn check_update(state: State<'_, AppState>) -> Result<bool, String> {
    let service = clone_service(&state);
    tauri::async_runtime::spawn_blocking(move || service.check_update())
        .await
        .map_err(|err| format!("Failed to join check update task: {}", err))?
}

#[tauri::command]
pub async fn is_installed(state: State<'_, AppState>) -> Result<bool, String> {
    let service = lock_service(&state.data_service);
    Ok(service.is_installed())
}

#[tauri::command]
pub async fn get_chapters(state: State<'_, AppState>) -> Result<Vec<Chapter>, String> {
    let service = lock_service(&state.data_service);
    service.get_chapters()
}

#[tauri::command]
pub async fn get_story_categories(
    state: State<'_, AppState>,
) -> Result<Vec<StoryCategory>, String> {
    let service = lock_service(&state.data_service);
    service.get_story_categories()
}

#[tauri::command]
pub async fn get_story_content(
    state: State<'_, AppState>,
    story_path: String,
) -> Result<ParsedStoryContent, String> {
    let service = lock_service(&state.data_service);
    let content = service.read_story_text(&story_path)?;
    Ok(parse_story_text(&content))
}

#[tauri::command]
pub async fn get_story_info(
    state: State<'_, AppState>,
    info_path: String,
) -> Result<String, String> {
    let service = lock_service(&state.data_service);
    service.read_story_info(&info_path)
}

#[tauri::command]
pub async fn search_stories(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let service = lock_service(&state.data_service);
    service.search_stories(&query)
}

#[tauri::command]
pub async fn import_from_zip(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<(), String> {
    let service = clone_service(&state);
    tauri::async_runtime::spawn_blocking(move || service.import_zip_from_path(path, app))
        .await
        .map_err(|err| format!("Failed to join import task: {}", err))?
}

#[tauri::command]
pub async fn get_activity_stories(state: State<'_, AppState>) -> Result<Vec<StoryEntry>, String> {
    let service = clone_service(&state);
    tauri::async_runtime::spawn_blocking(move || service.get_activity_stories())
        .await
        .map_err(|err| format!("Failed to join activity stories task: {}", err))?
}
