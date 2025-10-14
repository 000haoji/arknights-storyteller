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
  ChevronLeft,
  ChevronRight,
  ListTree,
  Maximize2,
  Minimize2,
  ScrollText,
  Settings as SettingsIcon,
} from "lucide-react";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { ReaderSettingsPanel } from "@/components/ReaderSettings";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useFullscreen } from "@/hooks/useFullscreen";
import { cn } from "@/lib/utils";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";

interface StoryReaderProps {
  storyPath: string;
  storyName: string;
  onBack: () => void;
}

interface RenderableSegment {
  segment: StorySegment;
  index: number;
}

const SEGMENTS_PER_PAGE = 12;
const BASE_MAX_WIDTH = 768; // px

export function StoryReader({ storyPath, storyName, onBack }: StoryReaderProps) {
  const [content, setContent] = useState<ParsedStoryContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [progressValue, setProgressValue] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const readerRootRef = useRef<HTMLDivElement | null>(null);

  const { settings, updateSettings, resetSettings } = useReaderSettings();
  const { progress, updateProgress } = useReadingProgress(storyPath);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

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
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

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

  useLayoutEffect(() => {
    if (!processedSegments.length) return;

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
  }, [processedSegments, settings.readingMode, progress, totalPages]);

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

  const handleJumpToSegment = useCallback(
    (index: number) => {
    if (!processedSegments.length) return;
    if (settings.readingMode === "scroll") {
      const el = document.querySelector<HTMLElement>(`[data-segment-index="${index}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } else {
        const targetPage = Math.min(Math.floor(index / SEGMENTS_PER_PAGE), totalPages - 1);
        setCurrentPage(targetPage);
      }
      setInsightsOpen(false);
    },
    [processedSegments, settings.readingMode, totalPages]
  );

  const handleScrollToTop = useCallback(() => {
    if (settings.readingMode === "scroll") {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setCurrentPage(0);
    }
  }, [settings.readingMode]);

  const renderSegment = useCallback(
    ({ segment, index }: RenderableSegment, isLast: boolean) => {
      const spacing = isLast ? "0" : readerSpacing;

      if (segment.type === "dialogue") {
        return (
          <div
            key={index}
            data-segment-index={index}
            className="reader-paragraph reader-dialogue"
            style={{ marginBottom: spacing }}
          >
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
            className="reader-narration"
            style={{ marginBottom: spacing }}
          >
            {renderLines(segment.text)}
          </div>
        );
      }

      if (segment.type === "decision") {
        return (
          <div
            key={index}
            data-segment-index={index}
            className="reader-decision"
            style={{ marginBottom: spacing }}
          >
            <div className="reader-decision-title">选择：</div>
            {segment.options.map((option, optionIndex) => (
              <div key={optionIndex} className="reader-decision-option">
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
            className="reader-system"
            style={{ marginBottom: spacing }}
          >
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
            className="reader-subtitle"
            style={{ marginBottom: spacing, textAlign: alignment }}
          >
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
            className="reader-sticker"
            style={{ marginBottom: spacing, textAlign: alignment }}
          >
            {renderLines(segment.text)}
          </div>
        );
      }

      if (segment.type === "header") {
        return (
          <div
            key={index}
            data-segment-index={index}
            className="reader-header"
            style={{ marginBottom: spacing }}
          >
            {segment.title}
          </div>
        );
      }

      return null;
    },
    [readerSpacing, renderLines]
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
      className="h-full flex flex-col overflow-hidden reader-surface"
      data-reader-theme={settings.theme}
    >
      <header className="flex-shrink-0 z-20 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-b">
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
              onClick={() => toggleFullscreen(readerRootRef.current ?? undefined)}
              aria-label={isFullscreen ? "退出全屏" : "进入全屏"}
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
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
        >
          <div className="container py-8 pb-24">
            <div className="reader-content" style={readerContentStyles}>
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

      <div className="fixed bottom-20 right-4 z-40 flex flex-col gap-3">
        <Button
          variant="secondary"
          size="icon"
          onClick={handleScrollToTop}
          aria-label="返回顶部"
        >
          <ScrollText className="h-4 w-4" />
        </Button>
        {settings.readingMode === "scroll" && (
          <div className="rounded-full bg-[hsl(var(--color-background)/0.85)] border px-3 py-1 text-xs shadow-sm text-[hsl(var(--color-foreground))]">
            {progressPercentage}% 已读
          </div>
        )}
      </div>

      {insightsOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setInsightsOpen(false)} />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[hsl(var(--color-background)/0.97)] border-l shadow-xl">
            <div className="h-full flex flex-col overflow-hidden">
              <div className="p-6 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm uppercase tracking-widest text-[hsl(var(--color-muted-foreground))]">
                      Story Guide
                    </div>
                    <h2 className="text-lg font-semibold mt-1">剧情导览</h2>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setInsightsOpen(false)}>
                    <ArrowLeft className="h-5 w-5 rotate-180" />
                  </Button>
                </div>
                <p className="mt-3 text-sm text-[hsl(var(--color-muted-foreground))] leading-relaxed">
                  快速定位关键角色与抉择节点，辅助你以导演视角重温剧情。
                </p>
              </div>

              <CustomScrollArea className="flex-1" viewportClassName="reader-scroll" hideTrackWhenIdle={false}>
                <div className="p-6 space-y-8">
                  <section>
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-[hsl(var(--color-muted-foreground))] mb-3">
                      角色出场
                    </h3>
                    <div className="space-y-2">
                    {insights.characters.length === 0 && (
                      <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
                        暂无角色统计
                      </div>
                    )}
                    {insights.characters.map((character) => (
                      <button
                        key={character.name}
                        onClick={() => handleJumpToSegment(character.firstIndex)}
                        className="w-full flex items-center justify-between rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-card))] px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--color-accent))]"
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
            </div>
          </aside>
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
