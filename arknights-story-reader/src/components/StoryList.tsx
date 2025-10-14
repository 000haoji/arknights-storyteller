import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/services/api";
import type { StoryEntry } from "@/types/story";
import { Button } from "@/components/ui/button";
import { BookOpen, RefreshCw, Star } from "lucide-react";
import { SyncDialog } from "@/components/SyncDialog";
import { Collapsible } from "@/components/ui/collapsible";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";
import { Input } from "@/components/ui/input";
import { useFavorites } from "@/hooks/useFavorites";

const CATEGORY_TABS = [
  { id: "favorites" as const, label: "收藏" },
  { id: "main" as const, label: "主线剧情" },
  { id: "activity" as const, label: "活动剧情" },
  { id: "sidestory" as const, label: "支线" },
  { id: "roguelike" as const, label: "肉鸽" },
  { id: "memory" as const, label: "追忆集" },
];

const CATEGORY_DESCRIPTIONS: Record<"favorites" | "main" | "activity" | "sidestory" | "roguelike" | "memory", string> = {
  favorites: "收藏喜爱的章节或关卡",
  main: "主线章节",
  activity: "活动剧情列表",
  sidestory: "支线故事",
  roguelike: "肉鸽模式剧情",
  memory: "干员密录故事",
};

interface StoryListProps {
  onSelectStory: (story: StoryEntry) => void;
}

export function StoryList({ onSelectStory }: StoryListProps) {
  const [mainGrouped, setMainGrouped] = useState<Array<[string, StoryEntry[]]>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'favorites' | 'main' | 'activity' | 'sidestory' | 'roguelike' | 'memory'>('main');
  const [activityGrouped, setActivityGrouped] = useState<Array<[string, StoryEntry[]]>>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [sidestoryGrouped, setSidestoryGrouped] = useState<Array<[string, StoryEntry[]]>>([]);
  const [sidestoryLoading, setSidestoryLoading] = useState(false);
  const [sidestoryLoaded, setSidestoryLoaded] = useState(false);
  const [roguelikeGrouped, setRoguelikeGrouped] = useState<Array<[string, StoryEntry[]]>>([]);
  const [roguelikeLoading, setRoguelikeLoading] = useState(false);
  const [roguelikeLoaded, setRoguelikeLoaded] = useState(false);
  const [memoryStories, setMemoryStories] = useState<StoryEntry[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const {
    favoriteStories,
    favoriteGroups,
    isFavorite,
    toggleFavorite,
    isGroupFavorite,
    toggleFavoriteGroup,
  } = useFavorites();

  const favoriteStoryEntries = useMemo(() => Object.values(favoriteStories), [favoriteStories]);
  const favoriteGroupEntries = useMemo(
    () => Object.values(favoriteGroups),
    [favoriteGroups]
  );

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
    if (!hasSearch) return activityGrouped;
    return activityGrouped
      .map(([activityName, stories]) => {
        const activityMatches = activityName.toLowerCase().includes(normalizedSearch);
        if (activityMatches) {
          return [activityName, stories] as [string, StoryEntry[]];
        }
        const filteredStories = stories.filter(matchesSearch);
        return [activityName, filteredStories] as [string, StoryEntry[]];
      })
      .filter(([, stories]) => stories.length > 0);
  }, [activityGrouped, hasSearch, matchesSearch, normalizedSearch]);

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

  const filteredMemoryStories = useMemo(() => {
    if (!hasSearch) return memoryStories;
    return memoryStories.filter(matchesSearch);
  }, [hasSearch, matchesSearch, memoryStories]);

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
    } else if (activeCategory === 'sidestory') {
      void loadSidestories();
    } else if (activeCategory === 'roguelike') {
      void loadRoguelike();
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

  const loadMemories = async () => {
    if (memoryLoaded) return;
    console.log("[StoryList] 开始加载追忆集");
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
      console.log("[StoryList] 追忆集加载成功，数量:", data.length);
      setMemoryStories(data);
      setMemoryLoaded(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "加载失败";
      console.error("[StoryList] 加载追忆集失败:", errorMsg, err);
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

  const handleSyncSuccess = async () => {
    console.log("[StoryList] 同步成功回调触发");
    await loadMainStories();
    console.log("[StoryList] 关闭同步对话框");
    setSyncDialogOpen(false);
  };

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
          trackOffsetTop="calc(3.5rem + 20px + env(safe-area-inset-top, 0px))"
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
                  {activeSummary}
                </span>
                <div className="w-full sm:w-auto">
                  <Input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="搜索剧情标题或编号"
                    aria-label="搜索剧情标题或编号"
                    className="w-full sm:w-64 md:w-72"
                  />
                </div>
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
                    return (
                      <Collapsible
                        key={`chapter-${index}`}
                        title={chapterName}
                        defaultOpen={index === 0}
                        actions={
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
                        }
                      >
                        {stories.map((story) => (
                          <StoryItem
                            key={story.storyId}
                            story={story}
                            onSelectStory={onSelectStory}
                            isFavorite={isFavorite(story.storyId)}
                            onToggleFavorite={() => toggleFavorite(story)}
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
                      return (
                        <Collapsible
                          key={`activity-${index}`}
                          title={activityName}
                          defaultOpen={index === 0}
                          actions={
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
                          }
                        >
                          {stories.map((story) => (
                            <StoryItem
                              key={story.storyId}
                              story={story}
                              onSelectStory={onSelectStory}
                              isFavorite={isFavorite(story.storyId)}
                              onToggleFavorite={() => toggleFavorite(story)}
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
                      return (
                        <Collapsible
                          key={`sidestory-${index}`}
                          title={name}
                          defaultOpen={index === 0}
                          actions={
                            <GroupFavoriteButton
                              isFavorite={fav}
                              onToggle={() =>
                                toggleFavoriteGroup({ id: groupId, name, type: "other", stories: fullStories })
                              }
                              inactiveText="收藏支线"
                              activeText="取消收藏支线"
                            />
                          }
                        >
                          {stories.map((story) => (
                            <StoryItem
                              key={story.storyId}
                              story={story}
                              onSelectStory={onSelectStory}
                              isFavorite={isFavorite(story.storyId)}
                              onToggleFavorite={() => toggleFavorite(story)}
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
                      return (
                        <Collapsible
                          key={`roguelike-${index}`}
                          title={name}
                          defaultOpen={index === 0}
                          actions={
                            <GroupFavoriteButton
                              isFavorite={fav}
                              onToggle={() =>
                                toggleFavoriteGroup({ id: groupId, name, type: "other", stories: fullStories })
                              }
                              inactiveText="收藏肉鸽"
                              activeText="取消收藏肉鸽"
                            />
                          }
                        >
                          {stories.map((story) => (
                            <StoryItem
                              key={story.storyId}
                              story={story}
                              onSelectStory={onSelectStory}
                              isFavorite={isFavorite(story.storyId)}
                              onToggleFavorite={() => toggleFavorite(story)}
                            />
                          ))}
                        </Collapsible>
                      );
                    })}
                </div>
              )}

              {activeCategory === "memory" && (
                <div className="space-y-2">
                  {memoryLoading && <EmptyState message="追忆集加载中..." />}
                  {!memoryLoading && filteredMemoryStories.length === 0 && (
                    <EmptyState
                      message={hasSearch ? "没有匹配的追忆剧情" : "暂无追忆集或需要同步"}
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
                      />
                    ))}
                </div>
              )}

              {activeCategory === "favorites" && (
                favoriteCount > 0 ? (
                  favoriteGroupList.length > 0 || individualFavoriteGroups.length > 0 ? (
                    <>
                      {favoriteGroupList.map(({ groupId, displayName, allStories, visibleStories, type }, index) => (
                        <Collapsible
                          key={`favorite-group-${groupId}`}
                          title={displayName}
                          defaultOpen={index === 0}
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
                            />
                          ))}
                        </Collapsible>
                      ))}

                      {individualFavoriteGroups.map(({ groupKey, displayName, stories }, index) => (
                        <Collapsible
                          key={`favorite-individual-${groupKey}`}
                          title={displayName}
                          defaultOpen={favoriteGroupList.length === 0 && index === 0}
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
}: {
  story: StoryEntry;
  onSelectStory: (story: StoryEntry) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
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
