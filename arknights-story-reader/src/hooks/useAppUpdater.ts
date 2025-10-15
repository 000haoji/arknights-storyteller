import { useEffect, useRef } from "react";
import { confirm } from "@tauri-apps/api/dialog";

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function useAppUpdater() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || !isTauriEnvironment()) return;
    startedRef.current = true;

    let cancelled = false;

    const runUpdateFlow = async () => {
      try {
        const [{ check }, { relaunch }] = await Promise.all([
          import("@tauri-apps/plugin-updater"),
          import("@tauri-apps/plugin-process"),
        ]);

        const result = await check();
        if (!result || cancelled) {
          return;
        }

        const shouldInstall = await confirm("检测到新版本，是否立即下载并安装更新？", {
          title: "发现更新",
          type: "info",
        });

        if (!shouldInstall || cancelled) {
          console.info("[Updater] 用户取消更新");
          return;
        }

        console.info("[Updater] 开始下载更新", { version: result.version });
        await result.downloadAndInstall((event) => {
          if (cancelled) return;
          switch (event.event) {
            case "Started":
              console.info("[Updater] 已开始下载", event.data);
              break;
            case "Progress":
              console.info("[Updater] 下载进度", event.data);
              break;
            case "Finished":
              console.info("[Updater] 下载完成");
              break;
            default:
              break;
          }
        });

        if (!cancelled) {
          console.info("[Updater] 更新安装完成，准备重启");
          await relaunch();
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof Error && /plugin/i.test(error.message)) {
          console.info("[Updater] 当前平台未启用 updater 插件：", error.message);
          return;
        }
        console.error("[Updater] 自动更新流程失败", error);
      }
    };

    void runUpdateFlow();

    return () => {
      cancelled = true;
    };
  }, []);
}
