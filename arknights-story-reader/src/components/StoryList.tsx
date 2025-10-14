import { useEffect, useMemo, useState } from "react";
import { api } from "@/services/api";
import type { StoryEntry } from "@/types/story";
import { Button } from "@/components/ui/button";
import { BookOpen, RefreshCw, Star } from "lucide-react";
import { SyncDialog } from "@/components/SyncDialog";
import { Collapsible } from "@/components/ui/collapsible";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";
import { useFavorites } from "@/hooks/useFavorites";

interface StoryListProps {
  onSelectStory: (story: StoryEntry) => void;
}

export function StoryList({ onSelectStory }: StoryListProps) {
  const [mainGrouped, setMainGrouped] = useState<Array<[string, StoryEntry[]]>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'favorites' | 'main' | 'activity' | 'memory'>('main');
  const [activityGrouped, setActivityGrouped] = useState<Array<[string, StoryEntry[]]>>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [memoryStories, setMemoryStories] = useState<StoryEntry[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const { favorites, isFavorite, toggleFavorite, isGroupFavorite, toggleFavoriteGroup } = useFavorites();

  const favoriteEntries = useMemo(() => Object.values(favorites), [favorites]);

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

  const favoriteGroups = useMemo(() => {
    if (favoriteEntries.length === 0) return [];

    const grouped = new Map<string, StoryEntry[]>();
    favoriteEntries.forEach((story) => {
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
  }, [favoriteEntries, groupNameMap]);

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
          trackOffsetBottom="calc(4.5rem + env(safe-area-inset-bottom, 0px))"
        >
          <div className="container py-6 pb-24 space-y-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700">
            <div className="grid gap-4">
              <CategoryCard
                title="收藏"
                description={
                  favoriteEntries.length > 0
                    ? `已收藏 ${favoriteEntries.length} 条剧情`
                    : "收藏喜爱的章节或关卡"
                }
                active={activeCategory === "favorites"}
                onClick={() => setActiveCategory("favorites")}
              />
              <CategoryCard
                title="主线剧情"
                description="主线章节"
                active={activeCategory === "main"}
                onClick={() => setActiveCategory("main")}
              />
              <CategoryCard
                title="活动剧情"
                description="活动剧情列表"
                active={activeCategory === "activity"}
                onClick={() => {
                  setActiveCategory("activity");
                  if (!activityLoaded) {
                    loadActivities();
                  }
                }}
              />
              <CategoryCard
                title="追忆集"
                description="干员密录故事"
                active={activeCategory === "memory"}
                onClick={() => {
                  setActiveCategory("memory");
                  if (!memoryLoaded) {
                    loadMemories();
                  }
                }}
              />
            </div>

            <div className="mt-4 space-y-4">
              {activeCategory === "main" && (
                mainGrouped.length > 0 ? (
                  mainGrouped.map(([chapterName, stories], index) => {
                    const chapterFavorite = isGroupFavorite(stories);
                    return (
                      <Collapsible
                        key={`chapter-${index}`}
                        title={chapterName}
                        defaultOpen={index === 0}
                        actions={
                          <GroupFavoriteButton
                            isFavorite={chapterFavorite}
                            onToggle={() => toggleFavoriteGroup(stories)}
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
                  <EmptyState message="暂无主线剧情，可能需要同步。" />
                )
              )}

              {activeCategory === "activity" && (
                <div className="space-y-3">
                  {activityLoading && <EmptyState message="活动剧情加载中..." />}
                  {!activityLoading && activityGrouped.length === 0 && (
                    <EmptyState message="暂无活动剧情或需要同步" />
                  )}
                  {!activityLoading &&
                    activityGrouped.map(([activityName, stories], index) => {
                      const activityFavorite = isGroupFavorite(stories);
                      return (
                        <Collapsible
                          key={`activity-${index}`}
                          title={activityName}
                          defaultOpen={index === 0}
                          actions={
                            <GroupFavoriteButton
                              isFavorite={activityFavorite}
                              onToggle={() => toggleFavoriteGroup(stories)}
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

              {activeCategory === "memory" && (
                <div className="space-y-2">
                  {memoryLoading && <EmptyState message="追忆集加载中..." />}
                  {!memoryLoading && memoryStories.length === 0 && (
                    <EmptyState message="暂无追忆集或需要同步" />
                  )}
                  {!memoryLoading &&
                    memoryStories.map((story) => (
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
                favoriteEntries.length > 0 ? (
                  favoriteGroups.map(({ groupKey, displayName, stories }, index) => {
                    return (
                      <Collapsible
                        key={`favorite-${groupKey}`}
                        title={displayName}
                        defaultOpen={index === 0}
                        actions={
                          <GroupFavoriteButton
                            isFavorite
                            onToggle={() => toggleFavoriteGroup(stories)}
                            inactiveText="收藏该组"
                            activeText="取消收藏该组"
                          />
                        }
                      >
                        {stories.map((story) => (
                          <StoryItem
                            key={`favorite-${story.storyId}`}
                            story={story}
                            onSelectStory={onSelectStory}
                            isFavorite={true}
                            onToggleFavorite={() => toggleFavorite(story)}
                          />
                        ))}
                      </Collapsible>
                    );
                  })
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

function CategoryCard({
  title,
  description,
  active,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border transition-all duration-300 p-6 shadow-sm hover:shadow hover:-translate-y-0.5 motion-safe:animate-in motion-safe:fade-in-0 ${
        active
          ? "border-[hsl(var(--color-primary))] bg-[hsl(var(--color-accent))]"
          : "border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))]"
      }`}
    >
      <h2 className="text-xl font-semibold mb-1">{title}</h2>
      <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{description}</p>
    </button>
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
