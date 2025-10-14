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

export function useReadingProgress(storyPath: string | null) {
  const [progress, setProgress] = useState<ReadingProgress | null>(() => {
    if (!storyPath) return null;
    const map = readProgressMap();
    return map[storyPath] ?? null;
  });

  useEffect(() => {
    if (!storyPath) {
      setProgress(null);
      return;
    }
    const map = readProgressMap();
    setProgress(map[storyPath] ?? null);
  }, [storyPath]);

  const updateProgress = useCallback(
    (partial: Partial<ReadingProgress>) => {
      if (!storyPath) return;
      setProgress((prev) => {
        const merged: ReadingProgress = {
          storyPath,
          percentage: partial.percentage ?? prev?.percentage ?? 0,
          currentPage: partial.currentPage ?? prev?.currentPage,
          scrollTop: partial.scrollTop ?? prev?.scrollTop,
          readingMode: partial.readingMode ?? prev?.readingMode ?? "scroll",
          updatedAt: partial.updatedAt ?? Date.now(),
        };

        const map = readProgressMap();
        map[storyPath] = merged;
        writeProgressMap(map);
        return merged;
      });
    },
    [storyPath]
  );

  const clearProgress = useCallback(() => {
    if (!storyPath) return;
    setProgress(null);
    const map = readProgressMap();
    delete map[storyPath];
    writeProgressMap(map);
  }, [storyPath]);

  return useMemo(
    () => ({
      progress,
      updateProgress,
      clearProgress,
    }),
    [progress, updateProgress, clearProgress]
  );
}

