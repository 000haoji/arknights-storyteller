import { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { ParsedStoryContent, StorySegment } from "@/types/story";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight, Settings as SettingsIcon } from "lucide-react";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { ReaderSettingsPanel } from "@/components/ReaderSettings";

interface StoryReaderProps {
  storyPath: string;
  storyName: string;
  onBack: () => void;
}

export function StoryReader({ storyPath, storyName, onBack }: StoryReaderProps) {
  const [content, setContent] = useState<ParsedStoryContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings, updateSettings, resetSettings } = useReaderSettings();
  const SEGMENTS_PER_PAGE = 10;

  useEffect(() => {
    loadStory();
  }, [storyPath]);

  const loadStory = async () => {
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
  };

  const renderSegment = (segment: StorySegment, index: number) => {
    switch (segment.type) {
      case "dialogue":
        return (
          <div key={index} className="reader-paragraph">
            <div className="reader-character-name">{segment.characterName}</div>
            <div className="text-[hsl(var(--color-foreground)/0.9)] leading-relaxed">{segment.text}</div>
          </div>
        );

      case "narration":
        return (
          <div key={index} className="reader-narration">
            {segment.text}
          </div>
        );

      case "decision":
        return (
          <div key={index} className="my-6 space-y-2">
            <div className="text-sm text-[hsl(var(--color-muted-foreground))] mb-2">选择：</div>
            {segment.options.map((option, i) => (
              <div
                key={i}
                className="p-3 border border-[hsl(var(--color-border))] rounded-md bg-[hsl(var(--color-secondary)/0.5)]"
              >
                {option}
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

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

  if (!content || content.segments.length === 0) {
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

  const totalPages = Math.ceil(content.segments.length / SEGMENTS_PER_PAGE);
  const startIndex = currentPage * SEGMENTS_PER_PAGE;
  const endIndex = Math.min(startIndex + SEGMENTS_PER_PAGE, content.segments.length);
  const currentSegments = content.segments.slice(startIndex, endIndex);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 顶部导航栏 */}
      <header className="flex-shrink-0 z-10 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-b">
        <div className="container flex items-center gap-2 h-14">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold truncate flex-1">{storyName}</h1>
          <div className="text-xs text-[hsl(var(--color-muted-foreground))]">
            {currentPage + 1}/{totalPages}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* 阅读内容区域 */}
      <main className="flex-1 overflow-y-auto touch-action-pan-y">
        <div
          className="reader-content pb-20"
          style={{
            fontFamily: settings.fontFamily === "system" ? undefined : settings.fontFamily,
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            letterSpacing: `${settings.letterSpacing}px`,
          }}
        >
          {currentSegments.map((segment, index) => renderSegment(segment, startIndex + index))}
        </div>
      </main>

      {/* 底部翻页按钮 */}
      <footer className="flex-shrink-0 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-t p-4">
        <div className="container flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="flex-1"
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            上一页
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage >= totalPages - 1}
            className="flex-1"
          >
            下一页
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </footer>

      {/* 阅读设置面板 */}
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

