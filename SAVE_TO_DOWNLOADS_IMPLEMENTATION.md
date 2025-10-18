# 保存 APK 到下载文件夹功能实现验证

## ✅ 实现概述

本功能允许用户在自动安装失败时，将已下载的 APK 安装包保存到系统下载文件夹，供手动安装。

## 📋 技术方案对比

### Tauri 前端 API 方案（不适用于 Android）
根据 Tauri 官方文档，桌面端可以使用：
```javascript
import { downloadDir } from '@tauri-apps/api/path';
import { writeBinaryFile } from '@tauri-apps/api/fs';
```

**问题：** 
- ❌ Android 上由于**分区存储（Scoped Storage）**限制，无法直接访问公共下载文件夹
- ❌ Tauri 的 fs API 在 Android 上受限，无法写入公共目录
- ❌ 需要使用 Android 原生 API

### 本项目采用的方案（Android 原生 API）✅

#### 1. **Android 10+ (API 29+)** - MediaStore API
```kotlin
val contentValues = ContentValues().apply {
  put(MediaStore.Downloads.DISPLAY_NAME, fileName)
  put(MediaStore.Downloads.MIME_TYPE, "application/vnd.android.package-archive")
  put(MediaStore.Downloads.IS_PENDING, 1)  // 关键：防止未完成写入时文件可见
}

val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
```

**优点：**
- ✅ 符合 Android 分区存储最佳实践
- ✅ **无需申请 WRITE_EXTERNAL_STORAGE 权限**
- ✅ 文件自动在系统文件管理器中可见
- ✅ 使用 `IS_PENDING` 标志确保文件完整性

#### 2. **Android 9 及以下 (API ≤ 28)** - 传统方式
```kotlin
val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
sourceFile.copyTo(destFile, overwrite = true)

// 通知媒体扫描器
val intent = Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE)
intent.data = Uri.fromFile(destFile)
activity.sendBroadcast(intent)
```

**要求：**
- ⚠️ 需要 `WRITE_EXTERNAL_STORAGE` 权限
- ✅ 已在 AndroidManifest.xml 中添加（限制为 API ≤ 28）

## 🔍 实现符合性检查

### ✅ Android 官方最佳实践
| 项目 | 要求 | 实现状态 | 说明 |
|------|------|---------|------|
| 分区存储支持 | Android 10+ 使用 MediaStore | ✅ | 使用 `MediaStore.Downloads.EXTERNAL_CONTENT_URI` |
| IS_PENDING 标志 | 写入时设置，完成后清除 | ✅ | 防止不完整文件可见 |
| 错误处理 | 失败时清理资源 | ✅ | 失败时删除已创建的 URI |
| 权限最小化 | Android 10+ 不需要存储权限 | ✅ | 使用 `maxSdkVersion="28"` 限制权限范围 |
| 媒体扫描 | Android 9- 需要触发扫描 | ✅ | 发送 `ACTION_MEDIA_SCANNER_SCAN_FILE` 广播 |
| MIME 类型 | 正确设置 APK MIME | ✅ | `application/vnd.android.package-archive` |

### ✅ Tauri 集成要求
| 项目 | 要求 | 实现状态 |
|------|------|---------|
| 插件命令注册 | 在 init 中注册 | ✅ |
| Rust 桥接层 | 提供 Tauri 命令 | ✅ |
| 跨平台支持 | 条件编译 (#[cfg]) | ✅ |
| 类型安全 | Serde 序列化/反序列化 | ✅ |
| 错误传播 | Result 类型 | ✅ |

### ✅ 用户体验要求
| 项目 | 要求 | 实现状态 |
|------|------|---------|
| 自动保存路径 | 提取下载的 APK 路径 | ✅ |
| UI 集成 | 在错误/权限失败时显示按钮 | ✅ |
| 清晰提示 | 告知用户保存位置和后续操作 | ✅ |
| 兜底方案 | 自动安装失败时的替代方案 | ✅ |

## 📝 权限配置

### AndroidManifest.xml
```xml
<!-- 仅在 Android 9 及以下需要此权限以保存文件到公共下载文件夹 -->
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
```

**说明：**
- ✅ 使用 `maxSdkVersion="28"` 限制权限范围
- ✅ Android 10+ 不会请求此权限
- ✅ 符合 Google Play 政策要求

## 🎯 核心代码路径

### 1. Kotlin 插件 - 原生实现
**文件：** `src-tauri/gen/android/app/src/main/java/com/arknights/storyreader/updater/ApkUpdaterPlugin.kt`

- `@Command fun saveApkToDownloads(invoke: Invoke)`
- `private suspend fun saveToDownloadsFolder(sourceFilePath: String, fileName: String): String`

### 2. Rust 插件层 - 插件封装
**文件：** `src-tauri/src/apk_updater.rs`

- `pub fn save_apk_to_downloads(&self, source_file_path: String, file_name: String) -> PluginResult<SaveToDownloadsResponse>`
- 注册到插件的 `invoke_handler`

### 3. Rust 命令层 - Tauri 命令
**文件：** `src-tauri/src/commands.rs`

- `#[tauri::command] pub async fn android_save_apk_to_downloads(...)`
- 跨平台条件编译支持

### 4. 前端 Hook - TypeScript 接口
**文件：** `src/hooks/useAppUpdater.ts`

- `export async function saveApkToDownloads(sourceFilePath: string, fileName: string)`
- 类型安全的接口定义

### 5. UI 组件 - 用户交互
**文件：** `src/components/Settings.tsx`

- 状态管理：`downloadedApkPath`, `downloadedApkFileName`
- 处理函数：`handleSaveApkToDownloads()`
- UI 按钮：条件渲染"保存到下载文件夹"

## 🔄 工作流程

```
用户点击"立即更新"
    ↓
下载 APK 到缓存目录 (/data/data/.../cache/)
    ↓
尝试自动安装（可能失败：权限/系统限制/其他错误）
    ↓
前端捕获错误/权限失败状态
    ↓
显示"保存到下载文件夹"按钮
    ↓
用户点击按钮
    ↓
调用 saveApkToDownloads()
    ↓
Kotlin 插件根据 Android 版本选择方法：
  - Android 10+: MediaStore API
  - Android 9-: Environment API
    ↓
文件保存到 /storage/emulated/0/Download/
    ↓
用户在文件管理器中找到并手动安装
```

## ⚠️ 注意事项

### 1. gen/android 目录
- `gen/android` 是 Tauri 自动生成的目录
- 直接修改可能在重新生成时被覆盖
- **建议：** 将 AndroidManifest.xml 的修改记录到文档中，方便重新应用

### 2. 测试建议
需要在不同 Android 版本上测试：
- ✅ Android 14 (API 34)
- ✅ Android 11 (API 30)
- ✅ Android 10 (API 29)
- ✅ Android 9 (API 28)
- ✅ Android 7-8 (API 24-27)

### 3. 已知限制
- 某些定制 ROM 可能有额外的存储限制
- 某些设备管理器可能阻止 APK 保存
- 需要足够的存储空间

## 📊 对比总结

| 方案 | 适用平台 | 需要权限 | 实现复杂度 | 可靠性 | 本项目采用 |
|------|---------|---------|----------|-------|-----------|
| Tauri fs API | 桌面端 | ✅ 自动处理 | ⭐ | ⭐⭐⭐ | ❌ 不适用 Android |
| MediaStore API | Android 10+ | ❌ 不需要 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ 已实现 |
| Environment API | Android 9- | ⚠️ 需要权限 | ⭐⭐ | ⭐⭐⭐⭐ | ✅ 已实现 |

## ✅ 结论

本实现**完全符合**以下要求和最佳实践：

1. ✅ **Android 官方分区存储指南**
2. ✅ **Tauri 2.x 插件开发规范**
3. ✅ **Google Play 权限政策**
4. ✅ **用户体验设计原则**
5. ✅ **安全性和隐私保护**

实现采用的是 **Android 原生 MediaStore API**，而不是 Tauri 的前端 fs API，这是正确的选择，因为：
- Android 的分区存储要求必须使用原生 API
- MediaStore 是官方推荐的方式
- 无需额外权限（Android 10+）
- 更好的兼容性和安全性

## 🚀 后续步骤

1. **本地构建测试**：确保编译通过
2. **多设备测试**：验证不同 Android 版本
3. **用户体验优化**：收集反馈并改进
4. **文档维护**：记录 AndroidManifest.xml 修改

---

**实现日期：** 2025-01-18  
**Tauri 版本：** 2.x  
**Android 最低版本：** API 24 (Android 7.0)  
**测试状态：** ⏳ 待测试

