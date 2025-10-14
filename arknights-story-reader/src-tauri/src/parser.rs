use crate::models::{ParsedStoryContent, StorySegment};
use lazy_static::lazy_static;
use regex::Regex;
use std::collections::HashMap;

lazy_static! {
    static ref ATTR_RE: Regex =
        Regex::new(r#"(?i)([a-z0-9_]+)\s*=\s*"([^"]*)""#).expect("invalid attribute regex");
    static ref DECISION_NUMBERED_RE: Regex =
        Regex::new(r#"(?i)option\d+="([^"]+)""#).expect("invalid decision regex");
    static ref GENERIC_TAG_RE: Regex = Regex::new(r#"<[^>]+>"#).expect("invalid generic tag regex");
}

pub fn parse_story_text(content: &str) -> ParsedStoryContent {
    let mut segments = Vec::new();

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        if line.starts_with('[') {
            if let Some(segment) = parse_command_line(line) {
                segments.push(segment);
            }
            continue;
        }

        let text = clean_text(line);
        if !text.is_empty() {
            segments.push(StorySegment::Narration { text });
        }
    }

    ParsedStoryContent { segments }
}

fn parse_command_line(line: &str) -> Option<StorySegment> {
    let end = line.find(']')?;
    let inside = &line[1..end];
    let remainder = line[end + 1..].trim();

    let (command, attr_source) = split_command_and_attrs(inside);
    let command = command.to_ascii_lowercase();
    let attrs = parse_attributes(inside);

    match command.as_str() {
        "name" => {
            let character_name = attrs.get("name")?.trim().to_string();
            let text = clean_text(remainder);
            if text.is_empty() {
                return None;
            }
            Some(StorySegment::Dialogue {
                character_name,
                text,
            })
        }
        "multiline" => {
            let character_name = attrs.get("name")?.trim().to_string();
            let text = clean_text(remainder);
            if text.is_empty() {
                return None;
            }
            Some(StorySegment::Dialogue {
                character_name,
                text,
            })
        }
        "decision" => {
            let mut options = Vec::new();
            if let Some(raw_options) = attrs.get("options") {
                options.extend(
                    raw_options
                        .split(';')
                        .map(|s| clean_text(s))
                        .filter(|s| !s.is_empty()),
                );
            } else {
                let target_source = attr_source.unwrap_or(inside);
                for caps in DECISION_NUMBERED_RE.captures_iter(target_source) {
                    if let Some(option) = caps.get(1) {
                        let option_text = clean_text(option.as_str());
                        if !option_text.is_empty() {
                            options.push(option_text);
                        }
                    }
                }
            }

            if options.is_empty() {
                return None;
            }

            Some(StorySegment::Decision { options })
        }
        "popupdialog" | "tutorial" => {
            let text = clean_text(remainder);
            if text.is_empty() {
                return None;
            }
            let speaker = attrs
                .get("dialoghead")
                .map(|s| clean_dialog_head(s))
                .filter(|s| !s.is_empty());
            Some(StorySegment::System { speaker, text })
        }
        "subtitle" => {
            let text = attrs
                .get("text")
                .map(|t| clean_text(t))
                .filter(|t| !t.is_empty())?;
            let alignment = attrs.get("alignment").map(|s| s.trim().to_string());
            Some(StorySegment::Subtitle { text, alignment })
        }
        "sticker" => {
            let text = attrs
                .get("text")
                .map(|t| clean_text(t))
                .filter(|t| !t.is_empty())?;
            let alignment = attrs.get("alignment").map(|s| s.trim().to_string());
            Some(StorySegment::Sticker { text, alignment })
        }
        "header" => {
            let title = clean_text(remainder);
            if title.is_empty() {
                return None;
            }
            Some(StorySegment::Header { title })
        }
        // 其他命令忽略
        _ => None,
    }
}

fn split_command_and_attrs(inside: &str) -> (String, Option<&str>) {
    let inside = inside.trim();
    if inside.is_empty() {
        return (String::new(), None);
    }

    let mut end_idx = inside.len();
    for (idx, ch) in inside.char_indices() {
        if ch == '(' || ch == ' ' || ch == '=' {
            end_idx = idx;
            break;
        }
    }

    let command = inside[..end_idx].to_string();
    let attrs = if end_idx < inside.len() {
        Some(inside[end_idx..].trim())
    } else {
        None
    };

    (command, attrs)
}

fn parse_attributes(source: &str) -> HashMap<String, String> {
    let mut attrs = HashMap::new();
    for caps in ATTR_RE.captures_iter(source) {
        if let (Some(key), Some(value)) = (caps.get(1), caps.get(2)) {
            attrs.insert(
                key.as_str().to_ascii_lowercase(),
                value.as_str().to_string(),
            );
        }
    }
    attrs
}

fn clean_dialog_head(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    // 去掉常见的前缀符号，如 `$`
    let mut cleaned = trimmed.trim_start_matches('$').to_string();
    if let Some(rest) = cleaned.strip_prefix("avatar_") {
        cleaned = rest.to_string();
    } else if let Some(rest) = cleaned.strip_prefix("char_") {
        cleaned = rest.to_string();
    }
    cleaned.replace('_', " ")
}

fn clean_text(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    let mut cleaned = text.replace('\u{3000}', " ").replace('\u{00A0}', " ");
    cleaned = GENERIC_TAG_RE.replace_all(&cleaned, "").to_string();
    cleaned = cleaned.replace("{@nickname}", "博士");
    cleaned = cleaned.trim().to_string();
    cleaned
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

        match &result.segments[0] {
            StorySegment::Dialogue {
                character_name,
                text,
            } => {
                assert_eq!(character_name, "杜宾");
                assert_eq!(text, "可恶......");
            }
            _ => panic!("Expected dialogue segment"),
        }
    }

    #[test]
    fn test_parse_decision_variants() {
        let content = r#"[Decision(options="早就该交给我了！;......;简单，我会轻松解决的。", values="1;2;3")]
[Decision(option1="选项A", value1="1", option2="选项B", value2="2")]"#;

        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 2);

        match &result.segments[0] {
            StorySegment::Decision { options } => {
                assert_eq!(options.len(), 3);
                assert_eq!(options[0], "早就该交给我了！");
                assert_eq!(options[1], "......");
                assert_eq!(options[2], "简单，我会轻松解决的。");
            }
            _ => panic!("Expected decision segment"),
        }

        match &result.segments[1] {
            StorySegment::Decision { options } => {
                assert_eq!(options, &vec!["选项A".to_string(), "选项B".to_string()]);
            }
            _ => panic!("Expected decision segment"),
        }
    }

    #[test]
    fn test_parse_subtitle_and_system() {
        let content = r#"[Subtitle(text="“让所有人都站起来。”", alignment="center")]
[PopupDialog(dialogHead="$avatar_sys")] 请尽可能多地与其他组织建立良好关系"#;

        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 2);

        match &result.segments[0] {
            StorySegment::Subtitle { text, alignment } => {
                assert_eq!(text, "“让所有人都站起来。”");
                assert_eq!(alignment.as_deref(), Some("center"));
            }
            _ => panic!("Expected subtitle segment"),
        }

        match &result.segments[1] {
            StorySegment::System { speaker, text } => {
                assert_eq!(speaker.as_deref(), Some("sys"));
                assert_eq!(text, "请尽可能多地与其他组织建立良好关系");
            }
            _ => panic!("Expected system segment"),
        }
    }

    #[test]
    fn test_parse_header_and_narration() {
        let content = r#"[HEADER(key="title", is_skippable=true)] 节标题
这一段是旁白。"#;

        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 2);

        match &result.segments[0] {
            StorySegment::Header { title } => {
                assert_eq!(title, "节标题");
            }
            _ => panic!("Expected header segment"),
        }

        match &result.segments[1] {
            StorySegment::Narration { text } => {
                assert_eq!(text, "这一段是旁白。");
            }
            _ => panic!("Expected narration segment"),
        }
    }
}
