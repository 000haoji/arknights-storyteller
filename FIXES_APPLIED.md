# 修复说明 - 肉鸽标题和主线笔记

## 🔧 已应用的修复

### 1. **肉鸽友好标题提取**

**问题**：肉鸽剧情显示的是 `month_chat_rogue_1_1_1` 这样的英文文件名

**修复**：
- 从 `roguelike_topic_table.json` 中提取 `endbookName`（终章名称）
- 提取 `chatDesc`（月度聊天描述）
- 提取 `title`（其他标题字段）
- 代码位置：`data_service.rs:2075-2133`

**效果**：
- `endbook_rogue_2_1_1` → **"十字路口"**
- `endbook_rogue_2_1_2` → **"窃取神迹"**
- `endbook_rogue_2_1_3` → **"枯萎之声"**
- 月度聊天根据楼层显示友好标题

### 2. **主线笔记路径修复**

**问题**：点击主线笔记后显示"加载失败"

**原因**：
- `zone_table.json` 中的路径是 `Obt/Record/main_10/text_main_10_note_1`
- 文件系统实际路径是 `obt/record/main_10/text_main_10_note_1.txt`
- 需要路径规范化

**修复**：
- 添加路径规范化：`.to_ascii_lowercase()`
- 代码位置：`data_service.rs:2390-2393`

**效果**：
- 现在可以正确加载所有主线笔记
- 显示友好标题：`笔记 10-2`, `笔记 11-5` 等

### 3. **数据源整合**

修改从 3 个数据源提取肉鸽信息：

| 数据源 | 用途 | 提取内容 |
|--------|------|---------|
| `story_review_meta_table.json` | meta信息 | contentPath 映射 |
| `story_table.json` | roguelike关卡 | ro1-ro5 的关卡剧情 |
| `roguelike_topic_table.json` | **rogue剧情** | 月度聊天、终章、挑战 + 友好标题 |

## 📝 关键代码修改

### 标题提取逻辑（data_service.rs:2096-2102）
```rust
// 提取标题
if let Some(name) = obj.get("endbookName").and_then(|v| v.as_str()) {
    title = Some(name.to_string());
} else if let Some(name) = obj.get("chatDesc").and_then(|v| v.as_str()) {
    title = Some(name.to_string());
} else if let Some(name) = obj.get("title").and_then(|v| v.as_str()) {
    title = Some(name.to_string());
}
```

### 优先级策略（data_service.rs:2242-2247）
```rust
let name = explicit_title
    .filter(|s| !s.trim().is_empty())
    .or_else(|| path_desc_map.get(&lower).cloned())
    .unwrap_or_else(|| {
        story_id.split('/').last().unwrap_or(&story_id).to_string()
    });
```

## ✅ 编译状态

- ✅ Rust后端：编译通过
- ✅ TypeScript前端：类型检查通过  
- ✅ Linter：无错误

## 🚀 测试建议

1. 重新编译应用
2. 同步数据
3. 进入"肉鸽"分类，应该看到：
   - 友好的中文标题代替文件名
   - 例如"十字路口"而不是"endbook_rogue_2_1_1"
4. 进入"主线笔记"，应该能正常加载
5. 点击"设置" → "重建剧情索引"以更新搜索

---
*修复时间：2025-10-16*

