import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Settings() {
  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-10 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-b">
        <div className="container flex items-center h-14">
          <h1 className="text-lg font-semibold">设置</h1>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>外观</CardTitle>
            <CardDescription>自定义应用的显示效果</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">主题</div>
                <div className="text-sm text-[hsl(var(--color-muted-foreground))]">切换亮色/暗色模式</div>
              </div>
              <ThemeToggle />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>关于</CardTitle>
            <CardDescription>应用信息</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-[hsl(var(--color-muted-foreground))]">版本</span>
              <span>1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[hsl(var(--color-muted-foreground))]">数据来源</span>
              <span className="text-sm">ArknightsGameData</span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

