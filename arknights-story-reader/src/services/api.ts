import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  StoryCategory,
  Chapter,
  ParsedStoryContent,
  SearchResult,
  StoryEntry,
  StoryIndexStatus,
  SearchDebugResponse,
} from "@/types/story";

export interface SyncProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

export const api = {
  // 是否已安装数据
  isInstalled: async (): Promise<boolean> => {
    console.log("[API] 调用 is_installed");
    try {
      const ok = await invoke<boolean>("is_installed");
      console.log("[API] is_installed:", ok);
      return ok;
    } catch (error) {
      console.error("[API] is_installed 失败:", error);
      return false;
    }
  },
  // 同步数据
  syncData: async (): Promise<void> => {
    console.log("[API] 开始调用 sync_data 命令");
    try {
      const result = await invoke("sync_data");
      console.log("[API] sync_data 命令成功完成:", result);
      return result;
    } catch (error) {
      console.error("[API] sync_data 命令失败:", error);
      throw error;
    }
  },

  // 获取当前版本
  getCurrentVersion: async (): Promise<string> => {
    console.log("[API] 调用 get_current_version");
    try {
      const version = await invoke<string>("get_current_version");
      console.log("[API] 当前版本:", version);
      return version;
    } catch (error) {
      console.error("[API] 获取当前版本失败:", error);
      throw error;
    }
  },

  // 获取远程版本
  getRemoteVersion: async (): Promise<string> => {
    console.log("[API] 调用 get_remote_version");
    try {
      const version = await invoke<string>("get_remote_version");
      console.log("[API] 远程版本:", version);
      return version;
    } catch (error) {
      console.error("[API] 获取远程版本失败:", error);
      throw error;
    }
  },

  // 检查更新
  checkUpdate: async (): Promise<boolean> => {
    console.log("[API] 调用 check_update");
    try {
      const hasUpdate = await invoke<boolean>("check_update");
      console.log("[API] 是否有更新:", hasUpdate);
      return hasUpdate;
    } catch (error) {
      console.error("[API] 检查更新失败:", error);
      throw error;
    }
  },

  // 手动导入ZIP（字节流）
  importZipFromBytes: async (bytes: Uint8Array): Promise<void> => {
    console.log("[API] 调用 import_from_zip_bytes, 大小:", bytes.byteLength);
    return invoke("import_from_zip_bytes", { bytes });
  },

  // 监听同步进度
  onSyncProgress: (callback: (progress: SyncProgress) => void) => {
    console.log("[API] 开始监听 sync-progress 事件");
    return listen<SyncProgress>("sync-progress", (event) => {
      console.log("[API] 收到同步进度:", event.payload);
      callback(event.payload);
    });
  },

  // 获取章节列表
  getChapters: async (): Promise<Chapter[]> => {
    return invoke("get_chapters");
  },

  // 获取剧情分类
  getStoryCategories: async (): Promise<StoryCategory[]> => {
    return invoke("get_story_categories");
  },

  // 获取剧情内容
  getStoryContent: async (storyPath: string): Promise<ParsedStoryContent> => {
    return invoke("get_story_content", { storyPath });
  },

  // 获取剧情简介
  getStoryInfo: async (infoPath: string): Promise<string> => {
    return invoke("get_story_info", { infoPath });
  },

  // 根据ID获取剧情条目
  getStoryEntry: async (storyId: string): Promise<StoryEntry> => {
    return invoke("get_story_entry", { storyId });
  },

  // 获取全文索引状态
  getStoryIndexStatus: async (): Promise<StoryIndexStatus> => {
    return invoke("get_story_index_status");
  },

  // 重建全文索引
  buildStoryIndex: async (): Promise<void> => {
    return invoke("build_story_index");
  },

  // 搜索剧情
  searchStories: async (query: string): Promise<SearchResult[]> => {
    return invoke("search_stories", { query });
  },

  // 调试模式搜索剧情
  searchStoriesDebug: async (query: string): Promise<SearchDebugResponse> => {
    return invoke("search_stories_debug", { query });
  },

  // 获取主线剧情（按章节分组）
  getMainStoriesGrouped: async (): Promise<Array<[string, StoryEntry[]]>> => {
    console.log("[API] 调用 get_main_stories_grouped");
    return invoke("get_main_stories_grouped");
  },

  // 获取活动剧情（按活动分组）
  getActivityStoriesGrouped: async (): Promise<Array<[string, StoryEntry[]]>> => {
    console.log("[API] 调用 get_activity_stories_grouped");
    return invoke("get_activity_stories_grouped");
  },

  // 获取追忆集（干员密录）
  getMemoryStories: async (): Promise<StoryEntry[]> => {
    console.log("[API] 调用 get_memory_stories");
    return invoke("get_memory_stories");
  },
};
