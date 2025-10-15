import { useEffect, useRef } from "react";
import { platform } from "@tauri-apps/api/os";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type AndroidUpdateManifest = {
  version: string;
  url: string;
  fileName?: string | null;
};

type AndroidDownloadResponse = {
  status?: string;
  needsPermission?: boolean;
};

async function safeConfirm(message: string) {
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    if (typeof dialog.ask === "function") {
      return await dialog.ask(message, { title: "发现更新" });
    }
  } catch (error) {
    console.info("[Updater] 对话框插件不可用，回退到 window.confirm", error);
  }
  return window.confirm(message);
}

function compareVersions(a: string, b: string): number {
  const normalize = (input: string) => input.trim().replace(/^v/i, "");
  const partsA = normalize(a).split(".");
  const partsB = normalize(b).split(".");
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i += 1) {
    const segmentA = parseInt(partsA[i] ?? "0", 10);
    const segmentB = parseInt(partsB[i] ?? "0", 10);
    if (Number.isNaN(segmentA) || Number.isNaN(segmentB)) {
      return 0;
    }
    if (segmentA > segmentB) return 1;
    if (segmentA < segmentB) return -1;
  }
  return 0;
}

async function fetchAndroidManifest(): Promise<AndroidUpdateManifest | null> {
  const feed = import.meta.env.VITE_ANDROID_UPDATE_FEED as string | undefined;
  if (!feed) {
    console.info("[Updater] 未配置 VITE_ANDROID_UPDATE_FEED，跳过安卓更新检查");
    return null;
  }

  try {
    const response = await fetch(feed, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as AndroidUpdateManifest;
    if (!data?.version || !data?.url) {
      throw new Error("更新 manifest 缺少 version 或 url 字段");
    }
    return data;
  } catch (error) {
    console.error("[Updater] 获取安卓更新信息失败", error);
    return null;
  }
}

export function useAppUpdater() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || !isTauriEnvironment()) return;
    startedRef.current = true;

    let cancelled = false;

    const runUpdateFlow = async () => {
      try {
        const currentPlatform = await platform();
        if (cancelled) return;

        if (currentPlatform === "android") {
          await runAndroidUpdateFlow(cancelled);
        } else {
          await runDesktopUpdateFlow(cancelled);
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

    const runDesktopUpdateFlow = async (isCancelled: boolean) => {
      const [{ check }, { relaunch }] = await Promise.all([
        import("@tauri-apps/plugin-updater"),
        import("@tauri-apps/plugin-process"),
      ]);

      const result = await check();
      if (!result || isCancelled) {
        return;
      }

      const shouldInstall = await safeConfirm("检测到新版本，是否立即下载并安装更新？");
      if (!shouldInstall || isCancelled) {
        console.info("[Updater] 用户取消更新");
        return;
      }

      console.info("[Updater] 开始下载更新", { version: result.version });
      await result.downloadAndInstall((event) => {
        if (isCancelled) return;
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

      if (!isCancelled) {
        console.info("[Updater] 更新安装完成，准备重启");
        await relaunch();
      }
    };

    const runAndroidUpdateFlow = async (isCancelled: boolean) => {
      const manifest = await fetchAndroidManifest();
      if (!manifest || isCancelled) return;

      const currentVersion = await getVersion();
      if (isCancelled) return;

      if (compareVersions(manifest.version, currentVersion) <= 0) {
        console.info("[Updater] 安卓端已是最新版本", { currentVersion, remote: manifest.version });
        return;
      }

      const shouldInstall = await safeConfirm(
        `检测到新版本 ${manifest.version}，是否立即下载安装？`
      );

      if (!shouldInstall || isCancelled) {
        console.info("[Updater] 用户取消安卓更新");
        return;
      }

      console.info("[Updater] 开始下载安卓更新", manifest);
      try {
        const response = (await invoke("plugin:apk-updater|download_and_install", {
          url: manifest.url,
          fileName: manifest.fileName ?? null,
        })) as AndroidDownloadResponse;

        if (isCancelled) return;

        if (response?.needsPermission) {
          console.warn("[Updater] 需要开启未知来源安装权限");
          await invoke("plugin:apk-updater|open_install_permission_settings");
        } else {
          console.info("[Updater] 已触发 APK 安装流程", response);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("[Updater] 下载或安装安卓更新失败", error);
        }
      }
    };

    void runUpdateFlow();

    return () => {
      cancelled = true;
    };
  }, []);
}
