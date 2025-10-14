import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MutableRefObject } from "react";
import { cn } from "@/lib/utils";

interface CustomScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  viewportClassName?: string;
  viewportRef?: React.Ref<HTMLDivElement>;
  hideTrackWhenIdle?: boolean;
  trackOffsetTop?: number | string;
  trackOffsetBottom?: number | string;
  trackOffsetRight?: number | string;
}

export const CustomScrollArea = forwardRef<HTMLDivElement, CustomScrollAreaProps>(
  function CustomScrollArea(
    {
      className,
      children,
      viewportClassName,
      viewportRef,
      hideTrackWhenIdle = true,
      trackOffsetTop = 0,
      trackOffsetBottom = 0,
      trackOffsetRight = 0,
      style,
      ...rest
    },
    ref
  ) {
    const viewportInnerRef = useRef<HTMLDivElement | null>(null);
    const metricsRef = useRef<{ height: number; top: number }>({ height: 0, top: 0 });
    const hideTimerRef = useRef<number | null>(null);
    const [thumbMetrics, setThumbMetrics] = useState({ height: 0, top: 0 });
    const [trackActive, setTrackActive] = useState(false);

    const assignViewportRef = useCallback(
      (node: HTMLDivElement | null) => {
        viewportInnerRef.current = node;
        if (typeof viewportRef === "function") {
          viewportRef(node);
        } else if (viewportRef && typeof viewportRef === "object") {
          (viewportRef as MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [viewportRef]
    );

    const clearHideTimer = useCallback(() => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }, []);

    const scheduleHide = useCallback(() => {
      if (!hideTrackWhenIdle) return;
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => {
        setTrackActive(false);
        hideTimerRef.current = null;
      }, 700);
    }, [hideTrackWhenIdle, clearHideTimer]);

    const showTrack = useCallback(() => {
      if (metricsRef.current.height <= 0) return;
      setTrackActive(true);
    }, []);

    useEffect(() => {
      const viewport = viewportInnerRef.current;
      if (!viewport) return;

      let frame = 0;

      const updateThumbMetrics = () => {
        const { scrollTop, scrollHeight, clientHeight } = viewport;

        if (scrollHeight <= clientHeight + 1) {
          metricsRef.current = { height: 0, top: 0 };
          setThumbMetrics({ height: 0, top: 0 });
          setTrackActive(false);
          return;
        }

        const ratio = clientHeight / scrollHeight;
        const height = Math.max(clientHeight * ratio, 36);
        const maxOffset = clientHeight - height;
        const top =
          maxOffset <= 0 ? 0 : (scrollTop / (scrollHeight - clientHeight)) * maxOffset;

        const nextMetrics = { height, top };
        metricsRef.current = nextMetrics;
        setThumbMetrics(nextMetrics);
        setTrackActive(true);
        scheduleHide();
      };

      const handleScroll = () => {
        showTrack();
        clearHideTimer();
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(updateThumbMetrics);
      };

      updateThumbMetrics();

      viewport.addEventListener("scroll", handleScroll, { passive: true });

      const resizeObserver = new ResizeObserver(() => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(updateThumbMetrics);
      });

      resizeObserver.observe(viewport);

      const mutationObserver = new MutationObserver(() => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(updateThumbMetrics);
      });

      mutationObserver.observe(viewport, { childList: true, subtree: true, characterData: false });

      return () => {
        viewport.removeEventListener("scroll", handleScroll);
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        if (frame) cancelAnimationFrame(frame);
        clearHideTimer();
      };
    }, [clearHideTimer, scheduleHide, showTrack]);

    const handlePointerEnter = useCallback(() => {
      clearHideTimer();
      showTrack();
    }, [clearHideTimer, showTrack]);

    const handlePointerLeave = useCallback(() => {
      scheduleHide();
    }, [scheduleHide]);

    const shouldShowTrack = useMemo(
      () => trackActive && thumbMetrics.height > 0,
      [trackActive, thumbMetrics.height]
    );

    const formatOffset = useCallback((value: number | string) => {
      return typeof value === "number" ? `${value}px` : value;
    }, []);

    const mergedStyle = useMemo<CSSProperties>(() => {
      return {
        ...(style as CSSProperties),
        ["--scroll-area-track-offset-top" as const]: formatOffset(trackOffsetTop),
        ["--scroll-area-track-offset-bottom" as const]: formatOffset(trackOffsetBottom),
        ["--scroll-area-track-offset-right" as const]: formatOffset(trackOffsetRight),
      };
    }, [formatOffset, style, trackOffsetBottom, trackOffsetRight, trackOffsetTop]);

    return (
      <div
        ref={ref}
        className={cn("scroll-area", className)}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        style={mergedStyle}
        {...rest}
      >
        <div
          ref={assignViewportRef}
          className={cn("scroll-area__viewport", viewportClassName)}
        >
          {children}
        </div>
        <div className="scroll-area__track" data-visible={shouldShowTrack}>
          <div
            className="scroll-area__thumb"
            style={{
              height: `${thumbMetrics.height}px`,
              transform: `translateY(${thumbMetrics.top}px)`,
            }}
          />
        </div>
      </div>
    );
  }
);
