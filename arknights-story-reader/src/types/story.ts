// 剧情条目
export interface StoryEntry {
  storyId: string;
  storyName: string;
  storyCode?: string;
  storyGroup: string;
  storySort: number;
  avgTag?: string; // 行动前/行动后
  storyTxt: string; // 剧情文本文件路径
  storyInfo?: string; // 剧情简介文件路径
  storyReviewType: string;
  unLockType: string;
  // 元数据（存在则返回）
  storyDependence?: string | null;
  storyCanShow?: number | null;
  storyCanEnter?: number | null;
  stageCount?: number | null;
  requiredStages?: Array<{
    stageId: string;
    minState: string;
    maxState: string;
  }>; 
  costItemType?: string | null;
  costItemId?: string | null;
  costItemCount?: number | null;
}

// 章节
export interface Chapter {
  chapterId: string;
  chapterName: string;
  chapterName2: string;
  chapterIndex: number;
  preposedChapterId?: string;
  startZoneId: string;
  endZoneId: string;
  chapterEndStageId: string;
}

// 活动
export interface Activity {
  id: string;
  name: string;
  entryType: string;
  actType: string;
  startTime: number;
  endTime: number;
  infoUnlockDatas: StoryEntry[];
}

// 解析后的剧情内容
export interface ParsedStoryContent {
  segments: StorySegment[];
}

// 剧情段落类型
export type StorySegment = 
  | DialogueSegment
  | NarrationSegment
  | DecisionSegment
  | SystemSegment
  | SubtitleSegment
  | StickerSegment
  | HeaderSegment;

// 对话段落
export interface DialogueSegment {
  type: 'dialogue';
  characterName: string;
  text: string;
  position?: 'left' | 'right' | null;
}

// 旁白段落
export interface NarrationSegment {
  type: 'narration';
  text: string;
}

// 选项段落
export interface DecisionSegment {
  type: 'decision';
  options: string[];
  values?: string[];
}

export interface SystemSegment {
  type: 'system';
  speaker?: string | null;
  text: string;
}

export interface SubtitleSegment {
  type: 'subtitle';
  text: string;
  alignment?: string | null;
}

export interface StickerSegment {
  type: 'sticker';
  text: string;
  alignment?: string | null;
}

export interface HeaderSegment {
  type: 'header';
  title: string;
}

// 剧情分类
export interface StoryCategory {
  id: string;
  name: string;
  type: 'chapter' | 'activity' | 'memory' | 'roguelike' | 'sidestory';
  stories: StoryEntry[];
}

// ==================== 干员相关类型 ====================

export interface CharacterBasicInfo {
  charId: string;
  name: string;
  appellation: string;
  rarity: number;
  profession: string;
  subProfessionId: string;
  position: string;
  nationId?: string;
  groupId?: string;
  teamId?: string;
}

export interface CharacterHandbook {
  charId: string;
  charName: string;
  rarity: number;
  profession: string;
  subProfession?: string;
  storyTextAudio: HandbookStorySection[];
}

export interface HandbookStorySection {
  storyTitle: string;
  stories: HandbookStory[];
}

export interface HandbookStory {
  storyText: string;
  unLockType: string;
  unLockParam: string;
}

export interface CharacterVoice {
  charId: string;
  charName: string;
  voices: VoiceLine[];
}

export interface VoiceLine {
  voiceId: string;
  voiceTitle: string;
  voiceText: string;
  voiceIndex: number;
  unlockType: string;
}

// 搜索结果
export interface SearchResult {
  storyId: string;
  storyName: string;
  matchedText: string;
  category: string;
}

export interface SearchDebugResponse {
  results: SearchResult[];
  logs: string[];
}

export interface StoryIndexStatus {
  ready: boolean;
  total: number;
  lastBuiltAt?: number | null;
}
