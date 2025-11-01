import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReaderSettings } from "@/hooks/useReaderSettings";

export interface ReadingProgress {
  storyPath: string;
  percentage: number;
  currentPage?: number;
  scrollTop?: number;
  readingMode: ReaderSettings["readingMode"];
  updatedAt: number;
}

const STORAGE_KEY = "reading-progress";

type ProgressMap = Record<string, ReadingProgress>;

const isBrowser = typeof window !== "undefined";

function readProgressMap(): ProgressMap {
  if (!isBrowser) return {};
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as ProgressMap;
  } catch {
    return {};
  }
}

function writeProgressMap(map: ProgressMap) {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

/**
 * Persist reading progress per story (keyed by storyId primarily to avoid collisions),
 * with backward compatibility for legacy keys that used storyPath as the key.
 */
export function useReadingProgress(storyId: string | null, storyPath: string | null) {
  // New primary key (v2): id:<storyId> when available; otherwise path:<storyPath>
  const newKey = useMemo(() => {
    if (storyId && storyId.trim().length > 0) return `id:${storyId}`;
    if (storyPath && storyPath.trim().length > 0) return `path:${storyPath}`;
    return null;
  }, [storyId, storyPath]);

  // Legacy key (v1): raw storyPath
  const legacyKey = useMemo(() => {
    if (storyPath && storyPath.trim().length > 0) return storyPath;
    return null;
  }, [storyPath]);

  const [progress, setProgress] = useState<ReadingProgress | null>(() => {
    if (!newKey && !legacyKey) return null;
    const map = readProgressMap();
    return (newKey ? map[newKey] : null) ?? (legacyKey ? map[legacyKey] : null) ?? null;
  });

  useEffect(() => {
    if (!newKey && !legacyKey) {
      setProgress(null);
      return;
    }
    const map = readProgressMap();
    setProgress((newKey ? map[newKey] : null) ?? (legacyKey ? map[legacyKey] : null) ?? null);
  }, [newKey, legacyKey]);

  const updateProgress = useCallback(
    (partial: Partial<ReadingProgress>) => {
      if (!newKey && !legacyKey) return;
      const effectivePath = storyPath ?? progress?.storyPath ?? "";
      setProgress((prev) => {
        const merged: ReadingProgress = {
          storyPath: effectivePath,
          percentage: partial.percentage ?? prev?.percentage ?? 0,
          currentPage: partial.currentPage ?? prev?.currentPage,
          scrollTop: partial.scrollTop ?? prev?.scrollTop,
          readingMode: partial.readingMode ?? prev?.readingMode ?? "scroll",
          updatedAt: partial.updatedAt ?? Date.now(),
        };

        const map = readProgressMap();
        // Write to new primary key
        if (newKey) {
          map[newKey] = merged;
        }
        // Clean up legacy entry if it exists and differs from the new key
        if (legacyKey && (!newKey || legacyKey !== newKey)) {
          // Keep legacy for backward compat, or migrate by overwriting as well
          map[legacyKey] = merged;
        }
        writeProgressMap(map);
        return merged;
      });
    },
    [newKey, legacyKey, storyPath, progress?.storyPath]
  );

  const clearProgress = useCallback(() => {
    if (!newKey && !legacyKey) return;
    setProgress(null);
    const map = readProgressMap();
    if (newKey) delete map[newKey];
    if (legacyKey) delete map[legacyKey];
    writeProgressMap(map);
  }, [newKey, legacyKey]);

  return useMemo(
    () => ({
      progress,
      updateProgress,
      clearProgress,
    }),
    [progress, updateProgress, clearProgress]
  );
}

