import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildShareCode, parseShareCode, digestToHex64 } from "@/lib/clueCodecs";

export interface ClueItem {
  storyId: string;
  segmentIndex: number;
  createdAt: number;
  preview?: string; // first line preview
  digestHex?: string; // 16 hex chars (64-bit)
}

export interface ClueSet {
  id: string;
  title: string;
  desc?: string;
  items: ClueItem[];
  createdAt: number;
  updatedAt: number;
}

interface ClueSetsState {
  sets: Record<string, ClueSet>;
}

export interface ImportResult {
  setId: string;
  created: boolean;
  itemsAdded: number;
}

interface ClueSetsContextValue {
  sets: Record<string, ClueSet>;
  createSet: (title?: string, desc?: string) => string; // returns setId
  deleteSet: (id: string) => void;
  renameSet: (id: string, title: string) => void;
  addItem: (setId: string, item: Omit<ClueItem, "createdAt"> & { createdAt?: number }) => void;
  addItems: (setId: string, items: Array<Omit<ClueItem, "createdAt"> & { createdAt?: number }>) => void;
  removeItem: (setId: string, storyId: string, segmentIndex: number) => void;
  moveItem: (setId: string, fromIndex: number, toIndex: number) => void;
  setItems: (setId: string, items: ClueItem[]) => void; // replace items order
  exportShareCode: (setId: string) => Promise<string>;
  importShareCode: (code: string, opts?: { targetSetId?: string; createIfMissing?: boolean; titleIfCreate?: string }) => Promise<ImportResult>;
  updateItemMeta: (
    setId: string,
    storyId: string,
    segmentIndex: number,
    meta: Partial<Pick<ClueItem, "preview" | "digestHex">>
  ) => void;
  ensureDefaultSetId: () => string; // get default set id, create if missing
}

const STORAGE_KEY = "arknights-clue-sets-v1";
const DEFAULT_SET_ID_KEY = "arknights-default-clue-set-id";

const ClueSetsContext = createContext<ClueSetsContextValue | null>(null);

function readStorage(): ClueSetsState {
  if (typeof window === "undefined") return { sets: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sets: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !("sets" in (parsed as any))) return { sets: {} };
    const sets: Record<string, ClueSet> = {};
    for (const [id, value] of Object.entries((parsed as any).sets ?? {})) {
      if (!value || typeof value !== "object") continue;
      const v = value as Partial<ClueSet>;
      const items = Array.isArray(v.items) ? v.items.filter(Boolean).map((it) => ({
        storyId: String((it as any).storyId ?? ""),
        segmentIndex: Number((it as any).segmentIndex ?? 0) | 0,
        createdAt: Number((it as any).createdAt ?? Date.now()) | 0,
        preview: typeof (it as any).preview === "string" ? (it as any).preview : undefined,
        digestHex: typeof (it as any).digestHex === "string" ? (it as any).digestHex : undefined,
      })) : [];
      if (!v.id || !v.title) continue;
      sets[id] = {
        id: String(v.id),
        title: String(v.title),
        desc: typeof v.desc === "string" ? v.desc : undefined,
        items,
        createdAt: Number(v.createdAt ?? Date.now()) | 0,
        updatedAt: Number(v.updatedAt ?? Date.now()) | 0,
      };
    }
    return { sets };
  } catch {
    return { sets: {} };
  }
}

function writeStorage(state: ClueSetsState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function genId(): string {
  // Short random id: yyyymmddhhmmss-4hex
  const d = new Date();
  const ts =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") +
    String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0") +
    String(d.getSeconds()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return `${ts}-${rand}`;
}

export function ClueSetsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ClueSetsState>(() => readStorage());

  useEffect(() => {
    writeStorage(state);
  }, [state]);

  const createSet = useCallback((title?: string, desc?: string) => {
    const id = genId();
    const now = Date.now();
    setState((prev) => ({
      sets: {
        ...prev.sets,
        [id]: { id, title: title?.trim() || "未命名线索集", desc, items: [], createdAt: now, updatedAt: now },
      },
    }));
    return id;
  }, []);

  const deleteSet = useCallback((id: string) => {
    setState((prev) => {
      const { [id]: _drop, ...rest } = prev.sets;
      return { sets: rest };
    });
  }, []);

  const renameSet = useCallback((id: string, title: string) => {
    setState((prev) => {
      const s = prev.sets[id];
      if (!s) return prev;
      return { sets: { ...prev.sets, [id]: { ...s, title: title.trim() || s.title, updatedAt: Date.now() } } };
    });
  }, []);

  const ensureDefaultSetId = useCallback(() => {
    try {
      const cached = window.localStorage.getItem(DEFAULT_SET_ID_KEY);
      if (cached && state.sets[cached]) {
        return cached;
      }
    } catch {}
    // choose an existing one named "我的线索集" if present
    const existing = Object.values(state.sets).find((s) => s.title === "我的线索集");
    if (existing) {
      try { window.localStorage.setItem(DEFAULT_SET_ID_KEY, existing.id); } catch {}
      return existing.id;
    }
    const id = (() => {
      const created = createSet("我的线索集");
      try { window.localStorage.setItem(DEFAULT_SET_ID_KEY, created); } catch {}
      return created;
    })();
    return id;
  }, [createSet, state.sets]);

  const addItem = useCallback(
    (setId: string, item: Omit<ClueItem, "createdAt"> & { createdAt?: number }) => {
      const createdAt = item.createdAt ?? Date.now();
      setState((prev) => {
        const set = prev.sets[setId];
        if (!set) return prev;
        const exists = set.items.some((it) => it.storyId === item.storyId && it.segmentIndex === item.segmentIndex);
        if (exists) {
          return { sets: { ...prev.sets, [setId]: { ...set, updatedAt: Date.now() } } };
        }
        const next: ClueSet = { ...set, items: [...set.items, { ...item, createdAt }], updatedAt: Date.now() };
        return { sets: { ...prev.sets, [setId]: next } };
      });
    },
    []
  );

  const addItems = useCallback(
    (setId: string, items: Array<Omit<ClueItem, "createdAt"> & { createdAt?: number }>) => {
      setState((prev) => {
        const set = prev.sets[setId];
        if (!set) return prev;
        const seen = new Set(set.items.map((it) => `${it.storyId}#${it.segmentIndex}`));
        const toAdd: ClueItem[] = [];
        for (const it of items) {
          const key = `${it.storyId}#${it.segmentIndex}`;
          if (seen.has(key)) continue;
          seen.add(key);
          toAdd.push({ ...it, createdAt: it.createdAt ?? Date.now() });
        }
        if (toAdd.length === 0) return prev;
        const next: ClueSet = { ...set, items: [...set.items, ...toAdd], updatedAt: Date.now() };
        return { sets: { ...prev.sets, [setId]: next } };
      });
    },
    []
  );

  const removeItem = useCallback((setId: string, storyId: string, segmentIndex: number) => {
    setState((prev) => {
      const set = prev.sets[setId];
      if (!set) return prev;
      const nextItems = set.items.filter((it) => !(it.storyId === storyId && it.segmentIndex === segmentIndex));
      return { sets: { ...prev.sets, [setId]: { ...set, items: nextItems, updatedAt: Date.now() } } };
    });
  }, []);

  const moveItem = useCallback((setId: string, fromIndex: number, toIndex: number) => {
    setState((prev) => {
      const set = prev.sets[setId];
      if (!set) return prev;
      const items = [...set.items];
      if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return prev;
      const [m] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, m);
      return { sets: { ...prev.sets, [setId]: { ...set, items, updatedAt: Date.now() } } };
    });
  }, []);

  const setItems = useCallback((setId: string, items: ClueItem[]) => {
    setState((prev) => {
      const set = prev.sets[setId];
      if (!set) return prev;
      return { sets: { ...prev.sets, [setId]: { ...set, items: [...items], updatedAt: Date.now() } } };
    });
  }, []);

  const updateItemMeta = useCallback(
    (setId: string, storyId: string, segmentIndex: number, meta: Partial<Pick<ClueItem, "preview" | "digestHex">>) => {
      setState((prev) => {
        const set = prev.sets[setId];
        if (!set) return prev;
        const items = set.items.map((it) =>
          it.storyId === storyId && it.segmentIndex === segmentIndex ? { ...it, ...meta } : it
        );
        return { sets: { ...prev.sets, [setId]: { ...set, items, updatedAt: Date.now() } } };
      });
    },
    []
  );

  const exportShareCode = useCallback(async (setId: string) => {
    const set = state.sets[setId];
    if (!set) throw new Error("Set not found");
    // Group items by story, keep story order by first appearance in current set.items
    const firstIndex = new Map<string, number>();
    const grouped = new Map<string, ClueItem[]>();
    set.items.forEach((it, idx) => {
      if (!firstIndex.has(it.storyId)) firstIndex.set(it.storyId, idx);
      const arr = grouped.get(it.storyId) ?? [];
      arr.push(it);
      grouped.set(it.storyId, arr);
    });
    // Determine story order by first occurrence (aligns with current group-level排序)
    const storyIds = Array.from(grouped.keys()).sort((a, b) => (firstIndex.get(a)! - firstIndex.get(b)!));
    // Within each story, sort by segmentIndex ascending to ensure原文顺序
    const orderedItems: ClueItem[] = [];
    storyIds.forEach((sid) => {
      const arr = grouped.get(sid)!;
      arr.sort((a, b) => a.segmentIndex - b.segmentIndex);
      orderedItems.push(...arr);
    });

    const storyIndexMap = new Map<string, number>(storyIds.map((id, i) => [id, i]));
    const items = orderedItems.map((it) => ({
      storyIndex: storyIndexMap.get(it.storyId)!,
      segmentIndex: it.segmentIndex,
      digest64: BigInt(`0x${(it.digestHex ?? "").padStart(16, "0")}`),
    }));
    const payload: EncodedCluePayloadV1 = { version: 1, stories: storyIds, items };
    const info = await buildShareCode(payload);
    return info.code;
  }, [state.sets]);

  const importShareCode = useCallback(async (code: string, opts?: { targetSetId?: string; createIfMissing?: boolean; titleIfCreate?: string }): Promise<ImportResult> => {
    const payload = await parseShareCode(code);
    const { stories, items } = payload;
    const importedItems: Array<Omit<ClueItem, "createdAt"> & { createdAt?: number }> = items.map((ref) => ({
      storyId: stories[ref.storyIndex],
      segmentIndex: ref.segmentIndex,
      digestHex: digestToHex64(ref.digest64),
      preview: undefined,
    }));

    let setId = opts?.targetSetId;
    let created = false;
    if (!setId || !state.sets[setId]) {
      if (opts?.createIfMissing !== false) {
        setId = createSet(opts?.titleIfCreate || "导入的线索集");
        created = true;
      } else {
        throw new Error("Target set not found");
      }
    }

    // compute how many will be added (dedupe against existing)
    const existingKeys = new Set((state.sets[setId!]?.items ?? []).map((it) => `${it.storyId}#${it.segmentIndex}`));
    const uniqueToAdd = importedItems.filter((it) => {
      const k = `${it.storyId}#${it.segmentIndex}`;
      if (existingKeys.has(k)) return false;
      existingKeys.add(k);
      return true;
    });

    if (uniqueToAdd.length > 0) addItems(setId!, uniqueToAdd);

    return { setId: setId!, created, itemsAdded: uniqueToAdd.length };
  }, [addItems, createSet, state.sets]);

  const value = useMemo<ClueSetsContextValue>(() => ({
    sets: state.sets,
    createSet,
    deleteSet,
    renameSet,
    addItem,
    addItems,
    removeItem,
    moveItem,
    setItems,
    exportShareCode,
    importShareCode,
    updateItemMeta,
    ensureDefaultSetId,
  }), [state.sets, createSet, deleteSet, renameSet, addItem, addItems, removeItem, moveItem, setItems, exportShareCode, importShareCode, updateItemMeta, ensureDefaultSetId]);

  return <ClueSetsContext.Provider value={value}>{children}</ClueSetsContext.Provider>;
}

export function useClueSets() {
  const ctx = useContext(ClueSetsContext);
  if (!ctx) throw new Error("useClueSets must be used within ClueSetsProvider");
  return ctx;
}
