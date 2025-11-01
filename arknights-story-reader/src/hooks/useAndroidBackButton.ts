import { useEffect } from "react";

/**
 * Android 返回键监听 hook
 * Tauri 2 会将 Android 返回键映射到 window.history.back()，
 * 但我们添加额外的监听层以确保与应用的 history 栈正确对齐
 */
export function useAndroidBackButton(onBack?: () => void) {
  useEffect(() => {
    // 检测是否在 Android Tauri 环境
    const isAndroid =
      typeof navigator !== "undefined" &&
      /Android/i.test(navigator.userAgent ?? "") &&
      "__TAURI_INTERNALS__" in window;

    if (!isAndroid || !onBack) return;

    // Tauri 在 Android 上会触发 popstate 事件
    // 我们已经在 App.tsx 中处理了 popstate，这里不需要重复监听
    // 但可以添加额外的保护层，监听自定义事件（如果有插件支持）

    // 暂时保留为占位，未来可扩展为监听原生 backbutton 事件
    const handleBackButton = (event: Event) => {
      event.preventDefault();
      onBack();
    };

    // 注意：标准 Tauri 没有直接的 backbutton 事件
    // 返回键通过 history API 处理，已在 App.tsx 的 popstate 监听中覆盖
    window.addEventListener("android-backbutton", handleBackButton as EventListener);

    return () => {
      window.removeEventListener("android-backbutton", handleBackButton as EventListener);
    };
  }, [onBack]);
}

