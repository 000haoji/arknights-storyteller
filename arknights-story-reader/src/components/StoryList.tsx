import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/services/api";
import type { RoguelikeCharm, RoguelikeStage, StoryEntry } from "@/types/story";
import { Button } from "@/components/ui/button";
import { BookOpen, RefreshCw, Star, FileText } from "lucide-react";
import { SyncDialog } from "@/components/SyncDialog";
import { Collapsible } from "@/components/ui/collapsible";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";
import { Input } from "@/components/ui/input";
import { useFavorites } from "@/hooks/useFavorites";
import { useAppPreferences } from "@/hooks/useAppPreferences";

const CATEGORY_TABS = [
  { id: "favorites" as const, label: "收藏" },
  { id: "main" as const, label: "主线剧情" },
  { id: "activity" as const, label: "活动剧情" },
  { id: "sidestory" as const, label: "支线" },
  { id: "roguelike" as const, label: "肉鸽" },
  { id: "rogueCharm" as const, label: "肉鸽道具" },
  { id: "rogueStage" as const, label: "肉鸽场景" },
  { id: "memory" as const, label: "干员密录" },
  { id: "record" as const, label: "主线笔记" },
  { id: "rune" as const, label: "危机合约" },
];

const CATEGORY_DESCRIPTIONS: Record<
  | "favorites"
  | "main"
  | "activity"
  | "sidestory"
  | "roguelike"
  | "rogueCharm"
  | "rogueStage"
  | "memory"
  | "record"
  | "rune",
  string
> = {
  favorites: "收藏喜爱的章节或关卡",
  main: "主线章节",
  activity: "活动剧情列表",
  sidestory: "支线故事",
  roguelike: "肉鸽模式剧情",
  rogueCharm: "肉鸽模式符文道具",
  rogueStage: "肉鸽模式战斗场景与事件",
  memory: "干员密录故事",
  record: "主线章节笔记与日志",
  rune: "危机合约剧情",
};

interface StoryListProps {
  onSelectStory: (story: StoryEntry) => void;
}

export function StoryList({ onSelectStory }: StoryListProps) {
  const [mainGrouped, setMainGrouped] = useState<Array<[string, StoryEntry[]]>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<
    | 'favorites'
    | 'main'
    | 'activity'
    | 'sidestory'
    | 'roguelike'
    | 'rogueCharm'
    | 'rogueStage'
    | 'memory'
    | 'record'
    | 'rune'
  >('main');
  const [activityGrouped, setActivityGrouped] = useState<Array<[string, StoryEntry[]]>>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [sidestoryGrouped, setSidestoryGrouped] = useState<Array<[string, StoryEntry[]]>>([]);
  const [sidestoryLoading, setSidestoryLoading] = useState(false);
  const [sidestoryLoaded, setSidestoryLoaded] = useState(false);
  const [roguelikeGrouped, setRoguelikeGrouped] = useState<Array<[string, StoryEntry[]]>>([]);
  const [roguelikeLoading, setRoguelikeLoading] = useState(false);
  const [roguelikeLoaded, setRoguelikeLoaded] = useState(false);
  const [roguelikeCharms, setRoguelikeCharms] = useState<RoguelikeCharm[]>([]);
  const [roguelikeCharmsLoading, setRoguelikeCharmsLoading] = useState(false);
  const [roguelikeCharmsLoaded, setRoguelikeCharmsLoaded] = useState(false);
  const [roguelikeStages, setRoguelikeStages] = useState<RoguelikeStage[]>([]);
  const [roguelikeStagesLoading, setRoguelikeStagesLoading] = useState(false);
  const [roguelikeStagesLoaded, setRoguelikeStagesLoaded] = useState(false);
  const [memoryStories, setMemoryStories] = useState<StoryEntry[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [recordGrouped, setRecordGrouped] = useState<Array<[string, StoryEntry[]]>>([]);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordLoaded, setRecordLoaded] = useState(false);
  const [runeStories, setRuneStories] = useState<StoryEntry[]>([]);
  const [runeLoading, setRuneLoading] = useState(false);
  const [runeLoaded, setRuneLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { showSummaries, setShowSummaries } = useAppPreferences();
  const [summaryCache, setSummaryCache] = useState<Record<string, string>>({});
  const [summaryLoadingIds, setSummaryLoadingIds] = useState<Record<string, boolean>>({});
  // memorySummaryVisible 改为全局控制
  const memorySummaryVisible = showSummaries;
  const {
    favoriteStories,
    favoriteGroups,
    isFavorite,
    toggleFavorite,
    isGroupFavorite,
    toggleFavoriteGroup,
  } = useFavorites();
  const handleRequestSummary = useCallback(async (story: StoryEntry) => {
    if (!story.storyInfo) return;
    if (summaryCache[story.storyId] || summaryLoadingIds[story.storyId]) return;

    setSummaryLoadingIds((prev) => ({ ...prev, [story.storyId]: true }));
    try {
      const raw = await api.getStoryInfo(story.storyInfo);
      const normalized = raw.replace(/\r\n/g, "\n").trim();
      setSummaryCache((prev) => ({
        ...prev,
        [story.storyId]: normalized.length > 0 ? normalized : "",
      }));
    } catch (err) {
      console.warn("[StoryList] 加载简介失败:", story.storyId, err);
    } finally {
      setSummaryLoadingIds((prev) => {
        const next = { ...prev };
        delete next[story.storyId];
        return next;
      });
    }
  }, [summaryCache, summaryLoadingIds]);

  const ensureSummariesForStories = useCallback(
    (stories: StoryEntry[]) => {
      stories.forEach((story) => {
        if (!story.storyInfo) return;
        void handleRequestSummary(story);
      });
    },
    [handleRequestSummary]
  );

  const favoriteStoryEntries = useMemo(() => Object.values(favoriteStories), [favoriteStories]);
  const favoriteGroupEntries = useMemo(
    () => Object.values(favoriteGroups),
    [favoriteGroups]
  );

  const roguelikeStageMap = useMemo(() => {
    const map = new Map<string, RoguelikeStage>();
    roguelikeStages.forEach((stage) => {
      map.set(stage.id, stage);
    });
    return map;
  }, [roguelikeStages]);

  const trimmedSearch = searchTerm.trim();
  const normalizedSearch = trimmedSearch.toLowerCase();
  const hasSearch = normalizedSearch.length > 0;

  const matchesSearch = useCallback(
    (story: StoryEntry) => {
      if (!hasSearch) return true;
      const fields = [
        story.storyName,
        story.storyCode ?? "",
        story.storyGroup ?? "",
      ];
      return fields.some((value) =>
        value.toLowerCase().includes(normalizedSearch)
      );
    },
    [hasSearch, normalizedSearch]
  );

  const matchesCharmSearch = useCallback(
    (charm: RoguelikeCharm) => {
      if (!hasSearch) return true;
      const stageTexts = charm.dropStageIds
        .map((id) => roguelikeStageMap.get(id))
        .filter((stage): stage is RoguelikeStage => Boolean(stage))
        .flatMap((stage) => [
          stage.name,
          stage.themeLabel ?? "",
          stage.categoryLabel ?? "",
          stage.code ?? "",
        ]);
      const fields = [
        charm.name,
        charm.shortDescription ?? "",
        charm.itemDescription ?? "",
        charm.itemUsage ?? "",
        charm.obtainApproach ?? "",
        charm.specialObtainApproach ?? "",
        charm.charmType ?? "",
        charm.rarity ?? "",
        charm.dropStageIds.join(" "),
        ...stageTexts,
      ];
      return fields.some((value) =>
        value.toLowerCase().includes(normalizedSearch)
      );
    },
    [hasSearch, normalizedSearch, roguelikeStageMap]
  );

  const matchesStageSearch = useCallback(
    (stage: RoguelikeStage) => {
      if (!hasSearch) return true;
      const fields = [
        stage.name,
        stage.description ?? "",
        stage.eliteDescription ?? "",
        stage.categoryLabel ?? "",
        stage.themeLabel ?? "",
        stage.code ?? "",
        stage.difficulty ?? "",
        stage.id,
      ];
      return fields.some((value) =>
        value.toLowerCase().includes(normalizedSearch)
      );
    },
    [hasSearch, normalizedSearch]
  );

  const groupNameMap = useMemo(() => {
    const map = new Map<string, string>();

    mainGrouped.forEach(([chapterName, stories]) => {
      stories.forEach((story) => {
        if (story.storyGroup) {
          map.set(story.storyGroup, chapterName);
        }
      });
    });

    activityGrouped.forEach(([activityName, stories]) => {
      stories.forEach((story) => {
        if (story.storyGroup) {
          map.set(story.storyGroup, activityName);
        }
      });
    });

    memoryStories.forEach((story) => {
      if (story.storyGroup) {
        map.set(story.storyGroup, story.storyGroup);
      }
    });

    return map;
  }, [mainGrouped, activityGrouped, memoryStories]);

  const mainChapterMap = useMemo(() => new Map(mainGrouped), [mainGrouped]);
  const activityMap = useMemo(() => new Map(activityGrouped), [activityGrouped]);
  const sidestoryMap = useMemo(() => new Map(sidestoryGrouped), [sidestoryGrouped]);
  const roguelikeMap = useMemo(() => new Map(roguelikeGrouped), [roguelikeGrouped]);
  const recordMap = useMemo(() => new Map(recordGrouped), [recordGrouped]);

  const filteredMainGrouped = useMemo(() => {
    if (!hasSearch) return mainGrouped;
    return mainGrouped
      .map(([chapterName, stories]) => {
        const chapterMatches = chapterName.toLowerCase().includes(normalizedSearch);
        if (chapterMatches) {
          return [chapterName, stories] as [string, StoryEntry[]];
        }
        const filteredStories = stories.filter(matchesSearch);
        return [chapterName, filteredStories] as [string, StoryEntry[]];
      })
      .filter(([, stories]) => stories.length > 0);
  }, [hasSearch, mainGrouped, matchesSearch, normalizedSearch]);

  const filteredActivityGrouped = useMemo(() => {
    const sidestoryNames = new Set(sidestoryGrouped.map(([name]) => name));
    const base = activityGrouped
      .filter(([activityName]) => {
        // 在非搜索模式下，活动里隐藏已被“支线”收纳的分组
        if (!hasSearch && sidestoryNames.has(activityName)) return false;
        return true;
      })
      .map(([activityName, stories]) => {
        const activityMatches = activityName.toLowerCase().includes(normalizedSearch);
        if (activityMatches || !hasSearch) {
          return [activityName, stories] as [string, StoryEntry[]];
        }
        const filteredStories = stories.filter(matchesSearch);
        return [activityName, filteredStories] as [string, StoryEntry[]];
      })
      .filter(([, stories]) => stories.length > 0);
    return base;
  }, [activityGrouped, hasSearch, matchesSearch, normalizedSearch, sidestoryGrouped]);

  const filteredSidestoryGrouped = useMemo(() => {
    if (!hasSearch) return sidestoryGrouped;
    return sidestoryGrouped
      .map(([name, stories]) => {
        const nameMatches = name.toLowerCase().includes(normalizedSearch);
        if (nameMatches) return [name, stories] as [string, StoryEntry[]];
        const filteredStories = stories.filter(matchesSearch);
        return [name, filteredStories] as [string, StoryEntry[]];
      })
      .filter(([, stories]) => stories.length > 0);
  }, [sidestoryGrouped, hasSearch, matchesSearch, normalizedSearch]);

  const filteredRoguelikeGrouped = useMemo(() => {
    if (!hasSearch) return roguelikeGrouped;
    return roguelikeGrouped
      .map(([name, stories]) => {
        const nameMatches = name.toLowerCase().includes(normalizedSearch);
        if (nameMatches) return [name, stories] as [string, StoryEntry[]];
        const filteredStories = stories.filter(matchesSearch);
        return [name, filteredStories] as [string, StoryEntry[]];
      })
      .filter(([, stories]) => stories.length > 0);
  }, [roguelikeGrouped, hasSearch, matchesSearch, normalizedSearch]);

  const filteredRoguelikeCharms = useMemo(() => {
    if (!hasSearch) return roguelikeCharms;
    return roguelikeCharms.filter(matchesCharmSearch);
  }, [hasSearch, matchesCharmSearch, roguelikeCharms]);

  const filteredRoguelikeStages = useMemo(() => {
    if (!hasSearch) return roguelikeStages;
    return roguelikeStages.filter(matchesStageSearch);
  }, [hasSearch, matchesStageSearch, roguelikeStages]);

  const groupedRoguelikeStages = useMemo(() => {
    if (filteredRoguelikeStages.length === 0) return [] as Array<[string, RoguelikeStage[]]>;
    const orderedThemes: string[] = [];
    const themeMap = new Map<string, RoguelikeStage[]>();

    filteredRoguelikeStages.forEach((stage) => {
      const themeLabel = stage.themeLabel ?? "其他主题";
      if (!themeMap.has(themeLabel)) {
        themeMap.set(themeLabel, []);
        orderedThemes.push(themeLabel);
      }
      themeMap.get(themeLabel)!.push(stage);
    });

    return orderedThemes.map((themeLabel) => [
      themeLabel,
      themeMap.get(themeLabel)!,
    ] as [string, RoguelikeStage[]]);
  }, [filteredRoguelikeStages]);

  const filteredMemoryStories = useMemo(() => {
    if (!hasSearch) return memoryStories;
    return memoryStories.filter(matchesSearch);
  }, [hasSearch, matchesSearch, memoryStories]);

  const filteredRecordGrouped = useMemo(() => {
    if (!hasSearch) return recordGrouped;
    return recordGrouped
      .map(([chapterName, stories]) => {
        const chapterMatches = chapterName.toLowerCase().includes(normalizedSearch);
        if (chapterMatches) {
          return [chapterName, stories] as [string, StoryEntry[]];
        }
        const filtered = stories.filter(matchesSearch);
        return filtered.length > 0 ? ([chapterName, filtered] as [string, StoryEntry[]]) : null;
      })
      .filter((group): group is [string, StoryEntry[]] => group !== null);
  }, [recordGrouped, hasSearch, matchesSearch, normalizedSearch]);

  const filteredRuneStories = useMemo(() => {
    if (!hasSearch) return runeStories;
    return runeStories.filter(matchesSearch);
  }, [hasSearch, matchesSearch, runeStories]);

  const favoriteGroupList = useMemo(() => {
    if (favoriteGroupEntries.length === 0) return [];

    return favoriteGroupEntries
      .map((group) => {
        const allStories = Object.values(group.stories).sort((a, b) => {
          if (a.storySort !== b.storySort) {
            return a.storySort - b.storySort;
          }
          return a.storyName.localeCompare(b.storyName, "zh-Hans");
        });

        const visibleStories = hasSearch ? allStories.filter(matchesSearch) : allStories;
        if (visibleStories.length === 0 && hasSearch) {
          return null;
        }

        return {
          groupId: group.id,
          displayName: group.name,
          allStories,
          visibleStories,
          type: group.type,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-Hans"));
  }, [favoriteGroupEntries, hasSearch, matchesSearch]);

  const favoriteGroupStoryIds = useMemo(() => {
    const ids = new Set<string>();
    favoriteGroupEntries.forEach((group) => {
      group.storyIds.forEach((id) => ids.add(id));
    });
    return ids;
  }, [favoriteGroupEntries]);

  const individualFavoriteStories = useMemo(() => {
    if (favoriteStoryEntries.length === 0) return [];
    return favoriteStoryEntries.filter((story) => !favoriteGroupStoryIds.has(story.storyId));
  }, [favoriteStoryEntries, favoriteGroupStoryIds]);

  const individualFavoriteGroups = useMemo(() => {
    if (individualFavoriteStories.length === 0) return [];

    const grouped = new Map<string, StoryEntry[]>();
    individualFavoriteStories.forEach((story) => {
      if (!matchesSearch(story)) return;
      const key = story.storyGroup || "__ungrouped__";
      const list = grouped.get(key);
      if (list) {
        list.push(story);
      } else {
        grouped.set(key, [story]);
      }
    });

    return Array.from(grouped.entries())
      .map(([groupKey, stories]) => {
        const sorted = [...stories].sort((a, b) => {
          if (a.storySort !== b.storySort) {
            return a.storySort - b.storySort;
          }
          return a.storyName.localeCompare(b.storyName, "zh-Hans");
        });

        const displayName =
          groupKey === "__ungrouped__"
            ? "未分组"
            : groupNameMap.get(groupKey) || groupKey || "未分组";

        return { groupKey, displayName, stories: sorted };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-Hans"));
  }, [groupNameMap, individualFavoriteStories, matchesSearch]);

  const favoriteCount = useMemo(() => {
    const uniqueIds = new Set<string>();
    favoriteStoryEntries.forEach((story) => uniqueIds.add(story.storyId));
    favoriteGroupEntries.forEach((group) => {
      group.storyIds.forEach((id) => uniqueIds.add(id));
    });
    return uniqueIds.size;
  }, [favoriteGroupEntries, favoriteStoryEntries]);
  const activeSummary = useMemo(() => {
    if (hasSearch) {
      return `搜索关键字：“${trimmedSearch}”`;
    }
    if (activeCategory === "favorites" && favoriteCount > 0) {
      return `已收藏 ${favoriteCount} 条剧情`;
    }
    return CATEGORY_DESCRIPTIONS[activeCategory];
  }, [activeCategory, favoriteCount, hasSearch, trimmedSearch]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 3s 安全超时，防止 isInstalled 因异常挂起
        const withTimeout = <T,>(p: Promise<T>, ms = 3000) =>
          new Promise<T>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error("TIMEOUT")), ms);
            p.then((v) => { clearTimeout(t); resolve(v); })
             .catch((e) => { clearTimeout(t); reject(e); });
          });

        const installed = await withTimeout(api.isInstalled());
        if (cancelled) return;

        if (!installed) {
          console.log("[StoryList] 未安装，打开同步对话框");
          setSyncDialogOpen(true);
          setLoading(false);
          return;
        }
        await loadMainStories();
      } catch (e) {
        if (cancelled) return;
        console.error("[StoryList] isInstalled 失败，回退到同步对话框:", e);
        setError("未安装或网络缓慢，请先同步数据");
        setSyncDialogOpen(true);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const loadMainStories = async () => {
    console.log("[StoryList] 开始加载主线剧情");
    try {
      setLoading(true);
      setError(null);

      const withTimeout = <T,>(p: Promise<T>, ms = 8000) =>
        new Promise<T>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("TIMEOUT")), ms);
          p.then((v) => { clearTimeout(t); resolve(v); })
           .catch((e) => { clearTimeout(t); reject(e); });
        });

      const grouped = await withTimeout(api.getMainStoriesGrouped());
      console.log("[StoryList] 主线章节数:", grouped.length);
      console.log("[StoryList] 前3个章节:", grouped.slice(0, 3).map(([name, stories]) => ({
        name,
        storyCount: stories.length
      })));
      setMainGrouped(grouped);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "加载失败";
      console.error("[StoryList] 加载主线剧情失败:", errorMsg, err);
      // 未安装或超时，提示同步
      if (
        errorMsg.includes("NOT_INSTALLED") ||
        errorMsg.includes("No such file") ||
        errorMsg === "TIMEOUT"
      ) {
        setError("未安装或网络缓慢，请先同步数据");
        setSyncDialogOpen(true);
      } else {
        setError("加载失败");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadActivities = async () => {
    if (activityLoaded) return;
    console.log("[StoryList] 开始加载活动剧情");
    try {
      setActivityLoading(true);
      setError(null);

      const withTimeout = <T,>(p: Promise<T>, ms = 8000) =>
        new Promise<T>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("TIMEOUT")), ms);
          p.then((v) => { clearTimeout(t); resolve(v); })
           .catch((e) => { clearTimeout(t); reject(e); });
        });

      const grouped = await withTimeout(api.getActivityStoriesGrouped());
      console.log("[StoryList] 活动数:", grouped.length);
      console.log("[StoryList] 前3个活动:", grouped.slice(0, 3).map(([name, stories]) => ({
        name,
        storyCount: stories.length
      })));
      setActivityGrouped(grouped);
      setActivityLoaded(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "加载失败";
      console.error("[StoryList] 加载活动剧情失败:", errorMsg, err);
      if (errorMsg.includes("NOT_INSTALLED") || errorMsg.includes("No such file") || errorMsg === "TIMEOUT") {
        setError("未安装或网络缓慢，请先同步数据");
        setSyncDialogOpen(true);
      } else {
        setError("加载失败");
      }
    } finally {
      setActivityLoading(false);
    }
  };

  // 按需加载：切换到对应标签再加载
  useEffect(() => {
    if (activeCategory === 'activity') {
      void loadActivities();
      // 为了去重，确保同时加载支线
      void loadSidestories();
    } else if (activeCategory === 'sidestory') {
      void loadSidestories();
    } else if (activeCategory === 'roguelike') {
      void loadRoguelike();
    } else if (activeCategory === 'rogueCharm') {
      void loadRoguelikeCharms();
    } else if (activeCategory === 'rogueStage') {
      void loadRoguelikeStages();
    } else if (activeCategory === 'memory') {
      void loadMemories();
    } else if (activeCategory === 'record') {
      void loadRecord();
    } else if (activeCategory === 'rune') {
      void loadRune();
    }
  }, [activeCategory]);

  const loadSidestories = async () => {
    if (sidestoryLoaded) return;
    console.log("[StoryList] 开始加载支线剧情");
    try {
      setSidestoryLoading(true);
      setError(null);
      const withTimeout = <T,>(p: Promise<T>, ms = 8000) =>
        new Promise<T>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("TIMEOUT")), ms);
          p.then((v) => { clearTimeout(t); resolve(v); })
           .catch((e) => { clearTimeout(t); reject(e); });
        });
      const grouped = await withTimeout(api.getSidestoryStoriesGrouped());
      console.log("[StoryList] 支线项目数:", grouped.length);
      setSidestoryGrouped(grouped);
      setSidestoryLoaded(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "加载失败";
      console.error("[StoryList] 加载支线剧情失败:", errorMsg, err);
      if (errorMsg.includes("NOT_INSTALLED") || errorMsg.includes("No such file") || errorMsg === "TIMEOUT") {
        setError("未安装或网络缓慢，请先同步数据");
        setSyncDialogOpen(true);
      } else {
        setError("加载失败");
      }
    } finally {
      setSidestoryLoading(false);
    }
  };

  const loadRoguelike = async () => {
    if (roguelikeLoaded) return;
    console.log("[StoryList] 开始加载肉鸽剧情");
    try {
      setRoguelikeLoading(true);
      setError(null);
      const withTimeout = <T,>(p: Promise<T>, ms = 8000) =>
        new Promise<T>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("TIMEOUT")), ms);
          p.then((v) => { clearTimeout(t); resolve(v); })
           .catch((e) => { clearTimeout(t); reject(e); });
        });
      const grouped = await withTimeout(api.getRoguelikeStoriesGrouped());
      console.log("[StoryList] 肉鸽项目数:", grouped.length);
      setRoguelikeGrouped(grouped);
      setRoguelikeLoaded(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "加载失败";
      console.error("[StoryList] 加载肉鸽剧情失败:", errorMsg, err);
      if (errorMsg.includes("NOT_INSTALLED") || errorMsg.includes("No such file") || errorMsg === "TIMEOUT") {
        setError("未安装或网络缓慢，请先同步数据");
        setSyncDialogOpen(true);
      } else {
        setError("加载失败");
      }
    } finally {
      setRoguelikeLoading(false);
    }
  };

  const loadRoguelikeStages = async () => {
    if (roguelikeStagesLoaded) return;
    console.log("[StoryList] 开始加载肉鸽场景信息");
    try {
      setRoguelikeStagesLoading(true);
      setError(null);

      const withTimeout = async <T,>(promise: Promise<T>, ms = 30000) => {
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("TIMEOUT")), ms);
        });
        return Promise.race([promise, timeout]);
      };

      const stages = await withTimeout(api.getRoguelikeStages());
      console.log("[StoryList] 肉鸽场景数:", stages.length);
      setRoguelikeStages(stages);
      setRoguelikeStagesLoaded(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "加载失败";
      console.error("[StoryList] 加载肉鸽场景失败:", errorMsg, err);
      if (
        errorMsg.includes("NOT_INSTALLED") ||
        errorMsg.includes("No such file") ||
        errorMsg === "TIMEOUT"
      ) {
        setError("未安装或网络缓慢，请先同步数据");
        setSyncDialogOpen(true);
      } else {
        setError("加载失败");
      }
    } finally {
      setRoguelikeStagesLoading(false);
    }
  };

  const loadRoguelikeCharms = async () => {
    if (roguelikeCharmsLoaded) return;
    console.log("[StoryList] 开始加载肉鸽符文道具");
    try {
      setRoguelikeCharmsLoading(true);
      setError(null);

      const withTimeout = async <T,>(promise: Promise<T>, ms = 30000) => {
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("TIMEOUT")), ms);
        });
        return Promise.race([promise, timeout]);
      };

      const charms = await withTimeout(api.getRoguelikeCharms());
      console.log("[StoryList] 肉鸽符文道具数:", charms.length);
      setRoguelikeCharms(charms);
      setRoguelikeCharmsLoaded(true);

      if (!roguelikeStagesLoaded && !roguelikeStagesLoading) {
        void loadRoguelikeStages();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "加载失败";
      console.error("[StoryList] 加载肉鸽符文道具失败:", errorMsg, err);
      if (
        errorMsg.includes("NOT_INSTALLED") ||
        errorMsg.includes("No such file") ||
        errorMsg === "TIMEOUT"
      ) {
        setError("未安装或网络缓慢，请先同步数据");
        setSyncDialogOpen(true);
      } else {
        setError("加载失败");
      }
    } finally {
      setRoguelikeCharmsLoading(false);
    }
  };

  const loadMemories = async () => {
    if (memoryLoaded) return;
    console.log("[StoryList] 开始加载干员密录");
    try {
      setMemoryLoading(true);
      setError(null);

      const withTimeout = <T,>(p: Promise<T>, ms = 10000) =>
        new Promise<T>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("TIMEOUT")), ms);
          p.then((v) => { clearTimeout(t); resolve(v); })
           .catch((e) => { clearTimeout(t); reject(e); });
        });

      const data = await withTimeout(api.getMemoryStories());
      console.log("[StoryList] 干员密录加载成功，数量:", data.length);
      setMemoryStories(data);
      setMemoryLoaded(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "加载失败";
      console.error("[StoryList] 加载干员密录失败:", errorMsg, err);
      if (errorMsg.includes("NOT_INSTALLED") || errorMsg.includes("No such file") || errorMsg === "TIMEOUT") {
        setError("未安装或网络缓慢，请先同步数据");
        setSyncDialogOpen(true);
      } else {
        setError("加载失败");
      }
    } finally {
      setMemoryLoading(false);
    }
  };

  const loadRecord = async () => {
    if (recordLoaded) return;
    console.log("[StoryList] 开始加载主线笔记");
    try {
      setRecordLoading(true);
      const withTimeout = async <T,>(promise: Promise<T>, ms = 30000) => {
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("TIMEOUT")), ms);
        });
        return Promise.race([promise, timeout]);
      };
      const grouped = await withTimeout(api.getRecordStoriesGrouped());
      console.log("[StoryList] 主线笔记项目数:", grouped.length);
      setRecordGrouped(grouped);
      setRecordLoaded(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "加载失败";
      console.error("[StoryList] 加载主线笔记失败:", errorMsg, err);
      if (errorMsg.includes("NOT_INSTALLED") || errorMsg.includes("No such file") || errorMsg === "TIMEOUT") {
        setError("未安装或网络缓慢，请先同步数据");
        setSyncDialogOpen(true);
      } else {
        setError("加载失败");
      }
    } finally {
      setRecordLoading(false);
    }
  };

  const loadRune = async () => {
    if (runeLoaded) return;
    console.log("[StoryList] 开始加载危机合约");
    try {
      setRuneLoading(true);
      const withTimeout = async <T,>(promise: Promise<T>, ms = 30000) => {
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("TIMEOUT")), ms);
        });
        return Promise.race([promise, timeout]);
      };
      const stories = await withTimeout(api.getRuneStories());
      console.log("[StoryList] 危机合约文本数:", stories.length);
      setRuneStories(stories);
      setRuneLoaded(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "加载失败";
      console.error("[StoryList] 加载危机合约失败:", errorMsg, err);
      if (errorMsg.includes("NOT_INSTALLED") || errorMsg.includes("No such file") || errorMsg === "TIMEOUT") {
        setError("未安装或网络缓慢，请先同步数据");
        setSyncDialogOpen(true);
      } else {
        setError("加载失败");
      }
    } finally {
      setRuneLoading(false);
    }
  };

  const handleSyncSuccess = async () => {
    console.log("[StoryList] 同步成功回调触发");
    await loadMainStories();
    console.log("[StoryList] 关闭同步对话框");
    setSyncDialogOpen(false);
  };

  useEffect(() => {
    if (showSummaries && memoryStories.length > 0) {
      ensureSummariesForStories(memoryStories);
    }
  }, [showSummaries, memoryStories, ensureSummariesForStories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-[hsl(var(--color-muted-foreground))]">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
        <div className="text-[hsl(var(--color-destructive))] text-center">{error}</div>
        <Button onClick={() => {
          console.log("[StoryList] (错误页面) 点击同步数据按钮");
          setSyncDialogOpen(true);
        }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          同步数据
        </Button>

        {/* 同步对话框（错误状态下也可打开） */}
        <SyncDialog
          open={syncDialogOpen}
          onClose={() => setSyncDialogOpen(false)}
          onSuccess={handleSyncSuccess}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <main className="flex-1 overflow-hidden">
        <CustomScrollArea
          className="h-full"
          viewportClassName="reader-scroll"
          trackOffsetTop="calc(3.5rem + 10px)"
          trackOffsetBottom="calc(4.5rem + env(safe-area-inset-bottom, 0px))"
        >
          <div className="container py-6 pb-24 space-y-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {CATEGORY_TABS.map((tab) => (
                  <Button
                    key={tab.id}
                    variant={activeCategory === tab.id ? "default" : "outline"}
                    size="sm"
                    className="rounded-full px-4"
                    onClick={() => {
                      setActiveCategory(tab.id);
                      if (tab.id === "activity" && !activityLoaded) {
                        loadActivities();
                      }
                      if (tab.id === "memory" && !memoryLoaded) {
                        loadMemories();
                      }
                    }}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>
              {/* 顶部行：左侧摘要文本，右侧全局简介开关 */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                  {activeSummary}
                </span>
                <SummaryToggleButton
                  enabled={showSummaries}
                  onToggle={() => setShowSummaries(!showSummaries)}
                  label="简介"
                />
              </div>
              {/* 第二行：搜索框独占一行 */}
              <div>
                <Input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜索剧情、道具或场景"
                  aria-label="搜索剧情、道具或场景"
                  className="w-full sm:w-80 md:w-96"
                />
              </div>
            </div>

            <div className="space-y-4">
              {activeCategory === "main" && (
                filteredMainGrouped.length > 0 ? (
                  filteredMainGrouped.map(([chapterName, stories], index) => {
                    const fullStories = mainChapterMap.get(chapterName) ?? stories;
                    const groupKey = fullStories[0]?.storyGroup || chapterName;
                    const groupId = `chapter:${groupKey}`;
                    const chapterFavorite = isGroupFavorite(groupId);
                    const summaryEnabled = showSummaries;
                    return (
                      <Collapsible
                        key={`chapter-${index}`}
                        title={chapterName}
                        defaultOpen={false}
                        actions={
                          <div className="flex items-center gap-2">
                            <GroupFavoriteButton
                              isFavorite={chapterFavorite}
                              onToggle={() =>
                                toggleFavoriteGroup({
                                  id: groupId,
                                  name: chapterName,
                                  type: "chapter",
                                  stories: fullStories,
                                })
                              }
                              inactiveText="收藏章节"
                              activeText="取消收藏章节"
                            />
                          </div>
                        }
                      >
                        {stories.map((story) => (
                          <StoryItem
                            key={story.storyId}
                            story={story}
                            onSelectStory={onSelectStory}
                            isFavorite={isFavorite(story.storyId)}
                            onToggleFavorite={() => toggleFavorite(story)}
                            showSummary={summaryEnabled}
                            summary={summaryCache[story.storyId]}
                            summaryLoading={Boolean(summaryLoadingIds[story.storyId])}
                            onRequestSummary={handleRequestSummary}
                          />
                        ))}
                      </Collapsible>
                    );
                  })
                ) : (
                  <EmptyState
                    message={hasSearch ? "没有匹配的主线剧情" : "暂无主线剧情，可能需要同步。"}
                  />
                )
              )}

              {activeCategory === "activity" && (
                <div className="space-y-3">
                  {activityLoading && <EmptyState message="活动剧情加载中..." />}
                  {!activityLoading && filteredActivityGrouped.length === 0 && (
                    <EmptyState
                      message={hasSearch ? "没有匹配的活动剧情" : "暂无活动剧情或需要同步"}
                    />
                  )}
                  {!activityLoading &&
                    filteredActivityGrouped.map(([activityName, stories], index) => {
                      const fullStories = activityMap.get(activityName) ?? stories;
                      const groupKey = fullStories[0]?.storyGroup || activityName;
                      const groupId = `activity:${groupKey}`;
                      const activityFavorite = isGroupFavorite(groupId);
                      const summaryEnabled = showSummaries;
                      return (
                        <Collapsible
                          key={`activity-${index}`}
                          title={activityName}
                          defaultOpen={false}
                          actions={
                            <div className="flex items-center gap-2">
                              <GroupFavoriteButton
                                isFavorite={activityFavorite}
                                onToggle={() =>
                                  toggleFavoriteGroup({
                                    id: groupId,
                                    name: activityName,
                                    type: "activity",
                                    stories: fullStories,
                                  })
                                }
                                inactiveText="收藏活动"
                                activeText="取消收藏活动"
                              />
                            </div>
                          }
                        >
                          {stories.map((story) => (
                            <StoryItem
                              key={story.storyId}
                              story={story}
                              onSelectStory={onSelectStory}
                              isFavorite={isFavorite(story.storyId)}
                              onToggleFavorite={() => toggleFavorite(story)}
                              showSummary={summaryEnabled}
                              summary={summaryCache[story.storyId]}
                              summaryLoading={Boolean(summaryLoadingIds[story.storyId])}
                              onRequestSummary={handleRequestSummary}
                            />
                          ))}
                        </Collapsible>
                      );
                    })}
                </div>
              )}

              {activeCategory === "sidestory" && (
                <div className="space-y-3">
                  {sidestoryLoading && <EmptyState message="支线剧情加载中..." />}
                  {!sidestoryLoading && filteredSidestoryGrouped.length === 0 && (
                    <EmptyState message={hasSearch ? "没有匹配的支线剧情" : "暂无支线剧情或需要同步"} />
                  )}
                  {!sidestoryLoading &&
                    filteredSidestoryGrouped.map(([name, stories], index) => {
                      const fullStories = sidestoryMap.get(name) ?? stories;
                      const groupKey = fullStories[0]?.storyGroup || name;
                      const groupId = `sidestory:${groupKey}`;
                      const fav = isGroupFavorite(groupId);
                      const summaryEnabled = showSummaries;
                      return (
                        <Collapsible
                          key={`sidestory-${index}`}
                          title={name}
                          defaultOpen={false}
                          actions={
                            <div className="flex items-center gap-2">
                              <GroupFavoriteButton
                                isFavorite={fav}
                                onToggle={() =>
                                  toggleFavoriteGroup({ id: groupId, name, type: "other", stories: fullStories })
                                }
                                inactiveText="收藏支线"
                                activeText="取消收藏支线"
                              />
                            </div>
                          }
                        >
                          {stories.map((story) => (
                            <StoryItem
                              key={story.storyId}
                              story={story}
                              onSelectStory={onSelectStory}
                              isFavorite={isFavorite(story.storyId)}
                              onToggleFavorite={() => toggleFavorite(story)}
                              showSummary={summaryEnabled}
                              summary={summaryCache[story.storyId]}
                              summaryLoading={Boolean(summaryLoadingIds[story.storyId])}
                              onRequestSummary={handleRequestSummary}
                            />
                          ))}
                        </Collapsible>
                      );
                    })}
                </div>
              )}

              {activeCategory === "roguelike" && (
                <div className="space-y-3">
                  {roguelikeLoading && <EmptyState message="肉鸽剧情加载中..." />}
                  {!roguelikeLoading && filteredRoguelikeGrouped.length === 0 && (
                    <EmptyState message={hasSearch ? "没有匹配的肉鸽剧情" : "暂无肉鸽剧情或需要同步"} />
                  )}
                  {!roguelikeLoading &&
                    filteredRoguelikeGrouped.map(([name, stories], index) => {
                      const fullStories = roguelikeMap.get(name) ?? stories;
                      const groupKey = fullStories[0]?.storyGroup || name;
                      const groupId = `roguelike:${groupKey}`;
                      const fav = isGroupFavorite(groupId);
                      const summaryEnabled = showSummaries;
                      return (
                        <Collapsible
                          key={`roguelike-${index}`}
                          title={name}
                          defaultOpen={false}
                          actions={
                            <div className="flex items-center gap-2">
                              <GroupFavoriteButton
                                isFavorite={fav}
                                onToggle={() =>
                                  toggleFavoriteGroup({ id: groupId, name, type: "other", stories: fullStories })
                                }
                                inactiveText="收藏肉鸽"
                                activeText="取消收藏肉鸽"
                              />
                            </div>
                          }
                        >
                          {stories.map((story) => (
                            <StoryItem
                              key={story.storyId}
                              story={story}
                              onSelectStory={onSelectStory}
                              isFavorite={isFavorite(story.storyId)}
                              onToggleFavorite={() => toggleFavorite(story)}
                              showSummary={summaryEnabled}
                              summary={summaryCache[story.storyId]}
                              summaryLoading={Boolean(summaryLoadingIds[story.storyId])}
                              onRequestSummary={handleRequestSummary}
                            />
                          ))}
                        </Collapsible>
                      );
                    })}
                </div>
              )}

              {activeCategory === "rogueCharm" && (
                <div className="space-y-3">
                  {roguelikeCharmsLoading && <EmptyState message="肉鸽道具加载中..." />}
                  {!roguelikeCharmsLoading && filteredRoguelikeCharms.length === 0 && (
                    <EmptyState
                      message={hasSearch ? "没有匹配的肉鸽道具" : "暂无肉鸽道具或需要同步"}
                    />
                  )}
                  {!roguelikeCharmsLoading &&
                    filteredRoguelikeCharms.map((charm) => (
                      <RoguelikeCharmItem
                        key={charm.id}
                        charm={charm}
                        stageMap={roguelikeStageMap}
                      />
                    ))}
                </div>
              )}

              {activeCategory === "rogueStage" && (
                <div className="space-y-3">
                  {roguelikeStagesLoading && <EmptyState message="肉鸽场景加载中..." />}
                  {!roguelikeStagesLoading && groupedRoguelikeStages.length === 0 && (
                    <EmptyState
                      message={hasSearch ? "没有匹配的肉鸽场景" : "暂无肉鸽场景或需要同步"}
                    />
                  )}
                  {!roguelikeStagesLoading &&
                    groupedRoguelikeStages.map(([themeLabel, stages], index) => {
                      const themeKey = stages[0]?.themeKey
                        ? stages[0].themeKey!.toUpperCase()
                        : undefined;
                      const title = themeKey ? `${themeLabel} (${themeKey})` : themeLabel;
                      return (
                        <Collapsible key={`rogue-stages-${index}`} title={title} defaultOpen={false}>
                          <div className="space-y-2">
                            {stages.map((stage) => (
                              <RoguelikeStageItem key={stage.id} stage={stage} />
                            ))}
                          </div>
                        </Collapsible>
                      );
                    })}
                </div>
              )}

              {activeCategory === "record" && (
                <div className="space-y-3">
                  {recordLoading && <EmptyState message="主线笔记加载中..." />}
                  {!recordLoading && filteredRecordGrouped.length === 0 && (
                    <EmptyState message={hasSearch ? "没有匹配的主线笔记" : "暂无主线笔记或需要同步"} />
                  )}
                  {!recordLoading &&
                    filteredRecordGrouped.map(([name, stories], index) => {
                      const fullStories = recordMap.get(name) ?? stories;
                      const groupKey = name.replace(/\s+/g, "_");
                      const groupId = `record:${groupKey}`;
                      const fav = isGroupFavorite(groupId);
                      const summaryEnabled = showSummaries;
                      return (
                        <Collapsible
                          key={`record-${index}`}
                          title={name}
                          defaultOpen={false}
                          actions={
                            <div className="flex items-center gap-2">
                              <GroupFavoriteButton
                                isFavorite={fav}
                                onToggle={() =>
                                  toggleFavoriteGroup({ id: groupId, name, type: "chapter", stories: fullStories })
                                }
                                inactiveText="收藏笔记"
                                activeText="取消收藏笔记"
                              />
                            </div>
                          }
                        >
                          {stories.map((story) => (
                            <StoryItem
                              key={story.storyId}
                              story={story}
                              onSelectStory={onSelectStory}
                              isFavorite={isFavorite(story.storyId)}
                              onToggleFavorite={() => toggleFavorite(story)}
                              showSummary={summaryEnabled}
                              summary={summaryCache[story.storyId]}
                              summaryLoading={Boolean(summaryLoadingIds[story.storyId])}
                              onRequestSummary={handleRequestSummary}
                            />
                          ))}
                        </Collapsible>
                      );
                    })}
                </div>
              )}

              {activeCategory === "rune" && (
                <div className="space-y-2">
                  {runeLoading && <EmptyState message="危机合约剧情加载中..." />}
                  {!runeLoading && filteredRuneStories.length === 0 && (
                    <EmptyState
                      message={hasSearch ? "没有匹配的危机合约剧情" : "暂无危机合约剧情或需要同步"}
                    />
                  )}
                  {!runeLoading &&
                    filteredRuneStories.map((story) => (
                      <StoryItem
                        key={story.storyId}
                        story={story}
                        onSelectStory={onSelectStory}
                        isFavorite={isFavorite(story.storyId)}
                        onToggleFavorite={() => toggleFavorite(story)}
                        showSummary={showSummaries}
                        summary={summaryCache[story.storyId]}
                        summaryLoading={Boolean(summaryLoadingIds[story.storyId])}
                        onRequestSummary={handleRequestSummary}
                      />
                    ))}
                </div>
              )}

              {activeCategory === "memory" && (
                <div className="space-y-2">
                  {memoryLoading && <EmptyState message="干员密录加载中..." />}
                  {!memoryLoading && filteredMemoryStories.length === 0 && (
                    <EmptyState
                      message={hasSearch ? "没有匹配的密录剧情" : "暂无干员密录或需要同步"}
                    />
                  )}
                  {!memoryLoading &&
                    filteredMemoryStories.map((story) => (
                      <StoryItem
                        key={story.storyId}
                        story={story}
                        onSelectStory={onSelectStory}
                        isFavorite={isFavorite(story.storyId)}
                        onToggleFavorite={() => toggleFavorite(story)}
                        showSummary={memorySummaryVisible}
                        summary={summaryCache[story.storyId]}
                        summaryLoading={Boolean(summaryLoadingIds[story.storyId])}
                        onRequestSummary={handleRequestSummary}
                      />
                    ))}
                </div>
              )}

              {activeCategory === "favorites" && (
                favoriteCount > 0 ? (
                  favoriteGroupList.length > 0 || individualFavoriteGroups.length > 0 ? (
                    <>
                      {favoriteGroupList.map(({ groupId, displayName, allStories, visibleStories, type }) => (
                        <Collapsible
                          key={`favorite-group-${groupId}`}
                          title={displayName}
                          defaultOpen={false}
                          actions={
                            <GroupFavoriteButton
                              isFavorite
                              onToggle={() =>
                                toggleFavoriteGroup({
                                  id: groupId,
                                  name: displayName,
                                  type,
                                  stories: allStories,
                                })
                              }
                              inactiveText="收藏该组"
                              activeText="取消收藏该组"
                            />
                          }
                        >
                          {visibleStories.map((story) => (
                            <StoryItem
                              key={`favorite-group-${story.storyId}`}
                              story={story}
                              onSelectStory={onSelectStory}
                              isFavorite={isFavorite(story.storyId)}
                              onToggleFavorite={() => toggleFavorite(story)}
                              showSummary={showSummaries}
                              summary={summaryCache[story.storyId]}
                              summaryLoading={Boolean(summaryLoadingIds[story.storyId])}
                              onRequestSummary={handleRequestSummary}
                            />
                          ))}
                        </Collapsible>
                      ))}

                      {individualFavoriteGroups.map(({ groupKey, displayName, stories }) => (
                        <Collapsible
                          key={`favorite-individual-${groupKey}`}
                          title={displayName}
                          defaultOpen={false}
                          actions={
                            <GroupFavoriteButton
                              isFavorite
                              onToggle={() => {
                                stories.forEach((story) => {
                                  if (isFavorite(story.storyId)) {
                                    toggleFavorite(story);
                                  }
                                });
                              }}
                              inactiveText="收藏该组"
                              activeText="取消收藏该组"
                            />
                          }
                        >
                          {stories.map((story) => (
                            <StoryItem
                              key={`favorite-individual-${story.storyId}`}
                              story={story}
                              onSelectStory={onSelectStory}
                              isFavorite={true}
                              onToggleFavorite={() => toggleFavorite(story)}
                              showSummary={showSummaries}
                              summary={summaryCache[story.storyId]}
                              summaryLoading={Boolean(summaryLoadingIds[story.storyId])}
                              onRequestSummary={handleRequestSummary}
                            />
                          ))}
                        </Collapsible>
                      ))}
                    </>
                  ) : (
                    <EmptyState message={hasSearch ? "没有匹配的收藏" : "暂无收藏的剧情"} />
                  )
                ) : (
                  <EmptyState message="暂无收藏的剧情" />
                )
              )}
            </div>
          </div>
        </CustomScrollArea>
      </main>

      {/* 同步对话框 */}
      <SyncDialog
        open={syncDialogOpen}
        onClose={() => setSyncDialogOpen(false)}
        onSuccess={handleSyncSuccess}
      />
    </div>
  );
}

function SummaryToggleButton({
  enabled,
  onToggle,
  label = "简介",
}: {
  enabled: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      aria-pressed={enabled}
      aria-label={enabled ? `隐藏${label}` : `显示${label}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
        enabled
          ? "text-[hsl(var(--color-primary))] border-[hsl(var(--color-primary)/0.4)] bg-[hsl(var(--color-primary)/0.1)]"
          : "text-[hsl(var(--color-muted-foreground))] border-[hsl(var(--color-border))] bg-transparent hover:bg-[hsl(var(--color-accent))] hover:text-[hsl(var(--color-foreground))]"
      }`}
    >
      <FileText className="h-3.5 w-3.5" />
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={`text-[0.6rem] tracking-[0.2em] uppercase ${
          enabled ? "text-[hsl(var(--color-primary))]" : "text-[hsl(var(--color-muted-foreground))]"
        }`}
      >
        {enabled ? "ON" : "OFF"}
      </span>
    </button>
  );
}

function InfoBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-[hsl(var(--color-muted-foreground))]">
      {children}
    </span>
  );
}

function sanitizeRichText(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\r\n/g, "\n").trim();
}

function InfoSection({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="mt-3 space-y-1">
      <div className="text-xs font-medium text-[hsl(var(--color-muted-foreground))]">
        {title}
      </div>
      <div className="text-sm leading-relaxed text-[hsl(var(--color-foreground))] whitespace-pre-line">
        {text}
      </div>
    </div>
  );
}

function RoguelikeCharmItem({
  charm,
  stageMap,
}: {
  charm: RoguelikeCharm;
  stageMap: Map<string, RoguelikeStage>;
}) {
  const shortDescription = charm.shortDescription
    ? sanitizeRichText(charm.shortDescription)
    : null;

  const sections: Array<{ title: string; text: string }> = [];

  if (charm.itemDescription) {
    sections.push({
      title: "物品说明",
      text: sanitizeRichText(charm.itemDescription),
    });
  }

  if (charm.itemUsage) {
    sections.push({
      title: "用途",
      text: sanitizeRichText(charm.itemUsage),
    });
  }

  if (charm.runeDescription) {
    sections.push({
      title: "符文效果",
      text: sanitizeRichText(charm.runeDescription),
    });
  }

  if (charm.dropStageIds.length > 0) {
    const dropText = charm.dropStageIds
      .map((id) => {
        const stage = stageMap.get(id);
        if (!stage) {
          return id;
        }
        const theme = stage.themeLabel ?? stage.themeKey ?? "";
        const badge = theme ? `｜${theme}` : "";
        return `${stage.name}（${id}${badge}）`;
      })
      .join("\n");
    sections.push({
      title: "掉落关卡",
      text: dropText,
    });
  }

  if (charm.obtainApproach) {
    sections.push({
      title: "获取方式",
      text: sanitizeRichText(charm.obtainApproach),
    });
  }

  if (charm.specialObtainApproach) {
    sections.push({
      title: "特殊获取",
      text: sanitizeRichText(charm.specialObtainApproach),
    });
  }

  const resourceLines: string[] = [];
  if (charm.icon) {
    resourceLines.push(`图标: ${charm.icon}`);
  }
  if (resourceLines.length > 0) {
    sections.push({
      title: "资源",
      text: resourceLines.join("\n"),
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold leading-tight">{charm.name}</h3>
          <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
            ID: {charm.id}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <InfoBadge>排序: {charm.sort}</InfoBadge>
          {charm.charmType && <InfoBadge>类型: {charm.charmType}</InfoBadge>}
          {charm.rarity && <InfoBadge>稀有: {charm.rarity}</InfoBadge>}
          {typeof charm.price === "number" && (
            <InfoBadge>价格: {charm.price}</InfoBadge>
          )}
          {typeof charm.runePoints === "number" && (
            <InfoBadge>积分: {charm.runePoints}</InfoBadge>
          )}
          {charm.obtainInRandom && <InfoBadge>随机获取</InfoBadge>}
        </div>
      </div>

      {shortDescription && (
        <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--color-foreground))] whitespace-pre-line">
          {shortDescription}
        </p>
      )}

      {sections.map(({ title, text }) => (
        <InfoSection key={title} title={title} text={text} />
      ))}
    </div>
  );
}

function RoguelikeStageItem({ stage }: { stage: RoguelikeStage }) {
  const description = stage.description
    ? sanitizeRichText(stage.description)
    : null;
  const eliteDescription = stage.eliteDescription
    ? sanitizeRichText(stage.eliteDescription)
    : null;

  const resourceLines: string[] = [];
  if (stage.levelId) {
    resourceLines.push(`关卡: ${stage.levelId}`);
  }
  if (stage.loadingPicId) {
    resourceLines.push(`读取图: ${stage.loadingPicId}`);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold leading-tight">{stage.name}</h3>
          <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
            ID: {stage.id}
            {stage.code ? ` · 代号 ${stage.code}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {stage.categoryLabel && <InfoBadge>{stage.categoryLabel}</InfoBadge>}
          {stage.difficulty && <InfoBadge>难度: {stage.difficulty}</InfoBadge>}
          {stage.isBoss && <InfoBadge>BOSS</InfoBadge>}
          {stage.isElite && <InfoBadge>精英敌人</InfoBadge>}
          {stage.themeKey && <InfoBadge>主题: {stage.themeKey.toUpperCase()}</InfoBadge>}
        </div>
      </div>

      {description && <InfoSection title="场景描述" text={description} />}
      {eliteDescription && <InfoSection title="精英提示" text={eliteDescription} />}

      {resourceLines.length > 0 && (
        <InfoSection title="资源" text={resourceLines.join("\n")} />
      )}
    </div>
  );
}

function GroupFavoriteButton({
  isFavorite,
  onToggle,
  inactiveText,
  activeText,
}: {
  isFavorite: boolean;
  onToggle: () => void;
  inactiveText: string;
  activeText: string;
}) {
  const label = isFavorite ? activeText : inactiveText;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      aria-pressed={isFavorite}
      aria-label={label}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
        isFavorite
          ? "text-[hsl(var(--color-primary))] border-[hsl(var(--color-primary)/0.4)] bg-[hsl(var(--color-primary)/0.08)]"
          : "text-[hsl(var(--color-muted-foreground))] border-[hsl(var(--color-border))] bg-transparent hover:bg-[hsl(var(--color-accent))] hover:text-[hsl(var(--color-foreground))]"
      }`}
    >
      <Star
        className="h-3.5 w-3.5"
        fill={isFavorite ? "currentColor" : "transparent"}
        strokeWidth={isFavorite ? 0 : 2}
      />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function StoryItem({
  story,
  onSelectStory,
  isFavorite,
  onToggleFavorite,
  showSummary = false,
  summary,
  summaryLoading = false,
  onRequestSummary,
}: {
  story: StoryEntry;
  onSelectStory: (story: StoryEntry) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  showSummary?: boolean;
  summary?: string | null;
  summaryLoading?: boolean;
  onRequestSummary?: (story: StoryEntry) => void;
}) {
  useEffect(() => {
    if (!showSummary) return;
    if (!story.storyInfo) return;
    if ((summary === undefined || summary === null) && !summaryLoading) {
      onRequestSummary?.(story);
    }
  }, [showSummary, story.storyId, story.storyInfo, summary, summaryLoading, onRequestSummary]);

  const normalizedSummary = summary ? summary.trim() : "";
  let summaryContent: string;
  let summaryState: "ready" | "loading" | "empty" | "missing" = "ready";
  if (!showSummary) {
    summaryState = "ready";
    summaryContent = "";
  } else if (normalizedSummary) {
    summaryState = "ready";
    summaryContent = normalizedSummary;
  } else if (summaryLoading) {
    summaryState = "loading";
    summaryContent = "简介加载中…";
  } else if (story.storyInfo) {
    summaryState = "empty";
    summaryContent = "暂无简介内容";
  } else {
    summaryState = "missing";
    summaryContent = "该剧情未提供简介";
  }
  const summaryLines =
    showSummary && summaryState === "ready" ? summaryContent.split("\n") : [];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelectStory(story)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectStory(story);
        }
      }}
      className="w-full flex items-center gap-3 p-3 rounded-lg border border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-accent))] transition-all duration-200 ease-out text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[hsl(var(--color-primary))] hover:-translate-y-0.5 motion-safe:animate-in motion-safe:fade-in-0"
    >
      <BookOpen className="h-4 w-4 text-[hsl(var(--color-muted-foreground))] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{story.storyName}</div>
        {story.avgTag && (
          <div className="text-xs text-[hsl(var(--color-muted-foreground))]">{story.avgTag}</div>
        )}
        {showSummary && (
          <div
            className={`story-item-summary ${
              summaryState === "ready"
                ? ""
                : summaryState === "loading"
                ? "story-item-summary--loading"
                : "story-item-summary--placeholder"
            }`}
          >
            {summaryState === "ready" ? (
              summaryLines.map((line, index) => (
                <span key={index}>
                  {line}
                  {index < summaryLines.length - 1 ? <br /> : null}
                </span>
              ))
            ) : (
              summaryContent
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {story.storyCode && (
          <div className="text-xs text-[hsl(var(--color-muted-foreground))]">{story.storyCode}</div>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite();
          }}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? "取消收藏" : "收藏"}
          className={`p-1 rounded-full transition-colors border ${
            isFavorite
              ? "text-[hsl(var(--color-primary))] border-[hsl(var(--color-primary)/0.4)] bg-[hsl(var(--color-primary)/0.08)]"
              : "text-[hsl(var(--color-muted-foreground))] border-transparent hover:text-[hsl(var(--color-foreground))]"
          }`}
        >
          <Star
            className="h-4 w-4"
            fill={isFavorite ? "currentColor" : "transparent"}
            strokeWidth={isFavorite ? 0 : 2}
          />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-[hsl(var(--color-muted-foreground))] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">{message}</div>;
}
