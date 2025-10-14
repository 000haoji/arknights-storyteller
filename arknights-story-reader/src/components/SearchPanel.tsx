import { useCallback, useEffect, useState } from "react";
import { api } from "@/services/api";
import type { SearchResult, StoryEntry, StoryIndexStatus } from "@/types/story";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";

interface SearchPanelProps {
  onSelectResult: (story: StoryEntry, focus: { query: string; snippet?: string | null }) => void;
}

export function SearchPanel({ onSelectResult }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [indexStatus, setIndexStatus] = useState<StoryIndexStatus | null>(null);
  const [buildingIndex, setBuildingIndex] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [indexMessage, setIndexMessage] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [openingStoryId, setOpeningStoryId] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    try {
      setSearching(true);
      if (debugMode) {
        const data = await api.searchStoriesDebug(query);
        setResults(data.results);
        setDebugLogs(data.logs);
        setDebugExpanded(true);
      } else {
        const data = await api.searchStories(query);
        setResults(data);
        setDebugLogs([]);
        setDebugExpanded(false);
      }
      setSearched(true);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  };

  const openResult = async (result: SearchResult) => {
    try {
      setOpeningStoryId(result.storyId);
      const story = await api.getStoryEntry(result.storyId);
      onSelectResult(story, { query, snippet: result.matchedText });
    } catch (err) {
      console.error("Open story failed:", err);
    } finally {
      setOpeningStoryId(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setSearched(false);
    setDebugLogs([]);
    setDebugExpanded(false);
    setOpeningStoryId(null);
  };

  const refreshIndexStatus = useCallback(async () => {
    try {
      const status = await api.getStoryIndexStatus();
      setIndexStatus(status);
      setIndexError(null);
    } catch (err) {
      console.error("Failed to fetch index status:", err);
      setIndexError("获取索引状态失败");
    }
  }, []);

  const handleBuildIndex = useCallback(async () => {
    setIndexError(null);
    setIndexMessage(null);

    try {
      setBuildingIndex(true);
      await api.buildStoryIndex();
      await refreshIndexStatus();
      setIndexMessage("全文索引建立完成");
    } catch (err) {
      console.error("Build index failed:", err);
      setIndexError("建立索引失败，请重试");
    } finally {
      setBuildingIndex(false);
    }
  }, [refreshIndexStatus]);

  useEffect(() => {
    void refreshIndexStatus();
  }, [refreshIndexStatus]);

  const renderIndexStatusText = () => {
    if (!indexStatus) {
      return "索引状态获取中...";
    }

    if (!indexStatus.ready) {
      return "全文索引尚未建立，当前使用逐条扫描，建议先建立索引以提升搜索速度。";
    }

    let extra = "";
    if (indexStatus.lastBuiltAt) {
      const date = new Date(indexStatus.lastBuiltAt * 1000);
      extra = `，更新于 ${date.toLocaleString()}`;
    }
    return `全文索引已建立，共 ${indexStatus.total} 篇${extra}`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 搜索栏 */}
      <header className="flex-shrink-0 z-10 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-b motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500">
        <div className="container py-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="搜索剧情名称或内容..."
                className="pr-8"
              />
              {query && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button onClick={handleSearch} disabled={searching || !query.trim()}>
              <Search className="mr-2 h-4 w-4" />
              搜索
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-start gap-3">
            <div className="text-xs text-[hsl(var(--color-muted-foreground))] flex-1 min-w-[12rem]">
              {renderIndexStatusText()}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBuildIndex}
                disabled={buildingIndex}
              >
                {buildingIndex ? "索引建立中..." : indexStatus?.ready ? "重新建立索引" : "建立全文索引"}
              </Button>
              <Button
                variant={debugMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setDebugMode((prev) => !prev);
                  setDebugLogs([]);
                  setDebugExpanded(false);
                }}
              >
                调试日志
              </Button>
            </div>
          </div>
          {indexError && (
            <div className="mt-2 text-xs text-[hsl(var(--color-destructive))]">{indexError}</div>
          )}
          {indexMessage && (
            <div className="mt-2 text-xs text-[hsl(var(--color-muted-foreground))]">{indexMessage}</div>
          )}
          {debugMode && debugLogs.length > 0 && (
            <div className="mt-3 border rounded-lg bg-[hsl(var(--color-muted)/0.1)]">
              <button
                onClick={() => setDebugExpanded((prev) => !prev)}
                className="w-full px-3 py-2 text-xs text-left font-medium flex items-center justify-between"
              >
                <span>调试记录（{debugLogs.length} 条）</span>
                <span>{debugExpanded ? "收起" : "展开"}</span>
              </button>
              {debugExpanded && (
                <div className="max-h-48 overflow-auto border-t text-[11px] leading-relaxed font-mono px-3 py-2 space-y-1">
                  {debugLogs.map((log, index) => (
                    <div key={index}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* 搜索结果 */}
      <main className="flex-1 overflow-hidden">
        <CustomScrollArea
          className="h-full"
          viewportClassName="reader-scroll"
          trackOffsetBottom="calc(4.5rem + env(safe-area-inset-bottom, 0px))"
        >
          <div className="container py-6 pb-24 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700">
            {searching && (
              <div className="text-center text-[hsl(var(--color-muted-foreground))]">搜索中...</div>
            )}

            {!searching && searched && results.length === 0 && (
              <div className="text-center text-[hsl(var(--color-muted-foreground))]">未找到相关剧情</div>
            )}

            {!searching && results.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm text-[hsl(var(--color-muted-foreground))]">
                  找到 {results.length} 个结果
                </div>
                {results.length >= 500 && (
                  <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    已达到显示上限（500 条），建议缩小搜索范围以获得更精确的结果
                  </div>
                )}
                {results.map((result, index) => (
                  <button
                    key={`${result.storyId}-${index}`}
                    onClick={() => openResult(result)}
                    disabled={openingStoryId === result.storyId}
                    className="w-full p-4 rounded-lg border border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-accent))] transition-all duration-200 text-left hover:-translate-y-0.5 motion-safe:animate-in motion-safe:fade-in-0 disabled:opacity-60 disabled:cursor-wait"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <div className="font-medium mb-1">
                      {result.storyName}
                      {openingStoryId === result.storyId && (
                        <span className="ml-2 text-xs text-[hsl(var(--color-muted-foreground))]">
                          打开中...
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[hsl(var(--color-muted-foreground))] mb-2">{result.category}</div>
                    {result.matchedText && (
                      <div className="text-sm text-[hsl(var(--color-muted-foreground))] line-clamp-2">
                        {result.matchedText}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!searching && !searched && (
              <div className="text-center text-[hsl(var(--color-muted-foreground))]">
                输入关键词搜索剧情
              </div>
            )}
          </div>
        </CustomScrollArea>
      </main>
    </div>
  );
}
