import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/services/api";
import type { ParsedStoryContent, StorySegment } from "@/types/story";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BookmarkCheck,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  ListTree,
  Settings as SettingsIcon,
  Trash2,
  Star,
  Plus,
  Check,
} from "lucide-react";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { ReaderSettingsPanel } from "@/components/ReaderSettings";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useFavorites } from "@/hooks/useFavorites";
import { useHighlights } from "@/hooks/useHighlights";
import { useClueSets } from "@/hooks/useClueSets";
import { cn } from "@/lib/utils";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StoryEntry } from "@/types/story";
import { fnv1a64, normalizeForDigest, digestToHex64 } from "@/lib/clueCodecs";

interface ReaderSearchFocus {
  storyId: string;
  query: string;
  snippet?: string | null;
  issuedAt?: number;
}

interface StoryReaderProps {
  storyId: string;
  storyPath: string;
  storyName: string;
  onBack: () => void;
  initialFocus?: ReaderSearchFocus | null;
  initialCharacter?: string;
  initialJump?: { storyId: string; segmentIndex: number; digestHex?: string; preview?: string; issuedAt?: number } | null;
}

interface RenderableSegment {
  segment: StorySegment;
  index: number;
}

const SEGMENTS_PER_PAGE = 12;
const BASE_MAX_WIDTH = 768; // px

function isSegmentHighlightable(segment: StorySegment): boolean {
  switch (segment.type) {
    case "dialogue":
    case "narration":
    case "system":
    case "subtitle":
    case "sticker":
      return true;
    default:
      return false;
  }
}

export function StoryReader({ storyId, storyPath, storyName, onBack, initialFocus, initialCharacter, initialJump }: StoryReaderProps) {
  const [content, setContent] = useState<ParsedStoryContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [highlightSegmentIndex, setHighlightSegmentIndex] = useState<number | null>(null);
  const [bookmarkMode, setBookmarkMode] = useState(false);
  const [activeCharacter, setActiveCharacter] = useState<string | null>(null);
  const [storyEntry, setStoryEntry] = useState<StoryEntry | null>(null);
  const [storyInfoText, setStoryInfoText] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const readerRootRef = useRef<HTMLDivElement | null>(null);
  const focusAppliedRef = useRef<number | null>(null);
  const characterAppliedRef = useRef<string | null>(null);
  const pendingScrollIndexRef = useRef<number | null>(null);
  const jumpAppliedRef = useRef<number | null>(null);
  const [cluePickerOpen, setCluePickerOpen] = useState(false);
  const [cluePickerIndex, setCluePickerIndex] = useState<number | null>(null);
  const [cluePickerTitle, setCluePickerTitle] = useState<string>("");
  const [cluePickerMode, setCluePickerMode] = useState<"single" | "bulk">("single");
  const [cluePickerBulk, setCluePickerBulk] = useState<number[] | null>(null);

  const { settings, updateSettings, resetSettings } = useReaderSettings();
  const { progress, updateProgress } = useReadingProgress(storyPath);
  const { highlights, toggleHighlight, isHighlighted, clearHighlights } = useHighlights(storyPath);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { sets: clueSets, addItem, addItems, createSet, removeItem, ensureDefaultSetId } = useClueSets();

  const processedSegments = useMemo<StorySegment[]>(() => {
    if (!content) return [];

    const cleaned = content.segments.flatMap<StorySegment>((segment) => {
      if (segment.type === "dialogue" || segment.type === "narration") {
        const normalizedText = segment.text
          .replace(/\r\n/g, "\n")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join("\n");
        if (!normalizedText) {
          return [];
        }
        if (normalizedText === segment.text) {
          return [segment];
        }
        return [{ ...segment, text: normalizedText }];
      }

      if (segment.type === "decision") {
        const options = segment.options.map((option) => option.trim()).filter(Boolean);
        if (options.length === 0) {
          return [];
        }
        if (options.length === segment.options.length) {
          return [segment];
        }
        return [{ ...segment, options }];
      }

      return [segment];
    });

    const merged: StorySegment[] = [];
    cleaned.forEach((segment) => {
      if (segment.type === "dialogue") {
        const last = merged[merged.length - 1];
        if (last && last.type === "dialogue" && last.characterName === segment.characterName) {
          merged[merged.length - 1] = {
            ...last,
            text: `${last.text}\n${segment.text}`.replace(/\n{2,}/g, "\n"),
          };
          return;
        }
      }
      merged.push(segment);
    });

    return merged;
  }, [content]);

  // Ensure default clue set exists early to guarantee subsequent add operations
  useEffect(() => {
    try { ensureDefaultSetId(); } catch {}
  }, [ensureDefaultSetId]);

  const highlightEntries = useMemo(
    () =>
      highlights
        .map((segmentIndex) => {
          const segment = processedSegments[segmentIndex];
          if (!segment) return null;

          let preview = "";
          switch (segment.type) {
            case "dialogue": {
              const primary = segment.text.split("\n")[0] ?? "";
              preview = `${segment.characterName}: ${primary}`;
              break;
            }
            case "narration":
            case "system":
            case "subtitle":
            case "sticker":
              preview = segment.text.split("\n")[0] ?? "";
              break;
            default:
              return null;
          }

          const normalized = preview.replace(/\s+/g, " ").trim();
          if (!normalized) {
            return null;
          }
          const label = normalized.length > 70 ? `${normalized.slice(0, 70)}…` : normalized;
          return { index: segmentIndex, label };
        })
        .filter((entry): entry is { index: number; label: string } => entry !== null),
    [highlights, processedSegments]
  );

  const totalPages = useMemo(() => {
    if (!processedSegments.length) return 0;
    return Math.max(1, Math.ceil(processedSegments.length / SEGMENTS_PER_PAGE));
  }, [processedSegments]);

  const progressPercentage = useMemo(() => {
    const clamped = Math.max(0, Math.min(1, progressValue));
    return Math.round(clamped * 1000) / 10; // keep one decimal precision
  }, [progressValue]);

  const readerContentStyles = useMemo(() => {
    const maxWidthPx = Math.round((settings.pageWidth / 100) * BASE_MAX_WIDTH);
    const style: CSSProperties = {
      fontFamily: settings.fontFamily === "system" ? undefined : settings.fontFamily,
      fontSize: `${settings.fontSize}px`,
      lineHeight: settings.lineHeight,
      letterSpacing: `${settings.letterSpacing}px`,
      textAlign: settings.textAlign,
      maxWidth: `${maxWidthPx}px`,
      width: "100%",
    };
    return style;
  }, [
    settings.fontFamily,
    settings.fontSize,
    settings.letterSpacing,
    settings.lineHeight,
    settings.pageWidth,
    settings.paragraphSpacing,
    settings.textAlign,
  ]);

  const readerSpacing = useMemo(
    () => `${Math.max(settings.paragraphSpacing, 0.5)}rem`,
    [settings.paragraphSpacing]
  );

  const renderLines = useCallback((text: string) => {
    const parts = text.split("\n");
    return parts.map((line, index) => (
      <span key={index}>
        {line}
        {index < parts.length - 1 ? <br /> : null}
      </span>
    ));
  }, []);

  const getSegmentSearchText = useCallback((segment: StorySegment) => {
    switch (segment.type) {
      case "dialogue":
        return `${segment.characterName} ${segment.text}`;
      case "narration":
      case "subtitle":
      case "sticker":
        return segment.text;
      case "system":
        return segment.speaker ? `${segment.speaker} ${segment.text}` : segment.text;
      case "decision":
        return segment.options.join(" ");
      default:
        return "";
    }
  }, []);

  const getSegmentPreview = useCallback((segment: StorySegment) => {
    switch (segment.type) {
      case "dialogue": {
        const primary = segment.text.split("\n")[0] ?? "";
        return `${segment.characterName}: ${primary}`.replace(/\s+/g, " ").trim();
      }
      case "narration":
      case "system":
      case "subtitle":
      case "sticker":
        return (segment.text.split("\n")[0] ?? "").replace(/\s+/g, " ").trim();
      default:
        return "";
    }
  }, []);

  const getSegmentDigestHex = useCallback((segment: StorySegment) => {
    const text = getSegmentSearchText(segment);
    const normalized = normalizeForDigest(text);
    const d = fnv1a64(normalized);
    return digestToHex64(d);
  }, [getSegmentSearchText]);

  const importedSegmentIndexSet = useMemo(() => {
    const set = new Set<number>();
    Object.values(clueSets).forEach((cs) => {
      cs.items.forEach((it) => {
        if (it.storyId === storyId) set.add(it.segmentIndex);
      });
    });
    return set;
  }, [clueSets, storyId]);

  const findFocusSegmentIndex = useCallback(
    (focus: ReaderSearchFocus): number | null => {
      const normalizedQuery = focus.query.trim().toLowerCase();
      const normalizedSnippet = focus.snippet
        ?.replace(/…/g, " ")
        .replace(/\.{3}/g, " ")
        .trim()
        .toLowerCase();
      const queryNoSpaces = normalizedQuery.replace(/\s+/g, "");
      const snippetNoSpaces = normalizedSnippet?.replace(/\s+/g, "");

      // 更强健的匹配：移除标点/符号后再匹配一次
      const stripSymbols = (s: string) =>
        s
          .normalize("NFKC")
          .toLowerCase()
          // 移除所有标点、符号以及空白
          .replace(/[\p{P}\p{S}\s]+/gu, "");
      const queryStripped = normalizedQuery ? stripSymbols(normalizedQuery) : "";
      const snippetStripped = normalizedSnippet ? stripSymbols(normalizedSnippet) : "";

      if (!normalizedQuery && !normalizedSnippet) {
        return null;
      }

      for (let i = 0; i < processedSegments.length; i += 1) {
        const segment = processedSegments[i];
        const text = getSegmentSearchText(segment);
        if (!text) continue;
        const normalizedText = text.replace(/\s+/g, " ").toLowerCase();
        const collapsedText = normalizedText.replace(/\s+/g, "");
        const strippedText = stripSymbols(text);

        if (normalizedSnippet && (normalizedText.includes(normalizedSnippet) || collapsedText.includes(snippetNoSpaces ?? ""))) {
          return i;
        }

        if (normalizedQuery && (normalizedText.includes(normalizedQuery) || collapsedText.includes(queryNoSpaces))) {
          return i;
        }

        if ((snippetStripped && strippedText.includes(snippetStripped)) || (queryStripped && strippedText.includes(queryStripped))) {
          return i;
        }
      }

      return null;
    },
    [getSegmentSearchText, processedSegments]
  );

  const scrollToSegment = useCallback(
    (segmentIndex: number, behavior: ScrollBehavior = "smooth") => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const element = container.querySelector<HTMLElement>(
        `[data-segment-index="${segmentIndex}"]`
      );
      if (!element) return;

      const doScroll = (top: number) => container.scrollTo({ top: Math.max(top, 0), behavior });

      // 路径1：几何位置（大多数布局准确）
      try {
        const cRect = container.getBoundingClientRect();
        const eRect = element.getBoundingClientRect();
        const targetTop = container.scrollTop + (eRect.top - cRect.top) - 32;
        if (Number.isFinite(targetTop)) {
          doScroll(targetTop);
          return;
        }
      } catch {}

      // 路径2：累计 offsetTop（兜底）
      try {
        let top = 0;
        let node: HTMLElement | null = element;
        while (node && node !== container) {
          top += node.offsetTop;
          node = node.offsetParent as HTMLElement | null;
        }
        doScroll(top - 32);
        return;
      } catch {}

      // 路径3：scrollIntoView 兜底
      try {
        element.scrollIntoView({ behavior, block: "start" });
      } catch {}
    },
    [settings.readingMode]
  );

  const renderableSegments = useMemo<RenderableSegment[]>(() => {
    if (!processedSegments.length) return [];
    if (settings.readingMode === "paged") {
      const start = currentPage * SEGMENTS_PER_PAGE;
      const end = Math.min(start + SEGMENTS_PER_PAGE, processedSegments.length);
      return processedSegments.slice(start, end).map((segment, offset) => ({
        segment,
        index: start + offset,
      }));
    }
    return processedSegments.map((segment, index) => ({ segment, index }));
  }, [processedSegments, currentPage, settings.readingMode]);

  const insights = useMemo(() => {
    if (!processedSegments.length) {
      return { characters: [] as Array<{ name: string; count: number; firstIndex: number }>, decisions: [] as Array<{ index: number; options: string[] }> };
    }

    const characterMap = new Map<string, { count: number; firstIndex: number }>();
    const decisions: Array<{ index: number; options: string[] }> = [];

    processedSegments.forEach((segment, index) => {
      if (segment.type === "dialogue") {
        const entry = characterMap.get(segment.characterName);
        if (entry) {
          entry.count += 1;
        } else {
          characterMap.set(segment.characterName, { count: 1, firstIndex: index });
        }
      } else if (segment.type === "decision") {
        decisions.push({ index, options: segment.options });
      }
    });

    const characters = Array.from(characterMap.entries())
      .map(([name, meta]) => ({ name, ...meta }))
      .sort((a, b) => b.count - a.count);

    return { characters, decisions };
  }, [processedSegments]);

  const loadStory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getStoryContent(storyPath);
      setContent(data);
      setCurrentPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [storyPath]);

  useEffect(() => {
    loadStory();
  }, [loadStory]);

  // 加载完整的 StoryEntry 用于收藏
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const entry = await api.getStoryEntry(storyId);
        if (mounted) setStoryEntry(entry);
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [storyId]);

  useEffect(() => {
    let cancelled = false;
    setStoryInfoText(null);
    const infoPath = storyEntry?.storyInfo?.trim();
    if (!infoPath) {
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const raw = await api.getStoryInfo(infoPath);
        if (cancelled) return;
        const normalized = raw.replace(/\r\n/g, "\n").trim();
        setStoryInfoText(normalized.length > 0 ? normalized : null);
      } catch (err) {
        console.warn("[StoryReader] Failed to load story summary:", err);
        if (!cancelled) {
          setStoryInfoText(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storyEntry?.storyInfo]);

  useEffect(() => {
    setHighlightSegmentIndex(null);
    focusAppliedRef.current = null;
    setActiveCharacter(null);
  }, [storyId, storyPath]);

  useLayoutEffect(() => {
    if (!processedSegments.length) return;

    // 若正在处理搜索跳转或初始定位，避免恢复旧的阅读进度，以免覆盖滚动
    const shouldSkipRestore =
      pendingScrollIndexRef.current !== null ||
      (initialFocus && initialFocus.storyId === storyId) ||
      (initialJump && initialJump.storyId === storyId);
    if (shouldSkipRestore) {
      return;
    }

    if (settings.readingMode === "paged") {
      const storedPage =
        progress?.readingMode === "paged" && typeof progress.currentPage === "number"
          ? Math.min(progress.currentPage, Math.max(totalPages - 1, 0))
          : 0;
      setCurrentPage(storedPage);
      const ratio = totalPages <= 1 ? 1 : (storedPage + 1) / totalPages;
      setProgressValue(Number.isFinite(ratio) ? ratio : 0);
    } else {
      const container = scrollContainerRef.current;
      if (!container) return;
      const storedTop =
        progress?.readingMode === "scroll" && typeof progress.scrollTop === "number"
          ? progress.scrollTop
          : 0;
      container.scrollTo({ top: storedTop });
      const { scrollHeight, clientHeight } = container;
      const denominator = scrollHeight - clientHeight;
      const ratio = denominator <= 0 ? 1 : storedTop / denominator;
      setProgressValue(Number.isFinite(ratio) ? ratio : 0);
    }
  }, [processedSegments, settings.readingMode, progress, totalPages, initialFocus, initialJump, storyId]);

  // 初始角色高亮与定位
  useEffect(() => {
    if (!processedSegments.length) return;
    if (!initialCharacter) return;
    if (characterAppliedRef.current === initialCharacter && activeCharacter === initialCharacter) return;

    // 查找该角色的第一条对话段落
    let firstIndex: number | null = null;
    for (let i = 0; i < processedSegments.length; i += 1) {
      const seg = processedSegments[i];
      if (seg.type === "dialogue" && seg.characterName === initialCharacter) {
        firstIndex = i;
        break;
      }
    }
    setActiveCharacter(initialCharacter);
    characterAppliedRef.current = initialCharacter;
    if (firstIndex !== null) {
      // 平滑滚动至第一条出现位置
      scrollToSegment(firstIndex, "auto");
    }
  }, [processedSegments, initialCharacter, activeCharacter, scrollToSegment]);

  useEffect(() => {
    if (!processedSegments.length || settings.readingMode !== "scroll") return;
    const container = scrollContainerRef.current;
    if (!container) return;

    let frame = 0;
    const handleScroll = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const denominator = scrollHeight - clientHeight;
        const ratio = denominator <= 0 ? 1 : scrollTop / denominator;
        const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
        setProgressValue(clamped);
        updateProgress({
          readingMode: "scroll",
          scrollTop,
          percentage: clamped,
          updatedAt: Date.now(),
        });
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [processedSegments, settings.readingMode, updateProgress]);

  useEffect(() => {
    if (!processedSegments.length || settings.readingMode !== "paged" || totalPages === 0) return;
    const ratio = totalPages <= 1 ? 1 : (currentPage + 1) / totalPages;
    const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
    setProgressValue(clamped);
    updateProgress({
      readingMode: "paged",
      currentPage,
      percentage: clamped,
      updatedAt: Date.now(),
    });
  }, [processedSegments, currentPage, settings.readingMode, totalPages, updateProgress]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName && ["INPUT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }

      if (settings.readingMode === "paged") {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setCurrentPage((prev) => Math.max(0, prev - 1));
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1));
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [settings.readingMode, totalPages]);

  const jumpToSegment = useCallback(
    (index: number, options?: { highlightSearch?: boolean }) => {
      if (!processedSegments.length) return;

      if (options?.highlightSearch) {
        setHighlightSegmentIndex(index);
      } else if (options?.highlightSearch === false) {
        setHighlightSegmentIndex(null);
      }

      pendingScrollIndexRef.current = index;
      if (settings.readingMode === "scroll") {
        // 直接尝试一次，若元素未渲染，layout effect 会再次兜底
        scrollToSegment(index);
      } else {
        const targetPage = Math.min(Math.floor(index / SEGMENTS_PER_PAGE), totalPages - 1);
        setCurrentPage(targetPage);
      }
    },
    [processedSegments, scrollToSegment, settings.readingMode, totalPages]
  );

  // 优先处理 share code 跳转（initialJump）
  useEffect(() => {
    if (!initialJump || !processedSegments.length) return;
    const token = initialJump.issuedAt ?? Date.now();
    if (jumpAppliedRef.current === token) return;

    let target = initialJump.segmentIndex;
    const hex = (initialJump.digestHex || "").toLowerCase();
    const hasDigest = hex !== "" && !/^0+$/.test(hex);
    if (hasDigest && target >= 0 && target < processedSegments.length) {
      const seg = processedSegments[target];
      const digest = getSegmentDigestHex(seg).toLowerCase();
      if (digest !== hex) {
        const want = hex;
        const range = 12;
        let found: number | null = null;
        for (
          let i = Math.max(0, target - range);
          i <= Math.min(processedSegments.length - 1, target + range);
          i++
        ) {
          const d = getSegmentDigestHex(processedSegments[i]).toLowerCase();
          if (d === want) {
            found = i;
            break;
          }
        }
        if (found !== null) target = found;
      }
    }

    if ((!hasDigest || target < 0 || target >= processedSegments.length) && initialJump.preview) {
      const idx = findFocusSegmentIndex({ storyId, query: "", snippet: initialJump.preview });
      if (idx !== null) target = idx;
    }

    if (target >= 0 && target < processedSegments.length) {
      setActiveCharacter(null);
      jumpToSegment(target, { highlightSearch: true });
    }
    jumpAppliedRef.current = token;
  }, [
    initialJump,
    processedSegments,
    getSegmentDigestHex,
    findFocusSegmentIndex,
    jumpToSegment,
    storyId,
  ]);

  // 当页面或段落渲染完成后，执行挂起的滚动请求（最多尝试几次）
  useLayoutEffect(() => {
    if (pendingScrollIndexRef.current === null) return;
    let tries = 0;
    const tick = () => {
      const index = pendingScrollIndexRef.current;
      if (index === null) return;
      const container = scrollContainerRef.current;
      if (container) {
        const element = container.querySelector<HTMLElement>(`[data-segment-index="${index}"]`);
        if (element) {
          // 找到了目标元素，执行滚动
          scrollToSegment(index);
          pendingScrollIndexRef.current = null;
          return;
        }
      }
      if (tries < 30) {
        tries += 1;
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, [renderableSegments, currentPage, settings.readingMode, scrollToSegment]);

  useEffect(() => {
    if (!initialFocus || !processedSegments.length) return;
    const token = initialFocus.issuedAt ?? Date.now();
    if (focusAppliedRef.current === token && highlightSegmentIndex !== null) {
      return;
    }

    const targetIndex = findFocusSegmentIndex(initialFocus);
    if (targetIndex === null) {
      focusAppliedRef.current = token;
      setHighlightSegmentIndex(null);
      return;
    }

    setActiveCharacter(null);
    jumpToSegment(targetIndex, { highlightSearch: true });
    focusAppliedRef.current = token;
  }, [
    initialFocus,
    processedSegments,
    findFocusSegmentIndex,
    jumpToSegment,
    highlightSegmentIndex,
  ]);

  const handleCharacterHighlight = useCallback(
    (name: string, firstIndex: number) => {
      if (activeCharacter === name) {
        setActiveCharacter(null);
        setHighlightSegmentIndex(null);
        return;
      }

      setActiveCharacter(name);
      jumpToSegment(firstIndex, { highlightSearch: false });
      setInsightsOpen(false);
    },
    [activeCharacter, jumpToSegment]
  );

  const handleAddHighlightToClueSet = useCallback((index: number) => {
    // simplified flow: toggle highlight already auto-add, so this becomes no-op
    setCluePickerOpen(false);
  }, []);

  const handleBulkAddHighlights = useCallback(() => {
    // simplified: already auto-added on highlight; keep as no-op
    setCluePickerOpen(false);
  }, []);

  const confirmAddToSet = useCallback((setId: string) => {
    setCluePickerOpen(false);
    setCluePickerIndex(null);
    setCluePickerBulk(null);
    setCluePickerTitle("");
  }, []);

  // Auto-sync highlight <-> default clue set
  const addSegmentToDefault = useCallback((index: number) => {
    const seg = processedSegments[index];
    if (!seg) return;
    const setId = ensureDefaultSetId();
    const preview = getSegmentPreview(seg);
    const digestHex = getSegmentDigestHex(seg);
    addItem(setId, { storyId, segmentIndex: index, preview, digestHex });
  }, [addItem, ensureDefaultSetId, getSegmentDigestHex, getSegmentPreview, processedSegments, storyId]);

  const removeSegmentFromDefault = useCallback((index: number) => {
    const setId = ensureDefaultSetId();
    removeItem(setId, storyId, index);
  }, [ensureDefaultSetId, removeItem, storyId]);

  const handleToggleHighlightUnified = useCallback((index: number) => {
    const before = isHighlighted(index);
    toggleHighlight(index);
    if (!before) {
      addSegmentToDefault(index);
    } else {
      removeSegmentFromDefault(index);
    }
  }, [addSegmentToDefault, isHighlighted, removeSegmentFromDefault, toggleHighlight]);

  const clearCharacterHighlight = useCallback(() => {
    setActiveCharacter(null);
    setHighlightSegmentIndex(null);
  }, []);

  const handleClearHighlightsUnified = useCallback(() => {
    const setId = ensureDefaultSetId();
    // Remove all current highlights from default set
    highlights.forEach((idx) => removeItem(setId, storyId, idx));
    clearHighlights();
  }, [clearHighlights, ensureDefaultSetId, highlights, removeItem, storyId]);

  const handleJumpToSegment = useCallback(
    (index: number) => {
      jumpToSegment(index, { highlightSearch: false });
      setInsightsOpen(false);
    },
    [jumpToSegment]
  );

  const renderSegment = useCallback(
    ({ segment, index }: RenderableSegment, isLast: boolean) => {
      const spacing = isLast ? "0" : readerSpacing;
      const highlightable = isSegmentHighlightable(segment);
      const annotationHighlight = highlightable ? isHighlighted(index) : false;
      const searchHighlighted = highlightSegmentIndex === index;
      const characterHighlighted =
        highlightable && segment.type === "dialogue" && activeCharacter === segment.characterName;
      const highlighted = annotationHighlight || searchHighlighted;
      const showHighlightButton = highlightable && bookmarkMode;

      const segmentStyle: CSSProperties = { marginBottom: spacing };
      if (!showHighlightButton) {
        segmentStyle.paddingRight = "1.25rem";
      }

      const highlightButton = showHighlightButton ? (
        <button
          type="button"
          className={cn("reader-highlight-toggle", annotationHighlight && "is-active")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleToggleHighlightUnified(index);
          }}
          aria-label={highlighted ? "取消划线收藏" : "划线收藏"}
        >
          {highlighted ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
        </button>
      ) : null;

      if (segment.type === "dialogue") {
        return (
          <div
            key={index}
            data-segment-index={index}
          className={cn(
            "reader-paragraph reader-dialogue reader-segment pr-10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500",
            annotationHighlight && "reader-highlighted",
            searchHighlighted && "reader-search-highlight",
            characterHighlighted && "reader-character-highlight"
          )}
          style={{
            ...segmentStyle,
            textAlign: segment.position === "right" ? ("right" as CSSProperties["textAlign"]) : undefined,
          }}
        >
          {highlightButton}
          <div className="reader-character-name">{segment.characterName}</div>
          <div className="reader-text">{renderLines(segment.text)}</div>
        </div>
      );
      }

      if (segment.type === "narration") {
        return (
          <div
            key={index}
            data-segment-index={index}
            className={cn(
              "reader-narration reader-segment pr-10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500",
              annotationHighlight && "reader-highlighted",
              searchHighlighted && "reader-search-highlight"
            )}
            style={segmentStyle}
          >
            {highlightButton}
            {renderLines(segment.text)}
          </div>
        );
      }

      if (segment.type === "decision") {
        return (
          <div
            key={index}
            data-segment-index={index}
            className={cn(
              "reader-decision motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500",
              searchHighlighted && "reader-search-highlight"
            )}
            style={{ marginBottom: spacing }}
          >
            <div className="reader-decision-title">选择：</div>
            {segment.options.map((option, optionIndex) => (
              <div
                key={optionIndex}
                className="reader-decision-option motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500"
                style={{ animationDelay: `${optionIndex * 60}ms` }}
              >
                <span className="reader-decision-bullet">{optionIndex + 1}</span>
                <span>{option}</span>
              </div>
            ))}
          </div>
        );
      }

      if (segment.type === "system") {
        return (
          <div
            key={index}
            data-segment-index={index}
            className={cn(
              "reader-system reader-segment pr-10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500",
              annotationHighlight && "reader-highlighted",
              searchHighlighted && "reader-search-highlight"
            )}
            style={segmentStyle}
          >
            {highlightButton}
            {segment.speaker ? (
              <div className="reader-system-speaker">{segment.speaker}</div>
            ) : null}
            <div className="reader-text">{renderLines(segment.text)}</div>
          </div>
        );
      }

      if (segment.type === "subtitle") {
        const normalizedAlignment = segment.alignment?.toLowerCase();
        const alignment =
          normalizedAlignment && ["left", "center", "right"].includes(normalizedAlignment)
            ? (normalizedAlignment as CSSProperties["textAlign"])
            : undefined;

        return (
          <div
            key={index}
            data-segment-index={index}
            className={cn(
              "reader-subtitle reader-segment pr-10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500",
              annotationHighlight && "reader-highlighted",
              searchHighlighted && "reader-search-highlight"
            )}
            style={{ ...segmentStyle, textAlign: alignment }}
          >
            {highlightButton}
            {renderLines(segment.text)}
          </div>
        );
      }

      if (segment.type === "sticker") {
        const normalizedAlignment = segment.alignment?.toLowerCase();
        const alignment =
          normalizedAlignment && ["left", "center", "right"].includes(normalizedAlignment)
            ? (normalizedAlignment as CSSProperties["textAlign"])
            : undefined;

        return (
          <div
            key={index}
            data-segment-index={index}
            className={cn(
              "reader-sticker reader-segment pr-10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500",
              annotationHighlight && "reader-highlighted",
              searchHighlighted && "reader-search-highlight"
            )}
            style={{ ...segmentStyle, textAlign: alignment }}
          >
            {highlightButton}
            {renderLines(segment.text)}
          </div>
        );
      }

      if (segment.type === "header") {
        return (
          <div
            key={index}
            data-segment-index={index}
            className="reader-header motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500"
            style={{ marginBottom: spacing }}
          >
            {segment.title}
          </div>
        );
      }

      return null;
    },
    [bookmarkMode, highlightSegmentIndex, isHighlighted, readerSpacing, renderLines, toggleHighlight]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <div className="text-destructive">加载失败: {error}</div>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </Button>
      </div>
    );
  }

  if (!content || processedSegments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <div className="text-muted-foreground">暂无内容</div>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={readerRootRef}
      className="h-full flex flex-col overflow-hidden reader-surface motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500"
      data-reader-theme={settings.theme}
      data-bookmark-mode={bookmarkMode ? "enabled" : "disabled"}
    >
      <header className="flex-shrink-0 z-20 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-b motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500">
        <div className="container flex items-center gap-2 h-16">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="返回剧情列表">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">{storyName}</h1>
            <div className="text-[11px] uppercase tracking-wider text-[hsl(var(--color-muted-foreground))]">
              {settings.readingMode === "paged"
                ? `第 ${currentPage + 1} / ${totalPages} 页`
                : `已读 ${progressPercentage}%`}
            </div>
            {storyEntry && (
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[hsl(var(--color-muted-foreground))]">
                {storyEntry.storyCode && (
                  <span className="px-1.5 py-0.5 rounded bg-[hsl(var(--color-accent))]">{storyEntry.storyCode}</span>
                )}
                {storyEntry.avgTag && (
                  <span className="px-1.5 py-0.5 rounded bg-[hsl(var(--color-accent))]">{storyEntry.avgTag}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setInsightsOpen((prev) => !prev)}
              aria-label="剧情导览"
            >
              <ListTree className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={!storyEntry}
              onClick={() => storyEntry && toggleFavorite(storyEntry)}
              aria-label={isFavorite(storyId) ? "取消收藏" : "收藏本关卡"}
              title={isFavorite(storyId) ? "取消收藏" : "收藏本关卡"}
              className={cn(isFavorite(storyId) && "text-[hsl(var(--color-primary))]")}
            >
              <Star className="h-5 w-5" fill={isFavorite(storyId) ? "currentColor" : "transparent"} strokeWidth={isFavorite(storyId) ? 0 : 2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setBookmarkMode((prev) => !prev)}
              aria-label={bookmarkMode ? "关闭收藏模式" : "开启收藏模式"}
              title={bookmarkMode ? "关闭收藏模式" : "开启收藏模式"}
              aria-pressed={bookmarkMode}
              className={cn(bookmarkMode && "text-[hsl(var(--color-primary))]")}
            >
              {bookmarkMode ? <BookmarkCheck className="h-5 w-5" /> : <BookmarkPlus className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              aria-label="打开阅读设置"
            >
              <SettingsIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div className="progress-track">
          <div
            className="progress-thumb"
            style={{ width: `${progressPercentage}%` }}
            aria-hidden="true"
          />
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <CustomScrollArea
          className="h-full"
          viewportClassName={cn(
            "touch-action-pan-y reader-scroll",
            settings.readingMode === "paged" && "reader-scroll--paged"
          )}
          viewportRef={scrollContainerRef}
          trackOffsetTop="calc(4rem + 10px)"
          trackOffsetBottom={
            settings.readingMode === "paged"
              ? "5.5rem"
              : "calc(2.5rem + env(safe-area-inset-bottom, 0px))"
          }
        >
          <div className="container py-8 pb-24 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700">
            <div className="reader-content motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700" style={readerContentStyles}>
              {storyInfoText && (
                <div className="reader-summary motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700">
                  <div className="reader-summary-label">剧情概述</div>
                  <div className="reader-summary-body">{renderLines(storyInfoText)}</div>
                </div>
              )}
              {renderableSegments.map((segment, idx) =>
                renderSegment(segment, idx === renderableSegments.length - 1)
              )}
            </div>
          </div>
        </CustomScrollArea>
      </main>

      {settings.readingMode === "paged" && (
        <footer className="flex-shrink-0 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-t p-4">
          <div className="container flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
              disabled={currentPage === 0}
              className="flex-1"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              上一页
            </Button>
            <div className="text-xs text-[hsl(var(--color-muted-foreground))] min-w-[4rem] text-center">
              {progressPercentage}%
            </div>
            <Button
              variant="outline"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
              disabled={currentPage >= totalPages - 1}
              className="flex-1"
            >
              下一页
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </footer>
      )}

      {insightsOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
            onClick={() => setInsightsOpen(false)}
          />
          <aside className="fixed inset-0 z-50 flex">
            <div className="ml-auto h-full w-full max-w-sm sm:max-w-md relative motion-safe:animate-in motion-safe:slide-in-from-right-10 motion-safe:duration-300">
              <Card className="relative z-10 h-full rounded-none sm:rounded-l-2xl flex flex-col shadow-2xl border-l border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] overflow-hidden">
                <CardHeader className="flex flex-row items-start justify-between gap-4 sticky top-0 bg-[hsl(var(--color-card))] border-b px-5 sm:px-6 py-4">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-[hsl(var(--color-muted-foreground))]">
                      Story Guide
                    </div>
                    <CardTitle className="text-lg font-semibold mt-1">剧情导览</CardTitle>
                    <p className="mt-2 text-sm text-[hsl(var(--color-muted-foreground))] leading-relaxed max-w-xs">
                      快速定位关键角色与抉择节点，辅助你以导演视角重温剧情。
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setInsightsOpen(false)}>
                    <ArrowLeft className="h-5 w-5 rotate-180" />
                  </Button>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0">
                  <CustomScrollArea
                    className="h-full"
                    viewportClassName="reader-scroll"
                    hideTrackWhenIdle={false}
                    trackOffsetTop="4.5rem"
                  >
                    <div className="p-6 space-y-8">
                      <section>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold uppercase tracking-widest text-[hsl(var(--color-muted-foreground))]">
                            划线收藏
                          </h3>
                          <div className="flex items-center gap-2">
                            {/* 简化：划线默认加入线索集，移除“全部加入” */}
                            {highlightEntries.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-auto px-2 py-1 text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-destructive))]"
                                onClick={handleClearHighlightsUnified}
                              >
                                清空
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          {highlightEntries.length === 0 && (
                            <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
                              暂无划线内容
                            </div>
                          )}
                          {highlightEntries.map((entry) => {
                            const already = importedSegmentIndexSet.has(entry.index);
                            return (
                            <div
                              key={entry.index}
                              className="flex items-start gap-3 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] p-3 shadow-sm"
                            >
                              <button
                                className="flex-1 text-left text-sm leading-relaxed hover:text-[hsl(var(--color-primary))] transition-colors"
                                onClick={() => handleJumpToSegment(entry.index)}
                              >
                                {entry.label}
                              </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-[hsl(var(--color-primary))]"
                            title="已加入线索集"
                            disabled
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-destructive))]"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleToggleHighlightUnified(entry.index);
                                }}
                                aria-label="移除划线"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          );})}
                        </div>
                      </section>

                      <section>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold uppercase tracking-widest text-[hsl(var(--color-muted-foreground))]">
                            角色出场
                          </h3>
                          {activeCharacter && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-auto px-2 py-1 text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-destructive))]"
                              onClick={clearCharacterHighlight}
                            >
                              清除高亮
                            </Button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {insights.characters.length === 0 && (
                            <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
                              暂无角色统计
                            </div>
                          )}
                          {insights.characters.map((character) => (
                            <button
                              key={character.name}
                              onClick={() => handleCharacterHighlight(character.name, character.firstIndex)}
                              className={cn(
                                "w-full flex items-center justify-between rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] px-3 py-2 text-left transition-colors",
                                activeCharacter === character.name
                                  ? "border-[hsl(var(--color-primary))] bg-[hsl(var(--color-accent))] text-[hsl(var(--color-primary))]"
                                  : "hover:bg-[hsl(var(--color-accent))]"
                              )}
                            >
                              <div className="font-medium">{character.name}</div>
                              <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
                                {character.count} 次
                              </div>
                            </button>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h3 className="text-sm font-semibold uppercase tracking-widest text-[hsl(var(--color-muted-foreground))] mb-3">
                          抉择片段
                        </h3>
                        <div className="space-y-3">
                          {insights.decisions.length === 0 && (
                            <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
                              尚未出现抉择
                            </div>
                          )}
                          {insights.decisions.map((decision, idx) => (
                            <div
                              key={`${decision.index}-${idx}`}
                              className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] p-3 shadow-sm"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">抉择 {idx + 1}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-auto px-2 py-1"
                                  onClick={() => handleJumpToSegment(decision.index)}
                                >
                                  前往
                                </Button>
                              </div>
                              <div className="space-y-1 text-xs text-[hsl(var(--color-muted-foreground))]">
                                {decision.options.map((option, optionIndex) => (
                                  <div key={optionIndex} className="flex gap-2">
                                    <span className="text-[hsl(var(--color-primary))]">
                                      {optionIndex + 1}.
                                    </span>
                                    <span className="flex-1">{option}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </CustomScrollArea>
                </CardContent>
              </Card>
            </div>
          </aside>
        </>
      )}

      {cluePickerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setCluePickerOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">加入线索集</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-xs text-[hsl(var(--color-muted-foreground))] mb-2">选择现有线索集</div>
                  <div className="max-h-48 overflow-auto border rounded">
                    {Object.values(clueSets).length === 0 ? (
                      <div className="p-3 text-xs text-[hsl(var(--color-muted-foreground))]">暂无线索集</div>
                    ) : (
                      Object.values(clueSets)
                        .sort((a, b) => b.updatedAt - a.updatedAt)
                        .map((s) => (
                          <button key={s.id} className="w-full px-3 py-2 text-left hover:bg-[hsl(var(--color-accent))] border-b last:border-b-0" onClick={() => confirmAddToSet(s.id)}>
                            <div className="text-sm">{s.title}</div>
                            <div className="text-[10px] text-[hsl(var(--color-muted-foreground))]">{s.items.length} 条</div>
                          </button>
                        ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[hsl(var(--color-muted-foreground))] mb-2">或新建线索集</div>
                  <div className="flex items-center gap-2">
                    <Input placeholder="线索集名称" value={cluePickerTitle} onChange={(e) => setCluePickerTitle(e.target.value)} />
                    <Button onClick={() => {
                      const id = createSet(cluePickerTitle.trim() || "我的线索集");
                      confirmAddToSet(id);
                    }} disabled={!cluePickerTitle.trim()}>
                      新建并加入
                    </Button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setCluePickerOpen(false)}>取消</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <ReaderSettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={updateSettings}
        onReset={resetSettings}
      />
    </div>
  );
}
