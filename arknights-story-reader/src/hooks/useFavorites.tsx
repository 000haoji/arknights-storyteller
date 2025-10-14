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

type FavoritesMap = Record<string, StoryEntry>;

interface FavoritesContextValue {
  favorites: FavoritesMap;
  isFavorite: (storyId: string) => boolean;
  toggleFavorite: (story: StoryEntry) => void;
}

const STORAGE_KEY = "arknights-story-favorites";

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function readFromStorage(): FavoritesMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as FavoritesMap;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
    return {};
  } catch (error) {
    console.warn("[Favorites] 读取本地收藏失败:", error);
    return {};
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoritesMap>(() => readFromStorage());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.warn("[Favorites] 写入本地收藏失败:", error);
    }
  }, [favorites]);

  const isFavorite = useCallback(
    (storyId: string) => Boolean(favorites[storyId]),
    [favorites]
  );

  const toggleFavorite = useCallback((story: StoryEntry) => {
    setFavorites((prev) => {
      if (prev[story.storyId]) {
        const { [story.storyId]: _removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [story.storyId]: story,
      };
    });
  }, []);

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favorites,
      isFavorite,
      toggleFavorite,
    }),
    [favorites, isFavorite, toggleFavorite]
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
