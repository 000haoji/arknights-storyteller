# 版本更新指南

## 🚀 快速开始

### 方式一：自动更新（推荐）

使用 npm version 命令自动更新版本号：

```bash
# 补丁版本更新（1.10.45 -> 1.10.46）
npm version patch

# 次版本更新（1.10.45 -> 1.11.0）
npm version minor

# 主版本更新（1.10.45 -> 2.0.0）
npm version major

# 手动指定版本号
npm version 1.11.0
```

**自动完成的操作：**
- ✅ 更新 `package.json` 版本号
- ✅ 运行 `sync-version` 脚本同步所有配置文件
- ✅ 自动 `git add` 所有修改的文件
- ✅ 创建 git tag

### 方式二：手动更新

```bash
# 1. 编辑 package.json，修改 version 字段
vim package.json

# 2. 运行同步脚本
npm run sync-version

# 3. 提交更改
git add .
git commit -m "chore: bump version to x.y.z"
git tag vx.y.z
```

## 📋 自动同步的文件

运行 `npm run sync-version` 会自动更新以下文件：

| 文件 | 更新内容 |
|------|---------|
| `src-tauri/Cargo.toml` | `version = "x.y.z"` |
| `src-tauri/tauri.conf.json` | `version` 和 `android.versionCode` |
| `src-tauri/gen/android/app/tauri.properties` | `versionName` 和 `versionCode` |

## 🔢 版本号规则

### versionCode 计算公式

```
versionCode = 主版本 × 10000 + 次版本 × 100 + 补丁版本
```

**示例：**
- 1.10.45 → versionCode = 1 × 10000 + 10 × 100 + 45 = **11045**
- 2.0.0 → versionCode = 2 × 10000 + 0 × 100 + 0 = **20000**
- 1.11.0 → versionCode = 1 × 10000 + 11 × 100 + 0 = **11100**

### ⚠️ 重要提醒

**versionCode 必须递增！**

- ✅ 正确：1.10.45 (11045) → 1.10.46 (11046)
- ✅ 正确：1.10.45 (11045) → 1.11.0 (11100)
- ❌ 错误：1.10.45 (11045) → 1.2.0 (10200) ← versionCode 降低，会导致 Android 无法安装

## 🔍 验证版本号

### 查看当前版本

```bash
# 查看 package.json 版本
npm version

# 运行同步脚本（会显示当前版本信息）
npm run sync-version
```

### 构建后验证

```bash
# 构建 APK
cd arknights-story-reader
npm run tauri android build

# 使用 aapt 查看 APK 版本信息
aapt dump badging src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk | grep version
```

## 🛠️ 脚本说明

### sync-version.js

位置：`scripts/sync-version.js`

**功能：**
1. 从 `package.json` 读取版本号（唯一数据源）
2. 根据版本号计算 Android versionCode
3. 自动更新所有相关配置文件
4. 显示更新详情和状态

**输出示例：**
```
🔄 开始同步版本号...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 从 package.json 读取版本: 1.10.45
🔢 计算 Android versionCode: 11045

📝 更新配置文件:
✅ 已更新 Cargo.toml -> 1.10.45
✅ 已更新 tauri.conf.json -> 1.10.45 (versionCode: 11045)
✅ 已更新 tauri.properties -> 1.10.45 (versionCode: 11045)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ 完成! 已更新 3 个文件
```

## 📚 相关文档

- [ANDROID_VERSION_FIX.md](../ANDROID_VERSION_FIX.md) - Android 版本号问题的详细说明
- [package.json](./package.json) - 项目配置和脚本定义

