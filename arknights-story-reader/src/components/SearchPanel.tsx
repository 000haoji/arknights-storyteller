import { useState } from "react";
import { api } from "@/services/api";
import type { SearchResult } from "@/types/story";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";

interface SearchPanelProps {
  onSelectResult: (storyId: string) => void;
}

export function SearchPanel({ onSelectResult }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    try {
      setSearching(true);
      const data = await api.searchStories(query);
      setResults(data);
      setSearched(true);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
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
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 搜索栏 */}
      <header className="flex-shrink-0 z-10 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-b">
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
        </div>
      </header>

      {/* 搜索结果 */}
      <main className="flex-1 overflow-hidden">
        <CustomScrollArea
          className="h-full"
          viewportClassName="reader-scroll"
          trackOffsetBottom="calc(4.5rem + env(safe-area-inset-bottom, 0px))"
        >
          <div className="container py-6 pb-24">
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
                {results.map((result, index) => (
                  <button
                    key={`${result.storyId}-${index}`}
                    onClick={() => onSelectResult(result.storyId)}
                    className="w-full p-4 rounded-lg border border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-accent))] transition-colors text-left"
                  >
                    <div className="font-medium mb-1">{result.storyName}</div>
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
