import { useEffect, useState } from "react";
import { api, SyncProgress } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, CheckCircle, AlertCircle } from "lucide-react";

interface SyncDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SyncDialog({ open, onClose, onSuccess }: SyncDialogProps) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [remoteVersion, setRemoteVersion] = useState<string>("");
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);

  useEffect(() => {
    console.log("[SyncDialog] 对话框打开状态变化:", open);
    if (open) {
      console.log("[SyncDialog] 对话框打开，加载版本信息");
      loadVersionInfo();
    }
  }, [open]);

  useEffect(() => {
    console.log("[SyncDialog] 设置进度监听器");
    const unlisten = api.onSyncProgress((p) => {
      console.log("[SyncDialog] 更新进度状态:", p);
      setProgress(p);
    });

    return () => {
      console.log("[SyncDialog] 移除进度监听器");
      unlisten.then((fn) => fn());
    };
  }, []);

  const loadVersionInfo = async () => {
    console.log("[SyncDialog] 开始加载版本信息");
    try {
      const [current, remote, needUpdate] = await Promise.all([
        api.getCurrentVersion(),
        api.getRemoteVersion(),
        api.checkUpdate(),
      ]);
      console.log("[SyncDialog] 版本信息加载完成:", { current, remote, needUpdate });
      setCurrentVersion(current);
      setRemoteVersion(remote);
      setHasUpdate(needUpdate);
    } catch (err) {
      console.error("[SyncDialog] 加载版本信息失败:", err);
    }
  };

  const handleSync = async () => {
    console.log("[SyncDialog] 开始同步");
    try {
      setSyncing(true);
      setError(null);
      setProgress(null);
      console.log("[SyncDialog] 调用 syncData API");
      await api.syncData();
      console.log("[SyncDialog] 同步成功，调用 onSuccess 回调");
      onSuccess();
      console.log("[SyncDialog] 重新加载版本信息");
      await loadVersionInfo();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "同步失败";
      console.error("[SyncDialog] 同步失败:", errorMsg, err);
      setError(errorMsg);
    } finally {
      console.log("[SyncDialog] 同步流程结束，设置 syncing = false");
      setSyncing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            数据同步
          </CardTitle>
          <CardDescription>管理剧情数据版本</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 版本信息 */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-[hsl(var(--color-muted-foreground))]">当前版本</span>
              <span className="text-sm font-mono">{currentVersion || '未安装'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[hsl(var(--color-muted-foreground))]">最新版本</span>
              <span className="text-sm font-mono">{remoteVersion || '未知'}</span>
            </div>
            {hasUpdate && (
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--color-primary))]">
                <AlertCircle className="h-4 w-4" />
                <span>有新版本可用</span>
              </div>
            )}
            {!hasUpdate && currentVersion !== "未安装" && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span>已是最新版本</span>
              </div>
            )}
          </div>

          {/* 进度条 */}
          {progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[hsl(var(--color-muted-foreground))]">{progress.phase}</span>
                <span className="font-mono">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <div className="w-full bg-[hsl(var(--color-secondary))] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[hsl(var(--color-primary))] h-full transition-all duration-300"
                  style={{
                    width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                {progress.message}
              </p>
            </div>
          )}

          {/* 错误信息 */}
          {error && (
            <div className="p-3 bg-[hsl(var(--color-destructive)/0.1)] border border-[hsl(var(--color-destructive))] rounded-md">
              <p className="text-sm text-[hsl(var(--color-destructive))]">{error}</p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                console.log("[SyncDialog] 点击关闭按钮");
                onClose();
              }}
              disabled={syncing}
              className="flex-1"
            >
              关闭
            </Button>
            <Button
              onClick={() => {
                console.log("[SyncDialog] 点击开始同步按钮，syncing:", syncing, "hasUpdate:", hasUpdate, "currentVersion:", currentVersion);
                handleSync();
              }}
              disabled={syncing}
              className="flex-1"
            >
              {syncing ? "同步中..." : (hasUpdate || currentVersion === "未安装") ? "开始同步" : "已是最新"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

