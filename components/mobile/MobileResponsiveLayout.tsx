import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useViewportSize } from "@/lib/hooks/useViewportSize";
import { cn } from "@/lib/utils";

interface MobileResponsiveLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const MobileResponsiveLayout: React.FC<MobileResponsiveLayoutProps> = ({
  children,
  className,
}) => {
  const { orientation, breakpoint, isMobile, isTablet, isDesktop } = useViewportSize();
  const [isKeyboardActive, setIsKeyboardActive] = useState(false);
  const initialHeightRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      initialHeightRef.current = window.innerHeight;
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;

      const heightDiff = initialHeightRef.current - window.innerHeight;
      if (heightDiff > 150) {
        setIsKeyboardActive(true);
      } else {
        setIsKeyboardActive(false);
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const layoutClasses = useMemo(() => {
    const baseClasses = [
      "mobile-responsive-layout",
      "w-full",
      "h-full",
      "transition-all",
      "duration-300",
      "ease-in-out",
    ];

    if (isMobile) {
      baseClasses.push(
        "mobile-layout",
        "flex",
        "flex-col",
        "mobile-flex-layout",
        "overflow-y-auto",
        "overflow-x-hidden",
        orientation === "portrait" ? "portrait-layout" : "landscape-layout"
      );
    } else if (isTablet) {
      baseClasses.push(
        "tablet-layout",
        "tablet-grid-layout",
        "grid",
        "grid-cols-1",
        "md:grid-cols-2",
        "lg:grid-cols-3",
        "gap-4",
        "overflow-y-auto",
        "overflow-x-hidden",
        orientation === "portrait" ? "portrait-layout" : "landscape-layout"
      );
    } else if (isDesktop) {
      baseClasses.push(
        "desktop-layout",
        "desktop-grid-layout",
        "grid",
        "grid-cols-1",
        "lg:grid-cols-2",
        "xl:grid-cols-3",
        "gap-6",
        "overflow-y-auto",
        "overflow-x-hidden"
      );
    }

    if (isKeyboardActive) {
      baseClasses.push("keyboard-active");
    }

    return cn(baseClasses, className);
  }, [isMobile, isTablet, isDesktop, orientation, isKeyboardActive, className]);

  const testId = useMemo(() => {
    if (isMobile) return "mobile-layout";
    if (isTablet) return "tablet-layout";
    if (isDesktop) return "desktop-layout";
    return "responsive-layout";
  }, [isMobile, isTablet, isDesktop]);

  const enhanceChild = useCallback(
    (child: React.ReactElement) => {
      const childProps: Record<string, unknown> = { ...child.props };

      // ブレークポイント関連のクラスを子要素に追加
      if (child.props["data-testid"]) {
        const childTestId = child.props["data-testid"];
        if (
          childTestId.includes("content") ||
          childTestId.includes("container") ||
          childTestId.includes("flex") ||
          childTestId.includes("grid")
        ) {
          childProps.className = cn(
            child.props.className,
            `breakpoint-${breakpoint}`,
            isMobile && "mobile-flex-layout",
            isTablet && "tablet-grid-layout",
            isDesktop && "desktop-grid-layout"
          );
        }
      }

      // ボタン要素にタッチターゲットサイズを適用
      if (child.type === "button" && child.props["data-testid"] === "touch-button") {
        const minWidth = isMobile ? "44px" : isTablet ? "36px" : "32px";
        const minHeight = isMobile ? "44px" : isTablet ? "36px" : "32px";

        childProps.style = {
          ...child.props.style,
          minWidth,
          minHeight,
        };
      }

      // インプット要素にモバイル対応クラスを追加
      if (child.type === "input" && child.props["data-testid"] === "mobile-input") {
        childProps.className = cn(child.props.className, "mobile-input-optimized");
      }

      return React.cloneElement(child, childProps);
    },
    [breakpoint, isMobile, isTablet, isDesktop]
  );

  const clonedChildren = useMemo(() => {
    return React.Children.map(children, (child) => {
      if (React.isValidElement(child)) {
        return enhanceChild(child);
      }
      return child;
    });
  }, [children, enhanceChild]);

  const ariaLabel = useMemo(() => {
    if (isMobile) return "モバイルレイアウト";
    if (isTablet) return "タブレットレイアウト";
    return "デスクトップレイアウト";
  }, [isMobile, isTablet]);

  return (
    <div data-testid={testId} className={layoutClasses} role="main" aria-label={ariaLabel}>
      {clonedChildren}
    </div>
  );
};
