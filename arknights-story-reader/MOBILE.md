# 移动端开发指南

## ✅ 已完成的移动端适配

### 1. 数据同步策略
- **统一使用 HTTP 下载** - 不依赖 git，直接从 GitHub 下载 ZIP 包
- **跨平台兼容** - 使用 `reqwest` (rustls-tls) + `zip` 纯 Rust 实现
- **移动端友好** - 无需系统 git 命令，无 libgit2 原生库依赖

### 2. 权限配置
- **Android** - `AndroidManifest.xml` 已包含 `INTERNET` 权限
- **iOS** - 默认允许 HTTPS 请求，无需额外配置

### 3. UI 优化
- **手机尺寸** - 桌面窗口默认 414x896 (iPhone 尺寸)
- **触摸优化** - 底部导航栏、大按钮、触摸友好的交互
- **移动端布局** - 适配小屏幕的卡片和列表

## 🚀 运行移动端

### Android

1. **开发模式**（需要 Android Studio + NDK）
   ```bash
   npm run tauri android dev
   ```

2. **构建 APK**
   ```bash
   npm run tauri android build
   ```

3. **前置条件**
   - Android Studio
   - Android SDK (API 24+)
   - NDK
   - 已连接的 Android 设备或模拟器

### iOS

1. **开发模式**（需要 Xcode + 真机/模拟器）
   ```bash
   npm run tauri ios dev
   ```

2. **构建**
   ```bash
   npm run tauri ios build
   ```

3. **前置条件**
   - Xcode 14+
   - macOS
   - iOS 13+
   - 开发者证书（真机测试需要）

## 📂 数据存储位置

### Android
- 数据目录: `/data/data/com.arknights.storyreader/files/`
- ArknightsGameData: `files/ArknightsGameData/`
- 版本信息: `files/ArknightsGameData/version.json`

### iOS
- 数据目录: `~/Library/Application Support/com.arknights.storyreader/`
- ArknightsGameData: `Application Support/ArknightsGameData/`
- 版本信息: `Application Support/ArknightsGameData/version.json`

### 桌面端
- macOS: `~/Library/Application Support/com.arknights.storyreader/`
- Windows: `%APPDATA%/com.arknights.storyreader/`
- Linux: `~/.local/share/com.arknights.storyreader/`

## 🔧 技术细节

### 为什么不用 git2？

移动端问题：
- ❌ libgit2 需要原生编译和链接
- ❌ Android NDK 交叉编译复杂
- ❌ iOS 需要额外的 OpenSSL/zlib 配置
- ❌ 移动设备无 git 命令可退路

使用 HTTP + ZIP 的优势：
- ✅ 纯 Rust 实现，无原生依赖
- ✅ rustls-tls 不依赖系统 OpenSSL
- ✅ 支持进度回调
- ✅ 下载可中断（网络问题时可重试）
- ✅ 文件更小（约 500MB ZIP vs 完整 git 历史）

### 数据同步流程

1. **获取最新版本** - 调用 GitHub API `/repos/{owner}/{repo}/commits/master`
2. **下载 ZIP** - 从 `codeload.github.com` 下载指定 commit 的 ZIP
3. **流式解压** - 边下载边解压，实时显示进度
4. **替换数据** - 解压完成后替换旧数据目录
5. **保存版本** - 写入 `version.json` 记录当前版本和时间

### 依赖说明

```toml
reqwest = { 
  version = "0.12", 
  default-features = false, 
  features = ["blocking", "json", "rustls-tls"] 
}
```
- `blocking` - 同步 API（简化代码）
- `json` - JSON 解析支持
- `rustls-tls` - 纯 Rust 的 TLS 实现，无系统依赖

```toml
zip = { 
  version = "0.6.6", 
  default-features = false, 
  features = ["deflate"] 
}
```
- `deflate` - ZIP 解压缩支持
- 纯 Rust 实现，跨平台兼容

## 🐛 调试

### Android 日志
```bash
# 查看 Rust 日志
npm run tauri android dev
# 或使用 adb
adb logcat | grep RustStdout
```

### iOS 日志
```bash
# Xcode 控制台会显示所有日志
npm run tauri ios dev
```

### 常见问题

**Q: Android 下载失败？**
- 检查设备网络连接
- 检查是否有防火墙/代理阻止
- 确认 INTERNET 权限已授予

**Q: iOS 下载慢？**
- GitHub codeload 可能在某些地区较慢
- 考虑使用代理或镜像（未来功能）

**Q: 数据占用空间？**
- 约 500-600MB（仅数据文件，无 git 历史）
- 可在应用设置中查看

## 🎯 移动端测试清单

- [ ] 数据同步成功（下载 + 解压）
- [ ] 进度条正常显示
- [ ] 版本信息正确
- [ ] 剧情列表加载
- [ ] 剧情阅读流畅
- [ ] 搜索功能正常
- [ ] 主题切换生效
- [ ] 触摸滑动流畅
- [ ] 横竖屏切换正常

