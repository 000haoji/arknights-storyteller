# 性能优化检查清单

本清单用于验证已实施的性能优化是否正常工作，以及发现潜在性能问题。

## 虚拟滚动验证

### 手动测试步骤
1. 打开超长章节（如主线第 11 章，1000+ 段落）
2. 打开开发者工具 → Elements 面板
3. 切换到滚动模式
4. **预期结果**：
   - DOM 树中只有 ~30-40 个 segment 节点
   - 滚动时节点数保持稳定（不增长）
   - 滚动流畅，帧率 60fps

### 性能监控
```javascript
// 在浏览器 Console 中运行
const segments = document.querySelectorAll('[data-segment-index]');
console.log('当前渲染段落数:', segments.length);
console.log('总段落数:', /* 从 UI 读取或查询 */);
```

### 常见问题
- **Q**: 滚动时定位偏移？
  - **A**: 检查段落实际高度与估算差异，调整 `estimatedItemSize`

- **Q**: 虚拟滚动未启用？
  - **A**: 确认在滚动模式（非分页模式）

---

## 懒加载验证

### 检查 Network 面板
1. 打开应用（首屏在"剧情列表"）
2. Network 面板 → JS 类别
3. **预期加载**：
   - `index-XXXXX.js` (主包)
   - `react-vendor-XXXXX.js`
   - `tauri-vendor-XXXXX.js`
   - `ui-vendor-XXXXX.js`

4. 切换到"搜索"标签
5. **预期延迟加载**：
   - `SearchPanel-XXXXX.js`

6. 切换到其他标签，验证对应 chunk 按需加载

### 预期体积
```
react-vendor: ~180 KB
tauri-vendor: ~145 KB
ui-vendor:    ~95 KB
index:        ~420 KB
─────────────────────
首屏总计:     ~840 KB
```

---

## 搜索缓存验证

### 测试步骤
1. 搜索"博士"（首次，未缓存）
   - 记录响应时间（T1）
2. 再次搜索"博士"
   - **预期**：提示"已从缓存恢复"
   - 响应时间 < 100ms
3. 点击"刷新缓存"
   - **预期**：重新执行搜索
4. 修改系统时间为 25 小时后（或等待 24h）
   - **预期**：缓存自动过期，重新搜索

### 缓存容量检查
```javascript
// Console 中运行
const cache = JSON.parse(localStorage.getItem('arknights-story-search-cache-v1'));
console.log('缓存条目数:', Object.keys(cache).length);
// 预期：≤ 20
```

---

## 日志收敛验证

### 生产构建检查
```bash
npm run build
cd dist
grep -r "console.log" assets/*.js
# 预期：0 结果（或仅保留 logger 的 warn/error）
```

### 运行时验证
1. 构建生产版本
2. 打开应用
3. 控制台应为空（无 debug/info 日志）
4. 触发错误操作（如搜索失败）
5. **预期**：仅显示 error 日志

---

## CSP 兼容性验证

### 测试清单
- [ ] 字体正常加载（NotoSans/LXGW）
- [ ] GitHub API 调用成功（版本检查）
- [ ] 数据同步成功（下载 ZIP）
- [ ] 无 CSP 违规错误（Console）
- [ ] 图标/图片正常显示

### CSP 错误检查
打开 Console，搜索：
```
Content Security Policy
```
**预期**：0 结果

---

## 内存泄漏检查

### Chrome DevTools Memory Profiling
1. 打开 Performance Monitor
2. 执行以下操作序列：
   - 打开长章节 → 滚动至底部 → 返回
   - 重复 10 次
3. **监控指标**：
   - JS Heap: 应稳定，无持续增长
   - DOM Nodes: 应回落到初始值
   - Event Listeners: 不应累积

### 堆快照对比
```
操作前拍快照 A
↓
阅读 5 个章节（完整滚动）
↓
全部返回到列表
↓
操作后拍快照 B
↓
对比 A 和 B
```
**预期**：Detached DOM 树 < 5 个

---

## 网络性能验证

### 下载超时测试
使用网络限速工具（如 Charles Proxy）：

1. **场景 1**：模拟慢速连接（50KB/s）
   - **预期**：进度正常更新，300s 内完成

2. **场景 2**：模拟连接中断
   - **预期**：20s 内报错（connect_timeout）

3. **场景 3**：模拟不完整响应
   - **预期**：校验失败，删除临时文件

---

## 完整性校验验证

### APK 校验测试
```bash
# 构造假 manifest
{
  "version": "1.10.50",
  "url": "https://example.com/app.apk",
  "sha256": "invalid_hash"
}
```
**预期**：下载后校验失败，删除文件并报错

### ZIP 校验测试
修改 HTTP 响应头 `Content-Length` 与实际不符：
**预期**：报错"下载不完整"

---

## 构建产物检查

### 前端
```bash
npm run build
ls -lh dist/assets/

# 检查点
- index 主包 < 500 KB
- vendor chunks 合理拆分
- 字体文件正确复制到 dist/fonts/
- manifest.json 生成（PWA，如果有）
```

### Rust
```bash
cd src-tauri
cargo build --release

# 检查点
- 二进制大小 < 15 MB（Linux/macOS）
- 无 debug symbols（release 模式）
- strip 后 < 10 MB
```

---

## 回归测试清单

每次优化后必须验证以下功能：

### 核心功能
- [ ] 数据同步/导入成功
- [ ] 主线/活动/支线剧情列表正常
- [ ] 阅读器打开/滚动/翻页正常
- [ ] 搜索返回结果，定位准确
- [ ] 收藏功能正常
- [ ] 线索集创建/导出/导入正常
- [ ] 阅读进度保存/恢复正确

### 进度恢复（重点）
- [ ] 读 A → 退出 → 再进 A（恢复）
- [ ] 读 A → 读 B → 读 A（恢复）
- [ ] 滚动模式 → 分页模式切换（位置近似保持）
- [ ] 搜索跳转不影响进度保存

### 性能
- [ ] 长文（1000+段）滚动流畅
- [ ] 首屏加载 < 2 秒（快速网络）
- [ ] 搜索响应 < 200ms（有索引）
- [ ] 标签切换无卡顿

---

## 性能指标目标

### 核心 Web Vitals（桌面端）
```
FCP (First Contentful Paint):  < 1.2s
LCP (Largest Contentful Paint): < 2.0s
FID (First Input Delay):        < 100ms
CLS (Cumulative Layout Shift):  < 0.1
```

### 移动端目标
```
FCP: < 1.8s
LCP: < 2.5s
FID: < 150ms
TTI (Time to Interactive): < 3.0s
```

### 自定义指标
```
虚拟滚动启用率:        100%（滚动模式）
长文首次渲染:          < 500ms（1000段）
搜索响应（有索引）:    < 200ms
搜索缓存命中率:        > 60%
```

---

## Profiling 工具

### 前端
```bash
# React DevTools Profiler
# Chrome DevTools Performance
# Lighthouse CI

npx lighthouse http://localhost:1450 --view
```

### Rust
```bash
cd src-tauri

# Flamegraph
cargo install flamegraph
cargo flamegraph --bin story-teller

# 二进制体积分析
cargo bloat --release -n 20
```

---

## 持续监控

### 建议指标
- Bundle 大小趋势（每次构建）
- 首屏加载时间（CI 中 Lighthouse）
- 搜索平均响应时间
- 内存占用峰值

### 告警阈值
```
Bundle 大小增长 > 10%  → 警告
FCP 增长 > 20%          → 警告
内存占用 > 500 MB       → 警告
搜索响应 > 1s           → 警告
```

---

**检查清单版本**：1.0  
**最后更新**：2025-11-01  
**下次审查**：每次重大更新后

