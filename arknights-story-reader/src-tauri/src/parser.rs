use regex::Regex;
use lazy_static::lazy_static;
use crate::models::{StorySegment, ParsedStoryContent};

lazy_static! {
    // 匹配对话：[name="角色名"] 文本内容
    static ref DIALOGUE_RE: Regex = Regex::new(r#"\[name="([^"]+)"\]\s*(.+)"#).unwrap();
    
    // 匹配选项：[Decision(options="选项1;选项2;选项3", values="1;2;3")]
    static ref DECISION_RE: Regex = Regex::new(r#"\[Decision\(options="([^"]+)"#).unwrap();
    
    // 匹配指令行（需要过滤掉）
    static ref COMMAND_RE: Regex = Regex::new(r"^\[(?:HEADER|Dialog|Character|PlayMusic|Background|Blocker|Delay|Image|ImageTween|PlaySound|StopMusic|Predicate)\b").unwrap();
}

pub fn parse_story_text(content: &str) -> ParsedStoryContent {
    let mut segments = Vec::new();
    let mut current_character: Option<String> = None;
    
    for line in content.lines() {
        let line = line.trim();
        
        // 跳过空行和指令行
        if line.is_empty() || COMMAND_RE.is_match(line) {
            continue;
        }
        
        // 解析对话
        if let Some(captures) = DIALOGUE_RE.captures(line) {
            let character_name = captures.get(1).unwrap().as_str().to_string();
            let text = captures.get(2).unwrap().as_str().to_string();
            
            current_character = Some(character_name.clone());
            
            segments.push(StorySegment::Dialogue {
                character_name,
                text,
            });
            continue;
        }
        
        // 解析选项
        if let Some(captures) = DECISION_RE.captures(line) {
            let options_str = captures.get(1).unwrap().as_str();
            let options: Vec<String> = options_str
                .split(';')
                .map(|s| s.trim().to_string())
                .collect();
            
            segments.push(StorySegment::Decision { options });
            continue;
        }
        
        // 如果是纯文本且前面有角色名，认为是该角色的对话
        if let Some(ref character) = current_character {
            if !line.starts_with('[') {
                segments.push(StorySegment::Dialogue {
                    character_name: character.clone(),
                    text: line.to_string(),
                });
                continue;
            }
        }
        
        // 其他情况，如果不是指令，就作为旁白
        if !line.starts_with('[') && !line.is_empty() {
            segments.push(StorySegment::Narration {
                text: line.to_string(),
            });
        }
    }
    
    ParsedStoryContent { segments }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_dialogue() {
        let content = r#"[name="杜宾"]  可恶......
[name="杜宾"]  这里，究竟怎么了？"#;
        
        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 2);
        
        if let StorySegment::Dialogue { character_name, text } = &result.segments[0] {
            assert_eq!(character_name, "杜宾");
            assert_eq!(text, "可恶......");
        } else {
            panic!("Expected dialogue segment");
        }
    }

    #[test]
    fn test_parse_decision() {
        let content = r#"[Decision(options="早就该交给我了！;......;简单，我会轻松解决的。", values="1;2;3")]"#;
        
        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 1);
        
        if let StorySegment::Decision { options } = &result.segments[0] {
            assert_eq!(options.len(), 3);
            assert_eq!(options[0], "早就该交给我了！");
        } else {
            panic!("Expected decision segment");
        }
    }
}


