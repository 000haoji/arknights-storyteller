import { useCallback, useEffect, useState, useMemo, type ReactNode } from "react";
import { api } from "@/services/api";
import type { Furniture, FurnitureTheme, FurnitureSearchResult, RoguelikeCharm, RoguelikeRelic, RoguelikeStage } from "@/types/story";
import { Button } from "@/components/ui/button";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";
import { Input } from "@/components/ui/input";
import { Collapsible } from "@/components/ui/collapsible";
import { Search, Loader2, Package, X } from "lucide-react";

type TabType = "furniture" | "rogueCharm" | "rogueRelic" | "rogueStage";

// ==================== 辅助组件 ====================
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

export function FurniturePanel() {
  const [activeTab, setActiveTab] = useState<TabType>("furniture");
  const [loading, setLoading] = useState(false);
  const [allFurnitures, setAllFurnitures] = useState<Furniture[]>([]);
  const [themes, setThemes] = useState<FurnitureTheme[]>([]);
  const [rogueCharms, setRogueCharms] = useState<RoguelikeCharm[]>([]);
  const [rogueRelics, setRogueRelics] = useState<RoguelikeRelic[]>([]);
  const [rogueStages, setRogueStages] = useState<RoguelikeStage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FurnitureSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFurniture, setSelectedFurniture] = useState<Furniture | null>(null);

  // 一次性加载所有数据
  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [themeList, furnitureList, charmList, relicList, stageList] = await Promise.all([
          api.getFurnitureThemes(),
          api.getAllFurnitures(),
          api.getRoguelikeCharms(),
          api.getRoguelikeRelics(),
          api.getRoguelikeStages()
        ]);
        setThemes(themeList);
        setAllFurnitures(furnitureList);
        setRogueCharms(charmList);
        setRogueRelics(relicList);
        setRogueStages(stageList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
        console.error("加载道具数据失败:", err);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
  }, []);

  // 搜索处理
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const results = await api.searchFurnitures(searchQuery);
      setSearchResults(results);
      setIsSearching(true);
    } catch (err) {
      console.error("搜索失败:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  // 清除搜索
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setIsSearching(false);
    setSearchResults([]);
  }, []);

  // 获取星级显示
  const getStars = (rarity: number) => {
    return "★".repeat(rarity);
  };

  // 肉鸽场景 Map
  const rogueStageMap = useMemo(() => {
    const map = new Map<string, RoguelikeStage>();
    rogueStages.forEach(stage => map.set(stage.id, stage));
    return map;
  }, [rogueStages]);

  // 按主题分组家具
  const furnituresByTheme = useMemo(() => {
    const grouped = new Map<string, Furniture[]>();
    allFurnitures.forEach(furniture => {
      const themeId = furniture.themeId;
      if (!grouped.has(themeId)) {
        grouped.set(themeId, []);
      }
      grouped.get(themeId)!.push(furniture);
    });
    return grouped;
  }, [allFurnitures]);

  // 主题列表（按sortId排序）
  const sortedThemes = useMemo(() => {
    return [...themes].sort((a, b) => a.sortId - b.sortId);
  }, [themes]);

  // 按类别分组肉鸽藏品
  const relicsByCategory = useMemo(() => {
    const grouped = new Map<string, RoguelikeRelic[]>();
    rogueRelics.forEach(relic => {
      const category = relic.category || "未分类";
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(relic);
    });
    return grouped;
  }, [rogueRelics]);

  // 按主题分组肉鸽场景
  const stagesByTheme = useMemo(() => {
    const grouped = new Map<string, RoguelikeStage[]>();
    rogueStages.forEach(stage => {
      const theme = stage.themeLabel || stage.themeKey || "未分类";
      if (!grouped.has(theme)) {
        grouped.set(theme, []);
      }
      grouped.get(theme)!.push(stage);
    });
    return grouped;
  }, [rogueStages]);

  // 道具总数
  const itemCount = useMemo(() => {
    if (isSearching) return searchResults.length;
    if (activeTab === "furniture") return allFurnitures.length;
    if (activeTab === "rogueCharm") return rogueCharms.length;
    if (activeTab === "rogueRelic") return rogueRelics.length;
    return rogueStages.length;
  }, [activeTab, isSearching, searchResults, allFurnitures, rogueCharms, rogueRelics, rogueStages]);

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--color-background))]">
      {/* 头部 */}
      <div className="flex-none border-b bg-[hsl(var(--color-card))]">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Package className="h-5 w-5" />
              道具浏览
            </h1>
            <span className="text-sm text-[hsl(var(--color-muted-foreground))]">
              共 {itemCount} 件
            </span>
          </div>

          {/* 标签切换 */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={activeTab === "furniture" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActiveTab("furniture");
                clearSearch();
              }}
            >
              家具
            </Button>
            <Button
              variant={activeTab === "rogueCharm" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActiveTab("rogueCharm");
                clearSearch();
              }}
            >
              活动收藏品
            </Button>
            <Button
              variant={activeTab === "rogueRelic" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActiveTab("rogueRelic");
                clearSearch();
              }}
            >
              肉鸽藏品
            </Button>
            <Button
              variant={activeTab === "rogueStage" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActiveTab("rogueStage");
                clearSearch();
              }}
            >
              肉鸽场景
            </Button>
          </div>

          {/* 搜索框 */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={
                  activeTab === "furniture" 
                    ? "搜索家具名称或描述..." 
                    : activeTab === "rogueCharm"
                    ? "搜索收藏品名称或描述..."
                    : activeTab === "rogueRelic"
                    ? "搜索藏品名称或描述..."
                    : "搜索场景名称或描述..."
                }
                className="pr-8"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {isSearching && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[hsl(var(--color-muted-foreground))]">
                搜索结果：{searchResults.length} 件
              </span>
              <Button variant="outline" size="sm" onClick={clearSearch}>
                清除搜索
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex-none p-4 bg-red-500/10 text-red-500 text-sm">
          {error}
        </div>
      )}

      {/* 道具列表 */}
      <div className="flex-1 overflow-hidden">
        <CustomScrollArea className="h-full">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--color-muted-foreground))]" />
            </div>
          ) : activeTab === "furniture" ? (
            /* 家具展示 */
            <div className="p-4 space-y-2">
              {sortedThemes.map((theme) => {
                const themeFurnitures = furnituresByTheme.get(theme.themeId) || [];
                if (themeFurnitures.length === 0) return null;

                return (
                  <Collapsible
                    key={theme.themeId}
                    title={theme.themeName}
                    defaultOpen={false}
                    subtitle={`${themeFurnitures.length} 件家具`}
                  >
                    <div className="space-y-2 mt-2">
                      {themeFurnitures.map((furniture) => (
                        <div
                          key={furniture.id}
                          onClick={() => setSelectedFurniture(furniture)}
                          className="p-4 rounded-lg border bg-[hsl(var(--color-card))] cursor-pointer transition-all hover:shadow-lg hover:border-[hsl(var(--color-primary))]"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold">{furniture.name}</h3>
                            <span className="text-yellow-500 text-sm">
                              {getStars(furniture.rarity)}
                            </span>
                          </div>
                          <p className="text-sm text-[hsl(var(--color-muted-foreground))] mb-2">
                            {furniture.description}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <span className="px-2 py-1 text-xs rounded-full bg-blue-500/10 text-blue-500">
                              舒适度 {furniture.comfort}
                            </span>
                            <span className="px-2 py-1 text-xs rounded-full bg-purple-500/10 text-purple-500">
                              {furniture.subType}
                            </span>
                            <span className="text-xs text-[hsl(var(--color-muted-foreground))]">
                              {furniture.width}×{furniture.depth}×{furniture.height}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          ) : activeTab === "rogueCharm" ? (
            /* 活动收藏品展示 */
            rogueCharms.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-[hsl(var(--color-muted-foreground))]">
                <Package className="h-12 w-12 mb-2 opacity-50" />
                <p>暂无活动收藏品</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {rogueCharms.map((charm) => (
                  <RoguelikeCharmItem 
                    key={charm.id} 
                    charm={charm} 
                    stageMap={rogueStageMap} 
                  />
                ))}
              </div>
            )
          ) : activeTab === "rogueRelic" ? (
            /* 肉鸽藏品展示 */
            rogueRelics.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-[hsl(var(--color-muted-foreground))]">
                <Package className="h-12 w-12 mb-2 opacity-50" />
                <p>暂无肉鸽藏品</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {Array.from(relicsByCategory.entries()).map(([category, relics]) => (
                  <Collapsible
                    key={category}
                    title={category}
                    defaultOpen={false}
                    subtitle={`${relics.length} 件藏品`}
                  >
                    <div className="space-y-3 mt-2">
                      {relics.map((relic) => (
                        <RoguelikeRelicItem key={relic.id} relic={relic} />
                      ))}
                    </div>
                  </Collapsible>
                ))}
              </div>
            )
          ) : (
            /* 肉鸽场景展示 */
            rogueStages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-[hsl(var(--color-muted-foreground))]">
                <Package className="h-12 w-12 mb-2 opacity-50" />
                <p>暂无肉鸽场景</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {Array.from(stagesByTheme.entries()).map(([theme, stages]) => {
                  const themeKey = stages[0]?.themeKey
                    ? stages[0].themeKey!.toUpperCase()
                    : undefined;
                  const title = themeKey ? `${theme} (${themeKey})` : theme;
                  return (
                    <Collapsible
                      key={theme}
                      title={title}
                      defaultOpen={false}
                      subtitle={`${stages.length} 个场景`}
                    >
                      <div className="space-y-3 mt-2">
                        {stages.map((stage) => (
                          <RoguelikeStageItem key={stage.id} stage={stage} />
                        ))}
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            )
          )}
        </CustomScrollArea>
      </div>

      {/* 详情面板 */}
      {selectedFurniture && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-[hsl(var(--color-card))] w-full md:max-w-2xl md:rounded-lg max-h-[80vh] flex flex-col animate-in slide-in-from-bottom-10 md:slide-in-from-bottom-0 duration-300">
            {/* 详情头部 */}
            <div className="flex items-start justify-between p-6 border-b">
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">{selectedFurniture.name}</h2>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-yellow-500 text-lg">
                    {getStars(selectedFurniture.rarity)}
                  </span>
                  <span className="px-2 py-1 rounded-full bg-blue-500/10 text-blue-500">
                    舒适度 {selectedFurniture.comfort}
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedFurniture(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* 详情内容 */}
            <CustomScrollArea className="flex-1">
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="font-semibold mb-2 text-[hsl(var(--color-muted-foreground))]">描述</h3>
                  <p className="text-sm">{selectedFurniture.description}</p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 text-[hsl(var(--color-muted-foreground))]">用途</h3>
                  <p className="text-sm">{selectedFurniture.usage}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2 text-[hsl(var(--color-muted-foreground))]">类型</h3>
                    <p className="text-sm">{selectedFurniture.type} / {selectedFurniture.subType}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2 text-[hsl(var(--color-muted-foreground))]">位置</h3>
                    <p className="text-sm">{selectedFurniture.location}</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 text-[hsl(var(--color-muted-foreground))]">尺寸</h3>
                  <p className="text-sm">
                    宽 {selectedFurniture.width} × 深 {selectedFurniture.depth} × 高 {selectedFurniture.height}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2 text-[hsl(var(--color-muted-foreground))]">获取方式</h3>
                  <p className="text-sm">{selectedFurniture.obtainApproach}</p>
                </div>

                {selectedFurniture.musicId && (
                  <div>
                    <h3 className="font-semibold mb-2 text-[hsl(var(--color-muted-foreground))]">音乐</h3>
                    <p className="text-sm">{selectedFurniture.musicId}</p>
                  </div>
                )}
              </div>
            </CustomScrollArea>
          </div>
        </div>
      )}

    </div>
  );
}

// ==================== 肉鸽收藏品渲染组件 ====================
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

  if (charm.dropStageIds && charm.dropStageIds.length > 0) {
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
          {typeof charm.sort === "number" && <InfoBadge>排序: {charm.sort}</InfoBadge>}
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

// ==================== 肉鸽藏品渲染组件 ====================
function RoguelikeRelicItem({ relic }: { relic: RoguelikeRelic }) {
  const sections: Array<{ title: string; text: string }> = [];

  if (relic.description) {
    sections.push({
      title: "描述",
      text: sanitizeRichText(relic.description),
    });
  }

  if (relic.usage) {
    sections.push({
      title: "用途",
      text: sanitizeRichText(relic.usage),
    });
  }

  if (relic.obtainApproach) {
    sections.push({
      title: "获取方式",
      text: sanitizeRichText(relic.obtainApproach),
    });
  }

  const resourceLines: string[] = [];
  if (relic.iconId) {
    resourceLines.push(`图标: ${relic.iconId}`);
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
          <h3 className="text-base font-semibold leading-tight">{relic.name}</h3>
          <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
            ID: {relic.id}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {typeof relic.sortId === "number" && <InfoBadge>排序: {relic.sortId}</InfoBadge>}
          {relic.type && <InfoBadge>类型: {relic.type}</InfoBadge>}
          {relic.subType && <InfoBadge>子类型: {relic.subType}</InfoBadge>}
          {relic.rarity && <InfoBadge>稀有度: {relic.rarity}</InfoBadge>}
          {typeof relic.value === "number" && (
            <InfoBadge>价值: {relic.value}</InfoBadge>
          )}
        </div>
      </div>

      {sections.map(({ title, text }) => (
        <InfoSection key={title} title={title} text={text} />
      ))}
    </div>
  );
}

// ==================== 肉鸽场景渲染组件 ====================
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

