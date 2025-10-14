import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/services/api";
import type { ParsedStoryContent, StoryEntry } from "@/types/story";
import { Button } from "@/components/ui/button";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";
import { Input } from "@/components/ui/input";
import { Collapsible } from "@/components/ui/collapsible";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CharactersPanelProps {
  onOpenStory: (story: StoryEntry, character: string) => void;
}

interface CharacterStatsPerStory {
  story: StoryEntry;
  count: number;
}

interface CharacterAggregate {
  name: string;
  total: number;
  perStory: CharacterStatsPerStory[];
}

type GroupCategory = "main" | "activity" | "memory" | "other";

interface GroupInfo {
  category: GroupCategory;
  groupName: string;
  groupOrder: number; // 用于排序章节/活动顺序
  storyOrder: number; // 用于组内排序（同主页）
}

function countCharactersInStory(content: ParsedStoryContent): Map<string, number> {
  const map = new Map<string, number>();
  content.segments.forEach((seg) => {
    if (seg.type === "dialogue") {
      const key = seg.characterName;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  });
  return map;
}

export function CharactersPanel({ onOpenStory }: CharactersPanelProps) {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [aggregates, setAggregates] = useState<Map<string, CharacterAggregate>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const loadingRef = useRef(false);
  const [groupInfoByStoryId, setGroupInfoByStoryId] = useState<Map<string, GroupInfo>>(new Map());
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      // 使用主页同样的分组与排序数据源
      const [mainGrouped, activityGrouped, memoryStories] = await Promise.all([
        api.getMainStoriesGrouped(),
        api.getActivityStoriesGrouped(),
        api.getMemoryStories(),
      ]);

      // 生成 groupInfoByStoryId
      const groupInfo = new Map<string, GroupInfo>();

      mainGrouped.forEach(([chapterName, stories], groupOrder) => {
        stories.forEach((s) => {
          groupInfo.set(s.storyId, {
            category: "main",
            groupName: chapterName,
            groupOrder,
            storyOrder: s.storySort,
          });
        });
      });

      activityGrouped.forEach(([activityName, stories], groupOrder) => {
        stories.forEach((s) => {
          groupInfo.set(s.storyId, {
            category: "activity",
            groupName: activityName,
            groupOrder,
            storyOrder: s.storySort,
          });
        });
      });

      memoryStories.forEach((s, idx) => {
        groupInfo.set(s.storyId, {
          category: "memory",
          groupName: "追忆集",
          groupOrder: idx, // 追忆集整体作为一组，这里顺序意义不大
          storyOrder: s.storySort,
        });
      });

      // 收集所有剧情条目并去重
      const storiesMap = new Map<string, StoryEntry>();
      mainGrouped.forEach(([, stories]) => stories.forEach((s) => storiesMap.set(s.storyId, s)));
      activityGrouped.forEach(([, stories]) => stories.forEach((s) => storiesMap.set(s.storyId, s)));
      memoryStories.forEach((s) => storiesMap.set(s.storyId, s));

      const stories = Array.from(storiesMap.values());
      setGroupInfoByStoryId(groupInfo);
      setProgress({ current: 0, total: stories.length });

      const aggMap = new Map<string, CharacterAggregate>();

      // 顺序加载，避免峰值占用过高；可根据需要增加并发
      for (let i = 0; i < stories.length; i += 1) {
        const story = stories[i];
        try {
          const content = await api.getStoryContent(story.storyTxt);
          const localCounts = countCharactersInStory(content);
          localCounts.forEach((count, name) => {
            const existing = aggMap.get(name);
            if (existing) {
              existing.total += count;
              existing.perStory.push({ story, count });
            } else {
              aggMap.set(name, {
                name,
                total: count,
                perStory: [{ story, count }],
              });
            }
          });
        } catch (e) {
          // 单章失败不影响整体
          console.warn("[CharactersPanel] 读取剧情失败:", story.storyName, e);
        }
        setProgress({ current: i + 1, total: stories.length });
      }

      // 整理每个角色的 perStory 排序（默认先按章节内排序）
      aggMap.forEach((agg) => {
        agg.perStory.sort((a, b) => {
          const ga = groupInfo.get(a.story.storyId);
          const gb = groupInfo.get(b.story.storyId);
          const gOrder = (ga?.groupOrder ?? 9999) - (gb?.groupOrder ?? 9999);
          if (gOrder !== 0) return gOrder;
          const sOrder = (ga?.storyOrder ?? a.story.storySort) - (gb?.storyOrder ?? b.story.storySort);
          if (sOrder !== 0) return sOrder;
          return a.story.storyName.localeCompare(b.story.storyName, "zh-Hans");
        });
      });

      setAggregates(aggMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const allCharacters = useMemo(() => {
    return Array.from(aggregates.values())
      .filter((c) => !!c.name && c.name.trim().length > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "zh-Hans"));
  }, [aggregates]);

  const filteredCharacters = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allCharacters;
    return allCharacters.filter((c) => c.name.toLowerCase().includes(q));
  }, [allCharacters, search]);

  const selectedAgg = useMemo(() => (selected ? aggregates.get(selected) ?? null : null), [aggregates, selected]);

  const groupedByChapter = useMemo(() => {
    if (!selectedAgg) return [] as Array<{ groupName: string; items: CharacterStatsPerStory[]; order: number }>;
    const buckets = new Map<string, { groupName: string; order: number; items: CharacterStatsPerStory[] }>();
    selectedAgg.perStory.forEach((ps) => {
      const info = groupInfoByStoryId.get(ps.story.storyId);
      const key = info ? `${info.category}:${info.groupName}` : `other:其他`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.items.push(ps);
      } else {
        buckets.set(key, {
          groupName: info?.groupName ?? "其他",
          order: info?.groupOrder ?? 9999,
          items: [ps],
        });
      }
    });
    return Array.from(buckets.values()).sort((a, b) => a.order - b.order);
  }, [groupInfoByStoryId, selectedAgg]);

  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-3 border-b border-[hsl(var(--color-border))] flex items-center gap-3">
        {selected && (
          <Button variant="ghost" size="icon" onClick={() => setSelected(null)} aria-label="返回">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <h1 className="text-base font-semibold">
          {selected ? `人物：${selected}` : "人物统计"}
        </h1>
        {!selected && (
          <div className="ml-auto w-56">
            <Input placeholder="搜索人物" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
      </header>

      <CustomScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {loading && (
            <div className="flex items-center gap-3 text-sm text-[hsl(var(--color-muted-foreground))]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                正在统计人物发言… {progress.current}/{progress.total}
              </span>
            </div>
          )}
          {error && (
            <div className="text-sm text-[hsl(var(--color-destructive))]">{error}</div>
          )}

          {!selected && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCharacters.map((c) => (
                <button
                  key={c.name}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] p-3 text-left hover:bg-[hsl(var(--color-accent))] transition-colors"
                  )}
                  onClick={() => setSelected(c.name)}
                >
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-[hsl(var(--color-muted-foreground))]">{c.total} 次</div>
                </button>
              ))}
              {!loading && filteredCharacters.length === 0 && (
                <div className="col-span-full text-sm text-[hsl(var(--color-muted-foreground))]">
                  未找到匹配人物
                </div>
              )}
            </div>
          )}

          {selected && selectedAgg && (
            <div className="space-y-4">
              <div className="text-sm text-[hsl(var(--color-muted-foreground))]">
                共计 {selectedAgg.total} 次发言，涉及 {selectedAgg.perStory.length} 个章节/关卡
              </div>
          {groupedByChapter.map((group, idx) => {
            const key = group.groupName;
            const q = (groupSearch[key] ?? "").trim().toLowerCase();
            const items = q
              ? group.items.filter(({ story }) =>
                  [story.storyName, story.storyCode ?? "", story.storyGroup ?? ""].some((v) =>
                    v.toLowerCase().includes(q)
                  )
                )
              : group.items;
            const totalCount = group.items.reduce((sum, it) => sum + it.count, 0);

            return (
              <Collapsible key={key} title={group.groupName} defaultOpen={idx === 0}>
                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    共 {group.items.length} 个关卡，合计 {totalCount} 次
                  </div>
                  <div className="w-48">
                    <Input
                      placeholder="组内搜索"
                      value={groupSearch[key] ?? ""}
                      onChange={(e) =>
                        setGroupSearch((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2 mt-2">
                  {items.length === 0 && (
                    <div className="text-xs text-[hsl(var(--color-muted-foreground))] px-1">无匹配结果</div>
                  )}
                  {items.map(({ story, count }) => (
                    <div
                      key={story.storyId}
                      className="flex items-center justify-between rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] p-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{story.storyName}</div>
                        <div className="text-xs text-[hsl(var(--color-muted-foreground))] truncate">
                          {story.storyCode || story.storyGroup}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <div className="text-xs text-[hsl(var(--color-muted-foreground))]">{count} 次</div>
                        <Button size="sm" onClick={() => onOpenStory(story, selectedAgg.name)}>
                          打开
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Collapsible>
            );
          })}
            </div>
          )}
        </div>
      </CustomScrollArea>
    </div>
  );
}
