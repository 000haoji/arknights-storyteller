import { useCallback, useEffect, useMemo, useState } from "react";

type HighlightStore = Record<string, number[]>;

const STORAGE_KEY = "reader-highlights";

function readStorage(): HighlightStore {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as HighlightStore;
      }
    }
  } catch {
    // ignore corrupted storage
  }
  return {};
}

export function useHighlights(storyPath: string) {
  const [store, setStore] = useState<HighlightStore>(() => readStorage());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // ignore quota errors
    }
  }, [store]);

  const highlights = useMemo(() => store[storyPath] ?? [], [store, storyPath]);

  const toggleHighlight = useCallback(
    (segmentIndex: number) => {
      setStore((prev) => {
        const current = prev[storyPath] ?? [];
        const exists = current.includes(segmentIndex);
        const nextSegments = exists
          ? current.filter((index) => index !== segmentIndex)
          : [...current, segmentIndex];
        nextSegments.sort((a, b) => a - b);
        return { ...prev, [storyPath]: nextSegments };
      });
    },
    [storyPath]
  );

  const clearHighlights = useCallback(() => {
    setStore((prev) => {
      if (!(storyPath in prev)) {
        return prev;
      }
      const copy = { ...prev };
      delete copy[storyPath];
      return copy;
    });
  }, [storyPath]);

  const isHighlighted = useCallback(
    (segmentIndex: number) => highlights.includes(segmentIndex),
    [highlights]
  );

  return { highlights, toggleHighlight, isHighlighted, clearHighlights };
}

