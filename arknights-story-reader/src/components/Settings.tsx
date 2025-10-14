import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";

export function Settings() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="flex-shrink-0 z-10 bg-[hsl(var(--color-background)/0.95)] backdrop-blur border-b animate-in fade-in-0 duration-500">
        <div className="container flex items-center h-14">
          <h1 className="text-lg font-semibold">设置</h1>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <CustomScrollArea
          className="h-full"
          viewportClassName="reader-scroll"
          trackOffsetBottom="calc(4.5rem + env(safe-area-inset-bottom, 0px))"
        >
          <div className="container py-6 pb-24 space-y-6 animate-in fade-in-0 duration-700">
            <Card className="animate-in fade-in-0 duration-500">
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

            <Card className="animate-in fade-in-0 duration-500" style={{ animationDelay: "80ms" }}>
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
          </div>
        </CustomScrollArea>
      </main>
    </div>
  );
}
