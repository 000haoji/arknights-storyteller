# Story Teller

一个基于 Tauri 2.0 + React + TypeScript 构建的剧情阅读器，提供类似小说阅读器的舒适体验。

## ✨ 特性

- 📚 **专业阅读体验** 
  - 小说式排版，对话与旁白区分显示
  - 支持字体切换（系统、内置思源宋体、内置思源黑体、内置霞鹜文楷）
  - 字号、行距、字间距自由调节
  - 阅读设置实时生效并自动保存
  
- 🌓 **深色/浅色主题** - 支持主题切换，保护眼睛

- 📱 **全平台支持**
  - 桌面端（Windows/macOS/Linux）
  - Android（API 24+）
  - iOS（13.0+）
  - 触控优化，完美支持手机操作
  
- 📂 **完整剧情分类**
  - 主线剧情（MAINLINE）
  - 活动剧情（ACTIVITY + MINI_ACTIVITY）
  - 追忆集/干员密录（NONE）
  - 懒加载设计，避免卡顿
  
- 🔍 **全文搜索** - 快速查找剧情内容

- 🔄 **智能同步** 
  - HTTP 直接下载 GitHub ZIP（无需 git）
  - 实时进度条（百分比 + 已下载 MB）
  - 版本对比（当前版本 vs 最新版本）
  - 手动导入 ZIP 功能（网络慢时）
  - 跨平台兼容（桌面/Android/iOS）

## 🚀 技术栈

- **前端框架**: React 18 + TypeScript
- **UI 组件**: shadcn/ui + Tailwind CSS
- **桌面框架**: Tauri 2.0
- **后端语言**: Rust
- **数据来源**: [ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData)

## 📦 安装与运行

### 前置要求

- Node.js 18+
- Rust 1.70+
- 对于移动端开发：
  - Android: Android Studio
  - iOS: Xcode (macOS only)

### 开发环境

1. **克隆项目**
   ```bash
   cd story-teller
   npm install
   ```

2. **运行开发服务器**
   ```bash
   # 桌面端
   npm run tauri dev

   # Android
   npm run tauri android init  # 首次运行
   npm run tauri android dev

   # iOS
   npm run tauri ios init      # 首次运行
   npm run tauri ios dev
   ```

3. **构建生产版本**
   ```bash
   # 桌面端
   npm run tauri build

   # Android
   npm run tauri android build

   # iOS
   npm run tauri ios build
   ```

## 📖 使用说明

### 首次使用

1. 打开应用后，点击右上角的"同步"按钮
2. 应用会自动从 GitHub 克隆 ArknightsGameData 仓库（约 500MB）
3. 同步完成后即可浏览剧情

### 浏览剧情

- **剧情列表**: 在首页浏览按章节分类的剧情
- **阅读界面**: 点击剧情进入阅读，支持上下翻页
- **返回**: 点击左上角返回按钮回到列表

### 搜索功能

1. 切换到"搜索"标签页
2. 输入关键词搜索剧情名称或内容
3. 点击搜索结果直接阅读

### 主题设置

- 在"设置"标签页中切换深色/浅色主题
- 主题设置会自动保存

## 🎨 UI 设计

- **移动端优先**: 采用底部导航栏，便于单手操作
- **触控优化**: 支持滑动翻页（计划中）
- **阅读体验**: 
  - 大字号、宽行距，适合长时间阅读
  - 角色对话与旁白区分显示
  - 选项分支清晰标注

## 📂 项目结构

```
story-teller/
├── src/                      # 前端源码
│   ├── components/          # React 组件
│   │   ├── ui/             # shadcn/ui 基础组件
│   │   ├── StoryReader.tsx # 剧情阅读器
│   │   ├── StoryList.tsx   # 剧情列表
│   │   └── SearchPanel.tsx # 搜索面板
│   ├── services/           # API 服务
│   ├── types/              # TypeScript 类型定义
│   └── lib/                # 工具函数
├── src-tauri/              # Rust 后端
│   └── src/
│       ├── models.rs       # 数据模型
│       ├── parser.rs       # 剧情解析器
│       ├── data_service.rs # 数据服务
│       └── commands.rs     # Tauri 命令
└── ArknightsGameData/      # 剧情数据（首次同步后生成）
```

## 🔧 剧情解析

剧情文本采用自定义脚本格式，解析器会提取：

- **对话**: `[name="角色名"] 对话内容`
- **旁白**: 不带标签的纯文本
- **选项**: `[Decision(options="选项1;选项2")]`

其他指令（音乐、背景、特效等）会被过滤，只保留可读文本。

## 🛠️ 开发计划

- [ ] 滑动翻页支持
- [ ] 阅读进度保存
- [ ] 收藏功能
- [ ] 剧情导出
- [ ] 字体大小调节
- [ ] 更多主题配色

## 🔄 自动更新与发布（CI）

项目已内置 GitHub Actions 流水线（`.github/workflows/release.yml`），推送到 `release` 分支或手动触发时会自动：

1. 在 macOS / Windows / Linux 上并行执行 `tauri build`，利用 `tauri-apps/tauri-action` 生成安装包与 `latest.json`。
2. 调用 `scripts/build-apk.sh` 构建并签名 Android `universal` APK。
3. 将所有产物上传到同一份 GitHub Release（默认草稿），方便检查后再发布。

### 必备密钥与环境变量

| 作用 | GitHub Secret | 内容示例 |
| --- | --- | --- |
| Tauri 更新签名私钥 | `TAURI_SIGNING_PRIVATE_KEY` | `tauri signer generate` 输出的私钥 PEM |
| 私钥密码（可选） | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 无密码可留空 |
| Tauri 更新公钥 | `TAURI_UPDATER_PUBKEY` | `public.key` 内容，用于应用校验 |
| 更新 JSON 地址 | `TAURI_UPDATER_ENDPOINT` | 如 `https://github.com/<owner>/<repo>/releases/latest/download/latest.json` |
| Android keystore（Base64） | `ANDROID_KEYSTORE_B64` | `upload-keystore.jks` 的 `base64` 结果 |
| Android keystore 密码 | `ANDROID_KEYSTORE_PASSWORD` | 生成 keystore 时输入的 store 密码 |
| Android key alias | `ANDROID_KEY_ALIAS` | 默认 `upload` |
| Android key 密码（可选） | `ANDROID_KEY_PASSWORD` | 若与 store 密码不同需配置 |

工作流会在运行时写入 `src-tauri/gen/android/keystore.properties` 以及 keystore 文件，避免泄露到仓库。

### 本地准备

```bash
# 生成 Tauri 更新密钥（默认保存到 ~/.tauri）
npm run tauri signer generate -- -w ~/.tauri/story-teller.key
cat ~/.tauri/story-teller.key      # 填入 TAURI_SIGNING_PRIVATE_KEY
cat ~/.tauri/story-teller.key.pub  # 填入 TAURI_UPDATER_PUBKEY

# 创建 Android upload keystore
keytool -genkey -v -keystore upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
base64 upload-keystore.jks         # 填入 ANDROID_KEYSTORE_B64
```

开发环境下可复制 `.env.example` 为 `.env`，填入上述变量以便调试自动更新。

### 应用内自动更新

- 桌面端已注册 `tauri-plugin-updater` 与 `tauri-plugin-process`，前端的 `useAppUpdater` 会在启动时检测更新。
- 若发现新版本，会弹出确认对话框，下载完成后自动重启。
- 请确保 `TAURI_UPDATER_ENDPOINT` 可通过 HTTPS 访问，并与 Release 中的 `latest.json` 地址一致。

### Android 构建

- CI 默认生成 `app-universal-release-signed.apk`，上传到 Release 中，便于旁载或分发到第三方商店。
- 如需 Play 商店 `.aab`，可在 `scripts/build-apk.sh` 或工作流中新增步骤。
- 构建日志与产物均可在 Actions 对应工作流页面查看。

## 📝 许可证

本项目仅供学习交流使用，剧情内容版权归上海鹰角网络科技有限公司所有。

## 🙏 致谢

- [ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) - 剧情数据来源
- [Tauri](https://tauri.app) - 跨平台框架
- [shadcn/ui](https://ui.shadcn.com) - UI 组件库
