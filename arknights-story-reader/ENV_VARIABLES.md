# 环境变量配置指南

本项目支持通过环境变量配置部分功能。创建 `.env` 文件并设置以下变量：

## 功能开关

### VITE_ENABLE_VIRTUAL_SCROLL
- **类型**：boolean
- **默认值**：`true`
- **说明**：控制虚拟滚动功能
- **用途**：紧急回退机制，如虚拟滚动出现问题可设为 `false`
- **示例**：
  ```bash
  VITE_ENABLE_VIRTUAL_SCROLL=false
  ```

---

## Android 更新配置

### VITE_ANDROID_UPDATE_FEED
- **类型**：string (URL)
- **默认值**：空（不检查更新）
- **说明**：Android 更新源地址
- **支持格式**：
  1. 自定义 JSON manifest
     ```json
     {
       "version": "1.10.50",
       "url": "https://example.com/app.apk",
       "fileName": "storyteller-1.10.50.apk",
       "sha256": "abc123...",
       "notes": "更新内容..."
     }
     ```
  2. GitHub Releases API
     ```
     https://api.github.com/repos/owner/repo/releases/latest
     ```

- **示例**：
  ```bash
  VITE_ANDROID_UPDATE_FEED=https://api.github.com/repos/your-org/your-repo/releases/latest
  ```

### VITE_ANDROID_ANNOUNCEMENTS_URL
- **类型**：string (URL)
- **默认值**：空（无公告）
- **说明**：版本更新公告源
- **格式**：JSON 对象，键为版本号，值为说明文本
  ```json
  {
    "1.10.50": "修复进度丢失问题\n优化性能",
    "1.10.51": "新增虚拟滚动"
  }
  ```

- **示例**：
  ```bash
  VITE_ANDROID_ANNOUNCEMENTS_URL=https://your-cdn.com/announcements.json
  ```

---

## 调试选项

### VITE_ENABLE_VERBOSE_LOGGING
- **类型**：boolean
- **默认值**：`false`
- **说明**：在生产环境启用详细日志（不建议）
- **警告**：⚠️ 会暴露技术细节，仅用于调试线上问题
- **示例**：
  ```bash
  VITE_ENABLE_VERBOSE_LOGGING=true
  ```

---

## 使用方法

### 开发环境
1. 创建 `.env` 文件（已在 .gitignore 中）
2. 添加配置项
3. 重启开发服务器

### 生产构建
```bash
# 方式 1：临时环境变量
VITE_ENABLE_VIRTUAL_SCROLL=false npm run build

# 方式 2：.env.production 文件
echo "VITE_ENABLE_VIRTUAL_SCROLL=false" > .env.production
npm run build
```

---

## 安全注意事项

### CSP 白名单
如果使用自定义更新源，确保 URL 是 HTTPS，否则会被 CSP 阻止。

当前 CSP 配置：
```
connect-src 'self' https:
```

允许所有 HTTPS 连接，但建议在确定所有源后收紧：
```
connect-src 'self' 
  https://api.github.com 
  https://your-custom-domain.com
```

### API 密钥
- ⚠️ **不要**在 .env 文件中存储敏感密钥
- ⚠️ **不要**提交 .env 到 Git
- ✅ 使用 Tauri 的 secure storage 存储敏感信息

---

## 故障排查

### 环境变量未生效？
1. 确认变量名前缀为 `VITE_`
2. 重启开发服务器（热重载不支持环境变量）
3. 检查 `.env` 文件编码为 UTF-8
4. 确认 `.env` 文件在项目根目录

### CSP 阻止请求？
查看浏览器 Console：
```
Content Security Policy: ... violated the following directive: ...
```

根据错误信息调整 `tauri.conf.json` 中的 CSP。

---

## 示例配置文件

`.env` 完整示例：
```bash
# 功能开关
VITE_ENABLE_VIRTUAL_SCROLL=true

# Android 更新
VITE_ANDROID_UPDATE_FEED=https://api.github.com/repos/your-org/arknights-storyteller/releases/latest
VITE_ANDROID_ANNOUNCEMENTS_URL=https://raw.githubusercontent.com/your-org/arknights-storyteller/main/android-announcements.json

# 调试（仅开发环境）
VITE_ENABLE_VERBOSE_LOGGING=false
```

---

**最后更新**：2025-11-01  
**维护者**：开发团队

