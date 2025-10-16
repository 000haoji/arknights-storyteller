import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/services/api";
import type { 
  ParsedStoryContent, 
  StoryEntry, 
  CharacterBasicInfo,
  CharacterHandbook,
  CharacterVoice 
} from "@/types/story";
import { Button } from "@/components/ui/button";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";
import { Input } from "@/components/ui/input";
import { Collapsible } from "@/components/ui/collapsible";
import { ArrowLeft, Loader2, BookOpen, Mic, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavoriteCharacters } from "@/hooks/useFavoriteCharacters";

interface CharactersPanelProps {
  onOpenStory: (story: StoryEntry, character: string) => void;
}

type SubTab = "stats" | "handbook";

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
  const { isFavorite: isCharFavorite, toggleFavorite: toggleCharFavorite } = useFavoriteCharacters();
  
  const [subTab, setSubTab] = useState<SubTab>("stats");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [aggregates, setAggregates] = useState<Map<string, CharacterAggregate>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const loadingRef = useRef(false);
  const [groupInfoByStoryId, setGroupInfoByStoryId] = useState<Map<string, GroupInfo>>(new Map());
  const [groupSearch, setGroupSearch] = useState<Record<string, string>>({});
  const [cacheUsed, setCacheUsed] = useState(false);
  const [cacheBuiltAt, setCacheBuiltAt] = useState<number | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  
  // 档案相关状态
  const [characters, setCharacters] = useState<CharacterBasicInfo[]>([]);
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [handbook, setHandbook] = useState<CharacterHandbook | null>(null);
  const [voices, setVoices] = useState<CharacterVoice | null>(null);
  const [handbookLoading, setHandbookLoading] = useState(false);
  const [handbookSearch, setHandbookSearch] = useState("");
  const [handbookTab, setHandbookTab] = useState<"archive" | "voice">("archive");

  const CACHE_PREFIX = "arknights-characters-cache";
  const getCacheKey = useCallback((v: string) => `${CACHE_PREFIX}:${v}`, []);

  const loadAll = useCallback(async (opts?: { forceRefresh?: boolean }) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const ver = await api.getCurrentVersion();
      setVersion(ver);

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
          groupName: "干员密录",
          groupOrder: idx, // 干员密录整体作为一组，这里顺序意义不大
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

      // 1) 先尝试命中缓存
      let cacheApplied = false;
      if (!opts?.forceRefresh && ver) {
        try {
          const raw = localStorage.getItem(getCacheKey(ver));
          if (raw) {
            const parsed: {
              builtAt: number;
              data: Record<string, { name: string; total: number; perStory: Array<{ storyId: string; count: number }> }>;
            } = JSON.parse(raw);
            Object.values(parsed.data).forEach((item) => {
              const perStory: CharacterStatsPerStory[] = [];
              item.perStory.forEach((ps) => {
                const story = storiesMap.get(ps.storyId);
                if (story) perStory.push({ story, count: ps.count });
              });
              aggMap.set(item.name, { name: item.name, total: item.total, perStory });
            });
            cacheApplied = true;
            setCacheUsed(true);
            setCacheBuiltAt(parsed.builtAt);
          }
        } catch (e) {
          // ignore cache parsing errors
          console.warn("[CharactersPanel] 缓存读取失败，将重新构建", e);
        }
      }

      // 顺序加载，避免峰值占用过高；可根据需要增加并发
      if (!cacheApplied) {
        setCacheUsed(false);
        setCacheBuiltAt(null);
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

      // 2) 没用缓存则保存缓存（精简 perStory 为 storyId + count）
      if (!cacheApplied && ver) {
        try {
          const plain: Record<string, { name: string; total: number; perStory: Array<{ storyId: string; count: number }> }> = {};
          aggMap.forEach((agg, name) => {
            plain[name] = {
              name,
              total: agg.total,
              perStory: agg.perStory.map((ps) => ({ storyId: ps.story.storyId, count: ps.count })),
            };
          });
          const builtAt = Date.now();
          localStorage.setItem(
            getCacheKey(ver),
            JSON.stringify({ builtAt, data: plain })
          );
          setCacheBuiltAt(builtAt);
        } catch (e) {
          console.warn("[CharactersPanel] 写入缓存失败", e);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [getCacheKey]);

  // 加载干员列表（用于档案标签页）
  const loadCharacters = useCallback(async () => {
    if (charactersLoading || characters.length > 0) return;
    setCharactersLoading(true);
    try {
      const chars = await api.getCharactersList();
      setCharacters(chars);
    } catch (err) {
      console.error("[CharactersPanel] 加载干员列表失败:", err);
    } finally {
      setCharactersLoading(false);
    }
  }, [charactersLoading, characters.length]);

  // 加载指定干员的档案和语音
  const loadCharacterData = useCallback(async (charId: string) => {
    setHandbookLoading(true);
    try {
      const [handbookData, voicesData] = await Promise.all([
        api.getCharacterHandbook(charId),
        api.getCharacterVoices(charId),
      ]);
      setHandbook(handbookData);
      setVoices(voicesData);
    } catch (err) {
      console.error("[CharactersPanel] 加载干员数据失败:", err);
    } finally {
      setHandbookLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subTab === "stats") {
      loadAll();
    } else if (subTab === "handbook") {
      loadCharacters();
    }
  }, [subTab, loadAll, loadCharacters]);

  useEffect(() => {
    if (selectedCharId) {
      loadCharacterData(selectedCharId);
    }
  }, [selectedCharId, loadCharacterData]);

  useEffect(() => {
    const handler = () => {
      loadAll({ forceRefresh: true }).catch((error) =>
        console.warn("[CharactersPanel] 刷新统计失败", error)
      );
    };
    window.addEventListener("app:refresh-character-stats", handler);
    return () => window.removeEventListener("app:refresh-character-stats", handler);
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

  const filteredHandbookCharacters = useMemo(() => {
    let filtered = characters;
    const q = handbookSearch.trim().toLowerCase();
    if (q) {
      filtered = characters.filter((c) => 
        c.name.toLowerCase().includes(q) || 
        c.appellation.toLowerCase().includes(q)
      );
    }
    
    // 被收藏的干员排在前面
    return filtered.sort((a, b) => {
      const aFav = isCharFavorite(a.charId);
      const bFav = isCharFavorite(b.charId);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      // 相同收藏状态下，按稀有度和名字排序
      if (a.rarity !== b.rarity) return b.rarity - a.rarity;
      return a.name.localeCompare(b.name, "zh-Hans");
    });
  }, [characters, handbookSearch, isCharFavorite]);

  const professionMap: Record<string, string> = {
    WARRIOR: "近卫",
    SNIPER: "狙击",
    TANK: "重装",
    MEDIC: "医疗",
    SUPPORT: "辅助",
    CASTER: "术师",
    SPECIAL: "特种",
    PIONEER: "先锋",
  };

  const rarityStars = (rarity: number) => "★".repeat(rarity + 1);

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--color-background))]">
      {/* 子标签页切换 */}
      <div className="px-4 pt-3 pb-2 border-b border-[hsl(var(--color-border))]">
        <div className="flex gap-2">
          <Button
            variant={subTab === "stats" ? "default" : "ghost"}
            size="sm"
            onClick={() => { 
              setSubTab("stats"); 
              setSelected(null);
              setSelectedCharId(null);
            }}
          >
            人物统计
          </Button>
          <Button
            variant={subTab === "handbook" ? "default" : "ghost"}
            size="sm"
            onClick={() => { 
              setSubTab("handbook");
              setSelected(null);
              setSelectedCharId(null);
            }}
          >
            人物档案
          </Button>
        </div>
      </div>

      <header className="px-4 py-3 border-b border-[hsl(var(--color-border))] flex items-center gap-3">
        {(selected || selectedCharId) && (
          <Button variant="ghost" size="icon" onClick={() => {
            setSelected(null);
            setSelectedCharId(null);
            setHandbook(null);
            setVoices(null);
          }} aria-label="返回">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <h1 className="text-base font-semibold">
          {selected ? `人物：${selected}` : selectedCharId && handbook ? `${handbook.charName}` : subTab === "stats" ? "人物统计" : "人物档案"}
        </h1>
        {!selected && !selectedCharId && (
          <>
            <div className="ml-auto w-56">
              <Input 
                placeholder={subTab === "stats" ? "搜索人物" : "搜索干员"} 
                value={subTab === "stats" ? search : handbookSearch} 
                onChange={(e) => subTab === "stats" ? setSearch(e.target.value) : setHandbookSearch(e.target.value)} 
              />
            </div>
          </>
        )}
      </header>

      <div className="flex-1 overflow-hidden">
        <CustomScrollArea className="h-full">
          <div className="p-4 space-y-4">
          {/* 人物统计标签页 */}
          {subTab === "stats" && !selectedCharId && (
            <>
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

              {!loading && !selected && (
                <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
                  {cacheUsed && cacheBuiltAt
                    ? `已使用缓存，构建于 ${new Date(cacheBuiltAt).toLocaleString()}`
                    : version
                    ? `未使用缓存（版本 ${version}）`
                    : null}
                </div>
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
            </>
          )}

          {/* 人物档案标签页 */}
          {subTab === "handbook" && (
            <>
              {charactersLoading && (
                <div className="flex items-center gap-3 text-sm text-[hsl(var(--color-muted-foreground))]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>正在加载干员列表…</span>
                </div>
              )}

              {!selectedCharId && !charactersLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredHandbookCharacters.map((char) => {
                    const isFav = isCharFavorite(char.charId);
                    return (
                      <div key={char.charId} className="relative">
                        <button
                          className={cn(
                            "w-full flex flex-col items-start gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] p-3 pr-10 text-left hover:bg-[hsl(var(--color-accent))] transition-colors",
                            isFav && "ring-2 ring-[hsl(var(--color-primary))]"
                          )}
                          onClick={() => setSelectedCharId(char.charId)}
                        >
                          <div className="font-medium truncate w-full">{char.name}</div>
                          <div className="text-xs text-[hsl(var(--color-muted-foreground))] truncate w-full flex items-center gap-2">
                            <span>{professionMap[char.profession] || char.profession} · {char.appellation}</span>
                            <span className="ml-auto">{rarityStars(char.rarity)}</span>
                          </div>
                        </button>
                        <button
                          className={cn(
                            "absolute top-2 right-2 p-1 rounded-full transition-colors",
                            isFav
                              ? "text-[hsl(var(--color-primary))]"
                              : "text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-primary))]"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCharFavorite(char.charId);
                          }}
                          aria-label={isFav ? "取消收藏" : "收藏"}
                        >
                          <Star className={cn("h-4 w-4", isFav && "fill-current")} />
                        </button>
                      </div>
                    );
                  })}
                  {!charactersLoading && filteredHandbookCharacters.length === 0 && (
                    <div className="col-span-full text-sm text-[hsl(var(--color-muted-foreground))]">
                      未找到匹配干员
                    </div>
                  )}
                </div>
              )}

              {selectedCharId && (
                <div className="space-y-4">
                  {handbookLoading && (
                    <div className="flex items-center gap-3 text-sm text-[hsl(var(--color-muted-foreground))]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>正在加载干员数据…</span>
                    </div>
                  )}

                  {!handbookLoading && handbook && voices && (
                    <>
                      {/* 档案/语音切换按钮 */}
                      <div className="flex gap-2 pb-2 border-b border-[hsl(var(--color-border))]">
                        <Button
                          variant={handbookTab === "archive" ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setHandbookTab("archive")}
                        >
                          <BookOpen className="h-4 w-4 mr-2" />
                          档案资料
                        </Button>
                        <Button
                          variant={handbookTab === "voice" ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setHandbookTab("voice")}
                        >
                          <Mic className="h-4 w-4 mr-2" />
                          语音 ({voices.voices.length})
                        </Button>
                      </div>

                      {/* 档案资料 */}
                      {handbookTab === "archive" && (
                        <div className="space-y-4">
                          {handbook.storyTextAudio.map((section, idx) => (
                            <Collapsible key={idx} title={section.storyTitle} defaultOpen={idx === 0}>
                              <div className="space-y-3">
                                {section.stories.map((story, storyIdx) => (
                                  <div
                                    key={storyIdx}
                                    className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] p-4"
                                  >
                                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                                      {story.storyText}
                                    </div>
                                    {story.unLockType !== "DIRECT" && (
                                      <div className="text-xs text-[hsl(var(--color-muted-foreground))] mt-2">
                                        解锁条件：{story.unLockType === "FAVOR" ? `好感度 ${story.unLockParam}` : story.unLockType}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </Collapsible>
                          ))}
                        </div>
                      )}

                      {/* 语音列表 */}
                      {handbookTab === "voice" && (
                        <div className="space-y-2">
                          {voices.voices.map((voice) => (
                            <div
                              key={voice.voiceId}
                              className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] p-3"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div className="font-medium text-sm">{voice.voiceTitle}</div>
                                {voice.unlockType !== "DIRECT" && (
                                  <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
                                    {voice.unlockType === "FAVOR" ? "需要好感度" : voice.unlockType}
                                  </div>
                                )}
                              </div>
                              <div className="text-sm text-[hsl(var(--color-muted-foreground))]">
                                {voice.voiceText}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
          </div>
        </CustomScrollArea>
      </div>
    </div>
  );
}
