import { useEffect, useState } from "react";
import { api } from "@/services/api";
import type { StoryCategory, StoryEntry } from "@/types/story";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, RefreshCw } from "lucide-react";
import { SyncDialog } from "@/components/SyncDialog";

interface StoryListProps {
  onSelectStory: (story: StoryEntry) => void;
}

export function StoryList({ onSelectStory }: StoryListProps) {
  const [categories, setCategories] = useState<StoryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    console.log("[StoryList] 开始加载剧情分类");
    try {
      setLoading(true);
      setError(null);
      const data = await api.getStoryCategories();
      console.log("[StoryList] 剧情分类加载成功，数量:", data.length);
      setCategories(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "加载失败";
      console.error("[StoryList] 加载剧情分类失败:", errorMsg, err);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncSuccess = async () => {
    console.log("[StoryList] 同步成功回调触发");
    await loadCategories();
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
    <div className="min-h-screen">
      {/* 顶部操作栏 */}
      <header className="sticky top-0 z-10 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-b">
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
      <main className="container py-6 space-y-6">
        {categories.map((category) => (
          <Card key={category.id}>
            <CardHeader>
              <CardTitle>{category.name}</CardTitle>
              <CardDescription>
                {category.type === "chapter" && "主线章节"}
                {category.type === "activity" && "活动剧情"}
                {category.type === "memory" && "追忆集"}
                {category.type === "roguelike" && "肉鸽剧情"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {category.stories.map((story) => (
                  <button
                    key={story.storyId}
                    onClick={() => onSelectStory(story)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-accent))] transition-colors text-left"
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
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
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

