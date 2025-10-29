import { useEffect, useRef } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type RuntimePlatform = "desktop" | "android" | "unknown";

export function detectRuntimePlatform(): RuntimePlatform {
  if (!isTauriEnvironment()) return "unknown";
  if (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent ?? "")) {
    return "android";
  }
  return "desktop";
}

type PluginUpdaterModule = typeof import("@tauri-apps/plugin-updater");
type PluginUpdateHandle = Awaited<ReturnType<PluginUpdaterModule["check"]>>;

export type AndroidUpdateManifest = {
  version: string;
  url: string;
  fileName?: string | null;
  notes?: string | null;
  githubReleaseUrl?: string | null;
};

export interface DesktopUpdateAvailable {
  platform: "desktop";
  currentVersion: string;
  availableVersion: string;
  notes?: string | null;
  releaseDate?: string | null;
  handle: NonNullable<PluginUpdateHandle>;
}

export interface AndroidUpdateAvailable {
  platform: "android";
  currentVersion: string;
  manifest: AndroidUpdateManifest;
}

export type UpdateAvailability = DesktopUpdateAvailable | AndroidUpdateAvailable;

export type AndroidInstallResponse = {
  status?: string;
  needsPermission?: boolean;
};

export class UpdateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "UpdateError";
  }
}

const enum CompareResult {
  Greater = 1,
  Equals = 0,
  Less = -1,
}

export function compareVersions(a: string, b: string): CompareResult {
  const normalize = (input: string) => input.trim().replace(/^v/i, "");
  const partsA = normalize(a).split(".");
  const partsB = normalize(b).split(".");
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i += 1) {
    const segmentA = parseInt(partsA[i] ?? "0", 10);
    const segmentB = parseInt(partsB[i] ?? "0", 10);
    if (Number.isNaN(segmentA) || Number.isNaN(segmentB)) {
      return CompareResult.Equals;
    }
    if (segmentA > segmentB) return CompareResult.Greater;
    if (segmentA < segmentB) return CompareResult.Less;
  }
  return CompareResult.Equals;
}

type ManifestOptions = {
  suppressErrors?: boolean;
};

async function tryFetchAnnouncements(version: string): Promise<string | null> {
  try {
    const url = (import.meta.env.VITE_ANDROID_ANNOUNCEMENTS_URL as string | undefined) ?? "";
    if (!url) return null;
    const res = await fetch(url, { cache: "no-store", redirect: "follow" as const, mode: "cors" as const });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, string> | { entries?: Record<string, string> };
    const map: Record<string, string> = (data as any)?.entries ?? (data as any);
    const note = map?.[version];
    return typeof note === "string" && note.trim().length > 0 ? note : null;
  } catch {
    return null;
  }
}

function toManifestFromGithubLatestRelease(json: any): AndroidUpdateManifest | null {
  if (!json || typeof json !== "object") return null;
  const tag: string | undefined = json.tag_name;
  const assets: Array<any> | undefined = json.assets;
  const htmlUrl: string | undefined = json.html_url;
  if (!tag || !Array.isArray(assets)) return null;

  // Derive version from tag, e.g. "app-v1.10.5" -> "1.10.5"
  const normalizedVersion = String(tag).replace(/^app-v/i, "").replace(/^v/i, "").trim();

  // Prefer APK asset by content_type or extension
  const apkAsset =
    assets.find((a) => /android|vnd\.android\.package-archive/i.test(String(a?.content_type ?? ""))) ||
    assets.find((a) => typeof a?.name === "string" && a.name.toLowerCase().endsWith(".apk")) ||
    null;
  if (!apkAsset || !apkAsset.browser_download_url) return null;

  return {
    version: normalizedVersion,
    url: String(apkAsset.browser_download_url),
    fileName: String(apkAsset.name ?? "") || null,
    notes: (json?.body as string | undefined) ?? null,
    githubReleaseUrl: htmlUrl || null,
  };
}

async function fetchAndroidManifest(options: ManifestOptions = {}): Promise<AndroidUpdateManifest | null> {
  const { suppressErrors = false } = options;
  const feed = import.meta.env.VITE_ANDROID_UPDATE_FEED as string | undefined;
  if (!feed) {
    if (!suppressErrors) {
      throw new UpdateError("MISSING_FEED", "未配置安卓更新源 VITE_ANDROID_UPDATE_FEED");
    }
    console.info("[Updater] 未配置 VITE_ANDROID_UPDATE_FEED，跳过安卓更新检查");
    return null;
  }

  try {
    const response = await fetch(feed, { cache: "no-store", redirect: "follow" as const, mode: "cors" as const });
    if (!response.ok) {
      throw new UpdateError("HTTP_ERROR", `更新源返回错误 HTTP ${response.status}`);
    }
    const raw = await response.json();
    // Path 1: Our custom manifest shape
    if (raw && typeof raw === "object" && "version" in raw && "url" in raw) {
      const data = raw as AndroidUpdateManifest;
      if (!data?.version || !data?.url) {
        throw new UpdateError("INVALID_MANIFEST", "更新 manifest 缺少 version 或 url 字段");
      }
      // Attach announcement notes if available
      data.notes = data.notes ?? (await tryFetchAnnouncements(data.version));
      return data;
    }
    // Path 2: GitHub releases/latest API shape
    const gh = toManifestFromGithubLatestRelease(raw);
    if (gh) {
      gh.notes = gh.notes ?? (await tryFetchAnnouncements(gh.version));
      return gh;
    }
    throw new UpdateError("UNSUPPORTED_FORMAT", "不支持的更新源格式");
  } catch (error) {
    if (!suppressErrors) {
      if (error instanceof UpdateError) throw error;
      if (error instanceof TypeError) {
        // fetch 网络/CORS 失败通常为 TypeError
        throw new UpdateError("NETWORK_ERROR", error.message || "网络异常，无法获取更新信息");
      }
      throw new UpdateError("UNKNOWN", error instanceof Error ? error.message : String(error));
    }
    console.error("[Updater] 获取安卓更新信息失败", error);
    return null;
  }
}

async function safeConfirm(message: string): Promise<boolean> {
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    if (typeof dialog.confirm === "function") {
      return await dialog.confirm(message, { title: "发现更新", kind: "info" });
    }
    if (typeof dialog.ask === "function") {
      return await dialog.ask(message, { title: "发现更新" });
    }
  } catch (error) {
    console.info("[Updater] 对话框插件不可用，回退到 window.confirm", error);
  }
  return window.confirm(message);
}

export async function checkDesktopUpdate(currentVersionOverride?: string): Promise<DesktopUpdateAvailable | null> {
  const platform = detectRuntimePlatform();
  if (platform !== "desktop") {
    return null;
  }

  const [{ check }] = await Promise.all([import("@tauri-apps/plugin-updater")]);
  const update = await check();
  if (!update) {
    return null;
  }

  const currentVersion = currentVersionOverride ?? (await getVersion());
  return {
    platform: "desktop",
    currentVersion,
    availableVersion: update.version,
    notes: (update as { notes?: string | null }).notes ?? update.body ?? null,
    releaseDate: (update as { date?: string | null }).date ?? null,
    handle: update,
  };
}

export async function installDesktopUpdate(
  update: DesktopUpdateAvailable,
  onProgress?: (event: { event: string; data?: unknown }) => void,
  options: { relaunch?: boolean } = {}
): Promise<void> {
  const { relaunch = true } = options;
  await update.handle.downloadAndInstall((event) => {
    onProgress?.(event);
  });
  if (relaunch) {
    const { relaunch: relaunchApp } = await import("@tauri-apps/plugin-process");
    await relaunchApp();
  }
}

export async function checkAndroidUpdate(currentVersionOverride?: string): Promise<AndroidUpdateAvailable | null> {
  const platform = detectRuntimePlatform();
  if (platform !== "android") {
    return null;
  }

  const manifest = await fetchAndroidManifest();
  const currentVersion = currentVersionOverride ?? (await getVersion());
  if (!manifest) {
    return null;
  }

  if (compareVersions(manifest.version, currentVersion) <= CompareResult.Equals) {
    return null;
  }

  return {
    platform: "android",
    currentVersion,
    manifest,
  };
}

export async function installAndroidUpdate(update: AndroidUpdateAvailable): Promise<AndroidInstallResponse> {
  const methods = [
    {
      name: "Method 1: Plugin Direct",
      fn: () => invoke<AndroidInstallResponse>("android_update_method1_plugin_direct", {
        url: update.manifest.url,
        fileName: update.manifest.fileName ?? null,
      }),
    },
    {
      name: "Method 2: HTTP Download + Intent",
      fn: () => invoke<AndroidInstallResponse>("android_update_method2_http_download", {
        url: update.manifest.url,
        fileName: update.manifest.fileName ?? null,
      }),
    },
    {
      name: "Method 3: Frontend Fetch",
      fn: async () => {
        // Would need fs plugin to write files, skip for now
        throw new Error("Frontend download needs fs plugin (not implemented)");
      },
    },
    {
      name: "Method 4: Download via Browser",
      fn: async () => {
        // Trigger browser download
        const a = document.createElement("a");
        a.href = update.manifest.url;
        a.download = update.manifest.fileName || "update.apk";
        a.click();
        return {
          status: "browser_download_triggered",
          needsPermission: false,
        };
      },
    },
    {
      name: "Method 5: Plugin via old command name",
      fn: () => invoke<AndroidInstallResponse>("plugin:apk-updater|download_and_install", {
        url: update.manifest.url,
        fileName: update.manifest.fileName ?? null,
      }),
    },
  ];

  const errors: Array<{ method: string; error: string }> = [];

  for (const method of methods) {
    try {
      console.info(`[AndroidUpdate] Attempting ${method.name}`);
      const response = await method.fn();
      console.info(`[AndroidUpdate] ${method.name} succeeded`, response);
      return response;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[AndroidUpdate] ${method.name} failed:`, errMsg);
      errors.push({ method: method.name, error: errMsg });
    }
  }

  const summary = errors.map((e) => `${e.method}: ${e.error}`).join("\n");
  throw new Error(`所有更新方法均失败:\n${summary}`);
}

export async function openAndroidInstallPermissionSettings(): Promise<void> {
  try {
    await invoke("android_open_install_permission_settings");
  } catch (err1) {
    console.warn("[AndroidUpdate] Primary settings opener failed, trying plugin direct", err1);
    try {
      await invoke("plugin:apk-updater|open-install-permission-settings");
    } catch (err2) {
      console.error("[AndroidUpdate] All settings opener methods failed", err1, err2);
      throw err2;
    }
  }
}

export interface SaveToDownloadsResponse {
  success: boolean;
  filePath: string;
  message: string;
}

export async function saveApkToDownloads(
  sourceFilePath: string,
  fileName: string
): Promise<SaveToDownloadsResponse> {
  try {
    console.info("[AndroidUpdate] Saving APK to downloads folder:", { sourceFilePath, fileName });
    const response = await invoke<SaveToDownloadsResponse>("android_save_apk_to_downloads", {
      sourceFilePath,
      fileName,
    });
    console.info("[AndroidUpdate] APK saved successfully:", response);
    return response;
  } catch (error) {
    console.error("[AndroidUpdate] Failed to save APK to downloads:", error);
    throw error;
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  try {
    const { open } = await import("@tauri-apps/plugin-opener");
    await open(url);
  } catch (error) {
    console.error("[Updater] Failed to open URL via plugin, falling back to window.open", error);
    window.open(url, "_blank");
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
        const platform = detectRuntimePlatform();
        if (platform === "android") {
          await runAndroidUpdateFlow(cancelled);
        } else if (platform === "desktop") {
          await runDesktopUpdateFlow(cancelled);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[Updater] 自动更新流程失败", error);
        }
      }
    };

    const runDesktopUpdateFlow = async (isCancelled: boolean) => {
      try {
        const updateInfo = await checkDesktopUpdate();
        if (!updateInfo || isCancelled) return;

        const shouldInstall = await safeConfirm(
          `检测到新版本 ${updateInfo.availableVersion}，是否立即下载并安装更新？`
        );
        if (!shouldInstall || isCancelled) {
          console.info("[Updater] 用户取消更新");
          return;
        }

        console.info("[Updater] 开始下载更新", updateInfo);
        await installDesktopUpdate(updateInfo, (event) => {
          if (isCancelled) return;
          console.info("[Updater] 下载事件", event);
        });
      } catch (error) {
        if (!isCancelled) {
          if (error instanceof Error && /plugin/i.test(error.message)) {
            console.info("[Updater] 桌面更新插件不可用：", error.message);
          } else {
            console.error("[Updater] 桌面更新失败", error);
          }
        }
      }
    };

    const runAndroidUpdateFlow = async (isCancelled: boolean) => {
      try {
        const manifest = await fetchAndroidManifest({ suppressErrors: true });
        if (!manifest || isCancelled) return;

        const currentVersion = await getVersion();
        if (isCancelled) return;

        if (compareVersions(manifest.version, currentVersion) <= CompareResult.Equals) {
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

        const response = await installAndroidUpdate({
          platform: "android",
          currentVersion,
          manifest,
        });

        if (isCancelled) return;

        if (response?.needsPermission) {
          console.warn("[Updater] 需要开启未知来源安装权限");
          await openAndroidInstallPermissionSettings();
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
