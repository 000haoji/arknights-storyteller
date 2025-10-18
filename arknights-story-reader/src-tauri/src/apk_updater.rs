#![cfg(target_os = "android")]

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, PluginApi, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

type PluginResult<T> = Result<T, String>;

const PLUGIN_IDENTIFIER: &str = "com.arknights.storyreader.updater";
const PLUGIN_CLASS: &str = "ApkUpdaterPlugin";

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("apk-updater")
        .invoke_handler(tauri::generate_handler![
            download_and_install,
            open_install_permission_settings,
            save_apk_to_downloads
        ])
        .setup(|app, api| {
            let updater = AndroidUpdater::init(app, api)?;
            app.manage(updater);
            Ok(())
        })
        .build()
}

#[tauri::command]
async fn download_and_install<R: Runtime>(
    app: tauri::AppHandle<R>,
    url: String,
    file_name: Option<String>,
) -> Result<DownloadResponse, String> {
    let updater = app.state::<AndroidUpdater<R>>();
    updater.download_and_install(url, file_name)
}

#[tauri::command]
async fn open_install_permission_settings<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    let updater = app.state::<AndroidUpdater<R>>();
    updater.open_install_permission_settings()
}

#[tauri::command]
async fn save_apk_to_downloads<R: Runtime>(
    app: tauri::AppHandle<R>,
    source_file_path: String,
    file_name: String,
) -> Result<SaveToDownloadsResponse, String> {
    let updater = app.state::<AndroidUpdater<R>>();
    updater.save_apk_to_downloads(source_file_path, file_name)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadRequest {
    url: String,
    #[serde(rename = "fileName", skip_serializing_if = "Option::is_none")]
    file_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResponse {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub needs_permission: bool,
}

impl Default for DownloadResponse {
    fn default() -> Self {
        Self {
            status: None,
            needs_permission: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveToDownloadsRequest {
    source_file_path: String,
    file_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveToDownloadsResponse {
    pub success: bool,
    pub file_path: String,
    pub message: String,
}

#[derive(Clone)]
pub struct AndroidUpdater<R: Runtime>(PluginHandle<R>);

unsafe impl<R: Runtime> Send for AndroidUpdater<R> {}
unsafe impl<R: Runtime> Sync for AndroidUpdater<R> {}

impl<R: Runtime> AndroidUpdater<R> {
    fn init<C: serde::de::DeserializeOwned>(
        _app: &tauri::AppHandle<R>,
        api: PluginApi<R, C>,
    ) -> tauri::Result<Self> {
        let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, PLUGIN_CLASS)?;
        Ok(Self(handle))
    }

    pub fn download_and_install(
        &self,
        url: String,
        file_name: Option<String>,
    ) -> PluginResult<DownloadResponse> {
        if url.trim().is_empty() {
            return Err("更新地址无效".to_string());
        }
        let request = DownloadRequest { url, file_name };
        self.0
            .run_mobile_plugin("downloadAndInstall", request)
            .map_err(|err| err.to_string())
    }

    pub fn open_install_permission_settings(&self) -> PluginResult<()> {
        self.0
            .run_mobile_plugin::<()>("openInstallPermissionSettings", ())
            .map_err(|err| err.to_string())
    }

    pub fn save_apk_to_downloads(
        &self,
        source_file_path: String,
        file_name: String,
    ) -> PluginResult<SaveToDownloadsResponse> {
        if source_file_path.trim().is_empty() {
            return Err("源文件路径无效".to_string());
        }
        if file_name.trim().is_empty() {
            return Err("文件名无效".to_string());
        }
        let request = SaveToDownloadsRequest {
            source_file_path,
            file_name,
        };
        self.0
            .run_mobile_plugin("saveApkToDownloads", request)
            .map_err(|err| err.to_string())
    }
}
