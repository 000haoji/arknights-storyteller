import { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { StoryEntry } from "@/types/story";
import { Button } from "@/components/ui/button";
import { BookOpen, RefreshCw } from "lucide-react";
import { SyncDialog } from "@/components/SyncDialog";

interface StoryListProps {
  onSelectStory: (story: StoryEntry) => void;
}

export function StoryList({ onSelectStory }: StoryListProps) {
  const [mainStories, setMainStories] = useState<StoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'main' | 'activity' | 'memory'>('main');
  const [activityStories, setActivityStories] = useState<StoryEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [memoryStories, setMemoryStories] = useState<StoryEntry[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryLoaded, setMemoryLoaded] = useState(false);

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

      const categories = await withTimeout(api.getStoryCategories());
      const mainCategory = categories.find((c) => c.category_type === "chapter");
      const stories = mainCategory?.stories ?? [];
      console.log("[StoryList] 主线剧情加载完成 数量:", stories.length);
      setMainStories(stories);
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

      const data = await withTimeout(api.getActivityStories());
      console.log("[StoryList] 活动剧情加载成功，数量:", data.length);
      setActivityStories(data);
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
      {/* 顶部操作栏 */}
      <header className="flex-shrink-0 z-10 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-b">
        <div className="container flex items-center justify-between h-14">
          <h1 className="text-lg font-semibold">明日方舟剧情</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              console.log("[StoryList] 点击同步按钮，打开对话框");
              setSyncDialogOpen(true);
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            同步
          </Button>
        </div>
      </header>

      {/* 分类列表 */}
      <main className="flex-1 overflow-y-auto">
        <div className="container py-6 space-y-6">
        <div className="grid gap-4">
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
          {activeCategory === 'main' && (
            mainStories.length > 0 ? (
              mainStories.map((story) => (
                <StoryItem key={story.storyId} story={story} onSelectStory={onSelectStory} />
              ))
            ) : (
              <EmptyState message="暂无主线剧情，可能需要同步。" />
            )
          )}

          {activeCategory === 'activity' && (
            <div className="space-y-2">
              {activityLoading && (
                <EmptyState message="活动剧情加载中..." />
              )}
              {!activityLoading && activityStories.length === 0 && (
                <EmptyState message="暂无活动剧情或需要同步" />
              )}
              {!activityLoading && activityStories.map((story) => (
                <StoryItem key={story.storyId} story={story} onSelectStory={onSelectStory} />
              ))}
            </div>
          )}
        </div>
        </div>
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
      className={`text-left rounded-xl border transition-colors p-6 shadow-sm hover:shadow ${
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

function StoryItem({
  story,
  onSelectStory,
}: {
  story: StoryEntry;
  onSelectStory: (story: StoryEntry) => void;
}) {
  return (
    <button
      onClick={() => onSelectStory(story)}
      className="w-full flex items-center gap-3 p-3 rounded-lg border border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-accent))] transition-colors text-left"
    >
      <BookOpen className="h-4 w-4 text-[hsl(var(--color-muted-foreground))] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{story.storyName}</div>
        {story.avgTag && (
          <div className="text-xs text-[hsl(var(--color-muted-foreground))]">{story.avgTag}</div>
        )}
      </div>
      {story.storyCode && (
        <div className="text-xs text-[hsl(var(--color-muted-foreground))] flex-shrink-0">
          {story.storyCode}
        </div>
      )}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="text-[hsl(var(--color-muted-foreground))]">{message}</div>;
}

