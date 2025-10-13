import { useState, useEffect } from "react";

export function TauriCheck({ children }: { children: React.ReactNode }) {
  const [isTauriAvailable, setIsTauriAvailable] = useState<boolean | null>(null);
  const [checkCount, setCheckCount] = useState(0);

  useEffect(() => {
    const checkTauri = () => {
      // 检查多种可能的 Tauri API 位置
      const hasTauri = !!(
        (window as any).__TAURI__ || 
        (window as any).__TAURI_INTERNALS__ ||
        (window as any).__TAURI_INVOKE__
      );
      
      console.log('[TauriCheck] 检测 Tauri 可用性:', hasTauri);
      console.log('[TauriCheck] window.__TAURI__:', typeof (window as any).__TAURI__);
      
      setIsTauriAvailable(hasTauri);
      setCheckCount(prev => prev + 1);
    };

    // 立即检查一次
    checkTauri();

    // 如果第一次检查失败，延迟再检查几次（给 Tauri 初始化时间）
    if (checkCount < 3) {
      const timer = setTimeout(checkTauri, 500);
      return () => clearTimeout(timer);
    }
  }, [checkCount]);

  // 加载中状态
  if (isTauriAvailable === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-2xl mb-4">⏳</div>
          <p className="text-[hsl(var(--color-muted-foreground))]">正在初始化...</p>
        </div>
      </div>
    );
  }

  if (!isTauriAvailable) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="max-w-md p-8 text-center space-y-4">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-[hsl(var(--color-destructive))]">
            Tauri 未启动
          </h1>
          <p className="text-[hsl(var(--color-muted-foreground))]">
            此应用需要在 Tauri 环境中运行
          </p>
          <div className="bg-[hsl(var(--color-secondary))] p-4 rounded-lg text-left">
            <p className="font-semibold mb-2">正确的启动方式：</p>
            <code className="block bg-black/20 p-2 rounded text-sm font-mono">
              npm run tauri dev
            </code>
          </div>
          <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
            检测次数: {checkCount} | 如果已经运行该命令，请刷新页面
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[hsl(var(--color-primary))] text-[hsl(var(--color-primary-foreground))] rounded-md"
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

