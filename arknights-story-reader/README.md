# 明日方舟剧情阅读器

一个基于 Tauri 2.0 + React + TypeScript 构建的明日方舟剧情阅读器，提供类似小说阅读器的舒适体验。

## ✨ 特性

- 📚 **小说式阅读体验** - 将游戏剧情脚本解析为易读的文本格式
- 🌓 **深色/浅色主题** - 支持主题切换，保护眼睛
- 📱 **移动端优化** - 完美支持手机触控操作
- 🔍 **全文搜索** - 快速查找剧情内容
- 📂 **章节分类** - 按主线、活动等分类浏览剧情
- 🔄 **智能同步** - 
  - 实时显示下载进度
  - 版本对比（当前版本 vs 最新版本）
  - 自动检测更新
  - 支持断点续传（Git fetch 特性）

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
   cd arknights-story-reader
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
arknights-story-reader/
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

## 📝 许可证

本项目仅供学习交流使用，剧情内容版权归上海鹰角网络科技有限公司所有。

## 🙏 致谢

- [ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) - 剧情数据来源
- [Tauri](https://tauri.app) - 跨平台框架
- [shadcn/ui](https://ui.shadcn.com) - UI 组件库
