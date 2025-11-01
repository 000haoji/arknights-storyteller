#[cfg(test)]
mod edge_case_tests {
    use super::super::*;

    #[test]
    fn test_empty_dialogue() {
        let content = r#"[name="角色名"]
[name="另一角色"]  "#;
        let result = parse_story_text(content);
        // 空对话应该被过滤
        assert_eq!(result.segments.len(), 0);
    }

    #[test]
    fn test_nested_html_tags() {
        let content = r#"[name="角色"] <p>这是<b>嵌套</b>的<i>HTML</i>标签</p>"#;
        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 1);
        match &result.segments[0] {
            StorySegment::Dialogue { text, .. } => {
                // HTML 标签应该被清除
                assert!(!text.contains("<b>"));
                assert!(!text.contains("</b>"));
                assert!(text.contains("嵌套"));
            }
            _ => panic!("Expected dialogue"),
        }
    }

    #[test]
    fn test_consecutive_same_speaker() {
        let content = r#"[name="杜宾"] 第一句话
[name="杜宾"] 第二句话
[name="杜宾"] 第三句话"#;
        let result = parse_story_text(content);
        // 相同说话人的连续对话应该被合并
        assert_eq!(result.segments.len(), 1);
        match &result.segments[0] {
            StorySegment::Dialogue { text, .. } => {
                assert!(text.contains("第一句话"));
                assert!(text.contains("第二句话"));
                assert!(text.contains("第三句话"));
            }
            _ => panic!("Expected dialogue"),
        }
    }

    #[test]
    fn test_decision_with_empty_options() {
        let content = r#"[Decision(options="选项1;;选项2;", values="1;;2;")]"#;
        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 1);
        match &result.segments[0] {
            StorySegment::Decision { options, .. } => {
                // 空选项应该被过滤
                assert_eq!(options.len(), 2);
                assert_eq!(options[0], "选项1");
                assert_eq!(options[1], "选项2");
            }
            _ => panic!("Expected decision"),
        }
    }

    #[test]
    fn test_full_width_spaces_and_punctuation() {
        let content = r#"[name="角色"]　　这是全角空格，还有全角标点。"#;
        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 1);
        match &result.segments[0] {
            StorySegment::Dialogue { text, .. } => {
                // 全角空格应该被转换为半角
                assert!(!text.contains('　'));
                assert!(text.contains("这是全角空格"));
            }
            _ => panic!("Expected dialogue"),
        }
    }

    #[test]
    fn test_multi_line_dialogue_with_paragraph_tags() {
        let content = r#"[name="角色"] 第一行<p>第二行</p>第三行"#;
        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 1);
        match &result.segments[0] {
            StorySegment::Dialogue { text, .. } => {
                // <p> 标签应该转换为换行
                assert!(text.contains('\n'));
                assert!(text.contains("第一行"));
                assert!(text.contains("第二行"));
            }
            _ => panic!("Expected dialogue"),
        }
    }

    #[test]
    fn test_nickname_placeholder() {
        let content = r#"[name="角色"] {@nickname}，你好！"#;
        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 1);
        match &result.segments[0] {
            StorySegment::Dialogue { text, .. } => {
                // {@nickname} 应该被替换为"博士"
                assert_eq!(text, "博士，你好！");
            }
            _ => panic!("Expected dialogue"),
        }
    }

    #[test]
    fn test_very_long_dialogue() {
        let long_text = "这是一段非常长的对话。".repeat(100);
        let content = format!(r#"[name="角色"] {}"#, long_text);
        let result = parse_story_text(&content);
        assert_eq!(result.segments.len(), 1);
        match &result.segments[0] {
            StorySegment::Dialogue { text, .. } => {
                assert!(text.len() > 1000);
                assert!(text.contains("这是一段非常长的对话"));
            }
            _ => panic!("Expected dialogue"),
        }
    }

    #[test]
    fn test_special_characters_in_names() {
        let content = r#"[name="角色#1_test"] 对话内容"#;
        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 1);
        match &result.segments[0] {
            StorySegment::Dialogue { character_name, .. } => {
                // 特殊字符应该被保留或正确处理
                assert!(!character_name.is_empty());
            }
            _ => panic!("Expected dialogue"),
        }
    }

    #[test]
    fn test_malformed_tags() {
        // 不完整的标签
        let content = r#"[name="角色" 对话（缺少闭合引号和方括号
下一行文本"#;
        let result = parse_story_text(content);
        // 应该能够容错处理，不崩溃
        assert!(result.segments.len() >= 0);
    }

    #[test]
    fn test_whitespace_only_dialogue() {
        let content = r#"[name="角色"]    
[name="另一个"]   
  "#;
        let result = parse_story_text(content);
        // 仅空白的对话应该被过滤
        assert_eq!(result.segments.len(), 0);
    }
}

