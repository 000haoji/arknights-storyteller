import { useCallback, useEffect, useState } from "react";

const canAccessDom = typeof document !== "undefined";

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (!canAccessDom) return false;
    return Boolean(document.fullscreenElement);
  });

  useEffect(() => {
    if (!canAccessDom) return;
    const handleChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const enter = useCallback(async (element?: HTMLElement) => {
    if (!canAccessDom) return;
    const target = element ?? document.documentElement;
    if (!target.requestFullscreen) return;
    try {
      await target.requestFullscreen();
    } catch {
      // ignore
    }
  }, []);

  const exit = useCallback(async () => {
    if (!canAccessDom || !document.fullscreenElement || !document.exitFullscreen) return;
    try {
      await document.exitFullscreen();
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(
    async (element?: HTMLElement) => {
      if (isFullscreen) {
        await exit();
      } else {
        await enter(element);
      }
    },
    [enter, exit, isFullscreen]
  );

  return { isFullscreen, enter, exit, toggle };
}

