mod commands;
mod data_service;
mod models;
mod parser;

use commands::AppState;
use data_service::DataService;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");

            let data_service = DataService::new(app_data_dir);

            app.manage(AppState {
                data_service: Arc::new(Mutex::new(data_service)),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sync_data,
            commands::get_current_version,
            commands::get_remote_version,
            commands::check_update,
            commands::is_installed,
            commands::get_activity_stories,
            commands::import_from_zip,
            commands::get_chapters,
            commands::get_story_categories,
            commands::get_story_content,
            commands::get_story_info,
            commands::search_stories,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
