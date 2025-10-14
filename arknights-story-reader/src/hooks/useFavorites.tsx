import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { StoryEntry } from "@/types/story";

export type FavoriteGroupType = "chapter" | "activity" | "memory" | "other";

export interface FavoriteGroup {
  id: string;
  name: string;
  type: FavoriteGroupType;
  storyIds: string[];
  stories: Record<string, StoryEntry>;
}

export interface FavoriteGroupPayload {
  id: string;
  name: string;
  type?: FavoriteGroupType;
  stories: StoryEntry[];
}

type FavoriteStoryMap = Record<string, StoryEntry>;

interface FavoritesState {
  stories: FavoriteStoryMap;
  groups: Record<string, FavoriteGroup>;
}

interface FavoritesContextValue {
  favoriteStories: FavoriteStoryMap;
  favoriteGroups: Record<string, FavoriteGroup>;
  isFavorite: (storyId: string) => boolean;
  toggleFavorite: (story: StoryEntry) => void;
  isGroupFavorite: (groupId: string) => boolean;
  toggleFavoriteGroup: (group: FavoriteGroupPayload) => void;
}

const STORAGE_KEY = "arknights-story-favorites";
const INITIAL_STATE: FavoritesState = { stories: {}, groups: {} };

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function sanitizeStoryMap(input: unknown): FavoriteStoryMap {
  if (!input || typeof input !== "object") return {};

  const entries = Object.entries(input as Record<string, StoryEntry>);
  const sanitized: FavoriteStoryMap = {};

  for (const [storyId, story] of entries) {
    if (
      story &&
      typeof story === "object" &&
      typeof (story as StoryEntry).storyId === "string"
    ) {
      sanitized[storyId] = story;
    }
  }

  return sanitized;
}

function sanitizeGroupMap(input: unknown): Record<string, FavoriteGroup> {
  if (!input || typeof input !== "object") return {};

  const groups: Record<string, FavoriteGroup> = {};

  for (const [groupId, value] of Object.entries(input as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const raw = value as Partial<FavoriteGroup>;
    const stories = sanitizeStoryMap(raw.stories);
    const storyIds = Array.isArray(raw.storyIds)
      ? raw.storyIds.filter((id): id is string => typeof id === "string")
      : Object.keys(stories);

    if (storyIds.length === 0) continue;

    groups[groupId] = {
      id: raw.id ?? groupId,
      name: raw.name ?? groupId,
      type: raw.type ?? "other",
      storyIds: Array.from(new Set(storyIds)),
      stories,
    };
  }

  return groups;
}

function readFromStorage(): FavoritesState {
  if (typeof window === "undefined") {
    return INITIAL_STATE;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return INITIAL_STATE;
    const parsed = JSON.parse(stored) as unknown;

    if (parsed && typeof parsed === "object") {
      const asState = parsed as Partial<FavoritesState>;

      if ("stories" in asState || "groups" in asState) {
        return {
          stories: sanitizeStoryMap(asState.stories),
          groups: sanitizeGroupMap(asState.groups),
        };
      }

      // 向后兼容旧版本（仅保存关卡收藏）
      return {
        stories: sanitizeStoryMap(parsed),
        groups: {},
      };
    }

    return INITIAL_STATE;
  } catch (error) {
    console.warn("[Favorites] 读取本地收藏失败:", error);
    return INITIAL_STATE;
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoritesState>(() => readFromStorage());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.warn("[Favorites] 写入本地收藏失败:", error);
    }
  }, [favorites]);

  const isFavorite = useCallback(
    (storyId: string) => Boolean(favorites.stories[storyId]),
    [favorites.stories]
  );

  const toggleFavorite = useCallback((story: StoryEntry) => {
    setFavorites((prev) => {
      const nextStories = { ...prev.stories };
      if (nextStories[story.storyId]) {
        delete nextStories[story.storyId];
      } else {
        nextStories[story.storyId] = story;
      }
      return { ...prev, stories: nextStories };
    });
  }, []);

  const isGroupFavorite = useCallback(
    (groupId: string) => Boolean(favorites.groups[groupId]),
    [favorites.groups]
  );

  const toggleFavoriteGroup = useCallback((group: FavoriteGroupPayload) => {
    const uniqueStories = group.stories.filter(
      (story, index, self) =>
        story && typeof story === "object" && self.findIndex((item) => item.storyId === story.storyId) === index
    );

    setFavorites((prev) => {
      if (prev.groups[group.id]) {
        const { [group.id]: _removed, ...rest } = prev.groups;
        return { ...prev, groups: rest };
      }

      if (uniqueStories.length === 0) {
        return prev;
      }

      const storyMap: FavoriteStoryMap = {};
      uniqueStories.forEach((story) => {
        storyMap[story.storyId] = story;
      });

      return {
        ...prev,
        groups: {
          ...prev.groups,
          [group.id]: {
            id: group.id,
            name: group.name,
            type: group.type ?? "other",
            storyIds: uniqueStories.map((story) => story.storyId),
            stories: storyMap,
          },
        },
      };
    });
  }, []);

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favoriteStories: favorites.stories,
      favoriteGroups: favorites.groups,
      isFavorite,
      toggleFavorite,
      isGroupFavorite,
      toggleFavoriteGroup,
    }),
    [favorites.groups, favorites.stories, isFavorite, toggleFavorite, isGroupFavorite, toggleFavoriteGroup]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return context;
}
