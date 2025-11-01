# 开发指南

## 快速开始

### 环境要求
- Node.js >= 20
- Rust >= 1.70
- Tauri CLI 2.x

### 安装依赖
```bash
npm install
cd src-tauri && cargo build
```

### 开发模式
```bash
npm run dev:tauri
```

## 代码质量

### TypeScript 类型检查
```bash
npm run type-check
```

### 代码格式化
```bash
# 检查格式
npm run format:check

# 自动格式化
npm run format
```

### Linting
```bash
# 检查代码质量
npm run lint

# 自动修复
npm run lint:fix
```

### Rust 检查
```bash
cd src-tauri

# 格式化检查
cargo fmt --check

# 格式化修复
cargo fmt

# Clippy 检查
cargo clippy --all-targets -- -D warnings

# 运行测试
cargo test
```

## 性能分析

### 前端性能
```bash
npm run build
npx vite-bundle-visualizer
```

### Rust 性能
```bash
cd src-tauri
cargo build --release
cargo bloat --release
```

## 日志系统

项目使用统一的日志工具 `@/lib/logger`，自动根据环境过滤日志：

```typescript
import { logger } from "@/lib/logger";

// 开发环境输出，生产环境不输出
logger.debug("Tag", "调试信息");
logger.info("Tag", "普通信息");

// 所有环境都输出
logger.warn("Tag", "警告");
logger.error("Tag", "错误", error);
```

**注意**：
- 请勿直接使用 `console.log/info/debug`
- 错误和警告可以使用 `logger.warn/error`
- 新代码请使用 logger 工具

## 虚拟滚动

滚动模式下自动启用虚拟化渲染，仅渲染可见窗口内的段落：

- 估算高度按段落类型动态调整
- 实际渲染后自动测量精确高度
- 缓冲区设置为上下各 5 条

性能收益：
- 长文（1000+段）DOM 节点减少 95%
- 渲染时间缩短 3-10 倍
- 滚动帧率提升至 60fps

## 构建

### 前端生产构建
```bash
npm run build
```

输出：
- `dist/` - 前端静态资源
- Vendor chunks: react-vendor, tauri-vendor, ui-vendor
- 自动 tree-shaking 和压缩

### Tauri 桌面端构建
```bash
npm run tauri build
```

### Android APK 构建
```bash
bash scripts/build-apk.sh
```

## 测试（规划中）

### 单元测试
```bash
# 前端
npm run test

# Rust
cd src-tauri && cargo test
```

### E2E 测试
```bash
npx playwright test
```

## 安全

### 内容安全策略（CSP）
已配置最小权限 CSP，限制：
- 脚本仅允许同源 + WASM
- 连接仅允许 GitHub API/下载源
- 禁止外部嵌入（frame-ancestors）

### 完整性校验
- APK 下载支持 SHA-256 校验（manifest 需提供）
- ZIP 下载校验 Content-Length

### 依赖审计
```bash
# 前端
npm audit

# Rust
cd src-tauri && cargo audit
```

## 版本管理

版本号在以下文件中保持同步：
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

更新版本：
```bash
npm version patch/minor/major
# 自动运行 sync-version 脚本
```

## 故障排查

### 进度丢失问题
- 已使用 `storyId` 作为主键（v1.10.50+）
- 旧版本数据会自动迁移

### 虚拟滚动定位不准
- 检查 `estimatedItemSize` 配置
- 查看浏览器控制台是否有测量错误

### 搜索结果陈旧
- 缓存 TTL 为 24 小时
- 点击"刷新缓存"强制重新搜索

## 贡献指南

1. Fork 仓库
2. 创建特性分支
3. 编写代码并确保通过 lint/type-check
4. 提交 PR（CI 会自动检查）

### 提交规范
```
feat: 添加新功能
fix: 修复 bug
perf: 性能优化
refactor: 重构
docs: 文档更新
style: 代码格式
test: 测试相关
chore: 构建/工具链
```

## 许可证

见根目录 LICENSE 文件

