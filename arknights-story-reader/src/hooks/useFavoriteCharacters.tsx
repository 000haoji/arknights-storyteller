import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface FavoriteCharactersState {
  characterIds: Set<string>;
}

interface FavoriteCharactersContextValue {
  favoriteCharacterIds: Set<string>;
  isFavorite: (charId: string) => boolean;
  toggleFavorite: (charId: string) => void;
}

const STORAGE_KEY = "arknights-favorite-characters";

const FavoriteCharactersContext = createContext<FavoriteCharactersContextValue | null>(null);

function loadFromStorage(): FavoriteCharactersState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { characterIds: new Set() };
    const data = JSON.parse(raw);
    return { characterIds: new Set(data.characterIds || []) };
  } catch (e) {
    console.warn("[FavoriteCharacters] 读取收藏失败", e);
    return { characterIds: new Set() };
  }
}

function saveToStorage(state: FavoriteCharactersState) {
  try {
    const data = { characterIds: Array.from(state.characterIds) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[FavoriteCharacters] 保存收藏失败", e);
  }
}

export function FavoriteCharactersProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FavoriteCharactersState>(loadFromStorage);

  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const isFavorite = useCallback(
    (charId: string) => state.characterIds.has(charId),
    [state.characterIds]
  );

  const toggleFavorite = useCallback((charId: string) => {
    setState((prev) => {
      const newIds = new Set(prev.characterIds);
      if (newIds.has(charId)) {
        newIds.delete(charId);
      } else {
        newIds.add(charId);
      }
      return { characterIds: newIds };
    });
  }, []);

  const value = useMemo(
    () => ({
      favoriteCharacterIds: state.characterIds,
      isFavorite,
      toggleFavorite,
    }),
    [state.characterIds, isFavorite, toggleFavorite]
  );

  return (
    <FavoriteCharactersContext.Provider value={value}>
      {children}
    </FavoriteCharactersContext.Provider>
  );
}

export function useFavoriteCharacters() {
  const context = useContext(FavoriteCharactersContext);
  if (!context) {
    throw new Error("useFavoriteCharacters must be used within FavoriteCharactersProvider");
  }
  return context;
}












