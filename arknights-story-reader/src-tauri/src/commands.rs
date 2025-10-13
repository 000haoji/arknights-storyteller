use tauri::{State, AppHandle};
use std::sync::Mutex;
use crate::data_service::DataService;
use crate::parser::parse_story_text;
use crate::models::{StoryCategory, Chapter, ParsedStoryContent, SearchResult};

pub struct AppState {
    pub data_service: Mutex<DataService>,
}

#[tauri::command]
pub async fn sync_data(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let service = state.data_service.lock().unwrap();
    service.sync_data(app)
}

#[tauri::command]
pub async fn get_current_version(state: State<'_, AppState>) -> Result<String, String> {
    let service = state.data_service.lock().unwrap();
    service.get_current_version()
}

#[tauri::command]
pub async fn get_remote_version(state: State<'_, AppState>) -> Result<String, String> {
    let service = state.data_service.lock().unwrap();
    service.get_remote_version()
}

#[tauri::command]
pub async fn check_update(state: State<'_, AppState>) -> Result<bool, String> {
    let service = state.data_service.lock().unwrap();
    service.check_update()
}

#[tauri::command]
pub async fn get_chapters(state: State<'_, AppState>) -> Result<Vec<Chapter>, String> {
    let service = state.data_service.lock().unwrap();
    service.get_chapters()
}

#[tauri::command]
pub async fn get_story_categories(state: State<'_, AppState>) -> Result<Vec<StoryCategory>, String> {
    let service = state.data_service.lock().unwrap();
    service.get_story_categories()
}

#[tauri::command]
pub async fn get_story_content(
    state: State<'_, AppState>,
    story_path: String,
) -> Result<ParsedStoryContent, String> {
    let service = state.data_service.lock().unwrap();
    let content = service.read_story_text(&story_path)?;
    Ok(parse_story_text(&content))
}

#[tauri::command]
pub async fn get_story_info(
    state: State<'_, AppState>,
    info_path: String,
) -> Result<String, String> {
    let service = state.data_service.lock().unwrap();
    service.read_story_info(&info_path)
}

#[tauri::command]
pub async fn search_stories(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let service = state.data_service.lock().unwrap();
    service.search_stories(&query)
}

