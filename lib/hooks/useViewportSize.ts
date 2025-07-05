import { useState, useEffect, useCallback } from "react";

export type DeviceType = "mobile" | "tablet" | "desktop";
export type Orientation = "portrait" | "landscape";
export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
  readonly deviceType: DeviceType;
  readonly orientation: Orientation;
  readonly breakpoint: Breakpoint;
  readonly isMobile: boolean;
  readonly isTablet: boolean;
  readonly isDesktop: boolean;
  readonly isPortrait: boolean;
  readonly isLandscape: boolean;
  readonly isXS: boolean;
  readonly isSM: boolean;
  readonly isMD: boolean;
  readonly isLG: boolean;
  readonly isXL: boolean;
}

const BREAKPOINTS = {
  xs: 320,
  sm: 375,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

const getDeviceType = (width: number): DeviceType => {
  if (width < BREAKPOINTS.md) return "mobile";
  if (width < BREAKPOINTS.lg) return "tablet";
  return "desktop";
};

const getBreakpoint = (width: number): Breakpoint => {
  if (width < BREAKPOINTS.sm) return "xs";
  if (width < BREAKPOINTS.md) return "sm";
  if (width < BREAKPOINTS.lg) return "md";
  if (width < BREAKPOINTS.xl) return "lg";
  return "xl";
};

const createViewportSize = (width: number, height: number): ViewportSize => {
  const deviceType = getDeviceType(width);
  const orientation = width > height ? "landscape" : "portrait";
  const breakpoint = getBreakpoint(width);

  return {
    width,
    height,
    deviceType,
    orientation,
    breakpoint,
    isMobile: deviceType === "mobile",
    isTablet: deviceType === "tablet",
    isDesktop: deviceType === "desktop",
    isPortrait: orientation === "portrait",
    isLandscape: orientation === "landscape",
    isXS: breakpoint === "xs",
    isSM: breakpoint === "sm",
    isMD: breakpoint === "md",
    isLG: breakpoint === "lg",
    isXL: breakpoint === "xl",
  };
};

export const useViewportSize = (): ViewportSize => {
  const [viewportSize, setViewportSize] = useState<ViewportSize>(() => {
    if (typeof window === "undefined") {
      return createViewportSize(1024, 768);
    }
    return createViewportSize(window.innerWidth, window.innerHeight);
  });

  const updateSize = useCallback(() => {
    if (typeof window === "undefined") return;

    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    setViewportSize((prevSize) => {
      if (newWidth !== prevSize.width || newHeight !== prevSize.height) {
        return createViewportSize(newWidth, newHeight);
      }
      return prevSize;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let timeoutId: NodeJS.Timeout;
    let rafId: number;

    const debouncedResize = () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);

      timeoutId = setTimeout(() => {
        rafId = requestAnimationFrame(() => {
          updateSize();
        });
      }, 100);
    };

    // 初期サイズを設定
    updateSize();

    window.addEventListener("resize", debouncedResize, { passive: true });

    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", debouncedResize);
    };
  }, [updateSize]);

  return viewportSize;
};
