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
    static ref PARAGRAPH_TAG_RE: Regex =
        Regex::new(r"(?i)<p[^>]*>").expect("invalid paragraph tag regex");
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
        "dialog" => parse_dialog_like(&attrs, remainder),
        "voicewithin" => parse_dialog_like(&attrs, remainder),
        "narration" => {
            let text = if remainder.is_empty() {
                attrs.get("text").map(|t| clean_text(t)).unwrap_or_default()
            } else {
                clean_text(remainder)
            };
            if !has_meaningful_content(&text) {
                return None;
            }
            Some(StorySegment::Narration { text })
        }
        "animtext" => {
            let text = clean_text(remainder)
                .if_empty_then(|| attrs.get("text").map(|t| clean_text(t)).unwrap_or_default());
            let text = text.trim().to_string();
            if !has_meaningful_content(&text) {
                return None;
            }
            Some(StorySegment::Sticker {
                text,
                alignment: None,
            })
        }
        "title" => {
            let title = clean_text(remainder);
            if !has_meaningful_content(&title) {
                return None;
            }
            Some(StorySegment::Header { title })
        }
        "div" => {
            let text = clean_text(remainder);
            if !has_meaningful_content(&text) {
                return None;
            }
            Some(StorySegment::Subtitle {
                text,
                alignment: None,
            })
        }
        "avatarid" | "isavatarright" => {
            let text = clean_text(remainder);
            if !has_meaningful_content(&text) {
                return None;
            }
            Some(StorySegment::System {
                speaker: resolve_speaker(&attrs),
                text,
            })
        }
        // 其他命令若仍包含文本，则作为旁白处理
        _ => {
            let text = clean_text(remainder);
            if !has_meaningful_content(&text) {
                None
            } else {
                Some(StorySegment::Narration { text })
            }
        }
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
    humanize_identifier(trimmed)
}

fn clean_text(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    let mut cleaned = text
        .replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace('\r', "\n")
        .replace('\u{3000}', " ")
        .replace('\u{00A0}', " ");
    cleaned = PARAGRAPH_TAG_RE.replace_all(&cleaned, "\n").to_string();
    cleaned = GENERIC_TAG_RE.replace_all(&cleaned, "").to_string();
    cleaned = cleaned.replace("{@nickname}", "博士");
    cleaned = cleaned.trim().to_string();

    if cleaned.contains('\n') {
        let normalized = cleaned
            .lines()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        return normalized;
    }

    cleaned
}

fn has_meaningful_content(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }

    if trimmed.len() <= 3 && trimmed.chars().all(|c| c.is_ascii_punctuation()) {
        return false;
    }

    true
}

fn parse_dialog_like(attrs: &HashMap<String, String>, remainder: &str) -> Option<StorySegment> {
    let text = if remainder.is_empty() {
        attrs.get("text").map(|t| clean_text(t)).unwrap_or_default()
    } else {
        clean_text(remainder)
    };
    if !has_meaningful_content(&text) {
        return None;
    }

    if let Some(character_name) = resolve_speaker(attrs) {
        Some(StorySegment::Dialogue {
            character_name,
            text,
        })
    } else {
        Some(StorySegment::Narration { text })
    }
}

fn resolve_speaker(attrs: &HashMap<String, String>) -> Option<String> {
    if let Some(name) = attrs.get("name") {
        let cleaned = clean_text(name);
        if has_meaningful_content(&cleaned) {
            return Some(cleaned);
        }
    }

    if let Some(head) = attrs.get("head") {
        let cleaned = humanize_identifier(head);
        if has_meaningful_content(&cleaned) {
            return Some(cleaned);
        }
    }

    if let Some(avatar) = attrs.get("avatarid") {
        let cleaned = humanize_identifier(avatar);
        if has_meaningful_content(&cleaned) {
            return Some(cleaned);
        }
    }

    None
}

fn humanize_identifier(raw: &str) -> String {
    let mut value = raw.trim().trim_matches('"').trim_start_matches('$');
    for prefix in &[
        "char_", "npc_", "avg_", "avatar_", "trap_", "voice_", "item_", "act_", "story_",
    ] {
        if value.starts_with(prefix) {
            value = &value[prefix.len()..];
            break;
        }
    }

    let mut parts = value
        .split(|c| c == '_' || c == '#')
        .filter(|part| !part.trim().is_empty() && !part.chars().all(|c| c.is_ascii_digit()))
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => {
                    let mut s = first.to_uppercase().collect::<String>();
                    s.push_str(chars.as_str());
                    s
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>();

    if parts.is_empty() {
        return raw.trim().to_string();
    }

    parts.dedup();
    parts.join(" ")
}

trait IfEmpty {
    fn if_empty_then(self, f: impl FnOnce() -> String) -> String;
}

impl IfEmpty for String {
    fn if_empty_then(self, f: impl FnOnce() -> String) -> String {
        if self.trim().is_empty() {
            f()
        } else {
            self
        }
    }
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
    fn test_parse_dialog_like_commands() {
        let content = r#"[Dialog(head="char_356_broca", delay=1)]橘子酱通心粉，我有点印象。
[VoiceWithin(head="npc_1028_texas2_1",delay=1)]把饭钱也给老板了，去别处走走吧。
[Narration]身处宪兵队的审讯室中，他的神情却出奇地平静。
[AnimText(id="at1")]<p=1>罗德岛医疗部</><p=2>1099年1月27日 11:38 A.M.</>
[Title] MAIN_LOG_102_1
[Div] Part.02
[avatarId="", isAvatarRight="FALSE"]警告：PRTS系统权限读写中......"#;

        let result = parse_story_text(content);
        assert_eq!(result.segments.len(), 7);

        match &result.segments[0] {
            StorySegment::Dialogue {
                character_name,
                text,
            } => {
                assert_eq!(character_name, "Broca");
                assert_eq!(text, "橘子酱通心粉，我有点印象。");
            }
            _ => panic!("Expected dialogue segment"),
        }

        match &result.segments[1] {
            StorySegment::Dialogue {
                character_name,
                text,
            } => {
                assert_eq!(character_name, "Texas2");
                assert!(text.contains("把饭钱也给老板了"));
            }
            _ => panic!("Expected dialogue segment"),
        }

        match &result.segments[2] {
            StorySegment::Narration { text } => {
                assert!(text.starts_with("身处宪兵队的审讯室"));
            }
            _ => panic!("Expected narration segment"),
        }

        match &result.segments[3] {
            StorySegment::Sticker { text, .. } => {
                assert!(text.contains("罗德岛医疗部"));
                assert!(text.contains("1099年1月27日"));
                assert!(text.contains("\n"));
            }
            _ => panic!("Expected sticker segment"),
        }

        match &result.segments[4] {
            StorySegment::Header { title } => {
                assert_eq!(title, "MAIN_LOG_102_1");
            }
            _ => panic!("Expected header segment"),
        }

        match &result.segments[5] {
            StorySegment::Subtitle { text, .. } => {
                assert_eq!(text, "Part.02");
            }
            _ => panic!("Expected subtitle segment"),
        }

        match &result.segments[6] {
            StorySegment::System { text, .. } => {
                assert!(text.contains("PRTS系统权限读写中"));
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
