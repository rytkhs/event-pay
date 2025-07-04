import React from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion, useIsMobile } from "@/lib/hooks/useMediaQuery";

interface SkeletonLoaderProps {
  width?: string | number;
  height?: string | number;
  variant?: "text" | "image" | "button" | "card";
  animate?: boolean;
  responsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  "data-testid"?: string;
}

/**
 * 汎用的なスケルトンローダーコンポーネント
 * 複数のバリアントとサイズに対応
 */
export function SkeletonLoader({
  width = "100%",
  height = "20px",
  variant = "text",
  animate = true,
  responsive = false,
  className,
  style,
  "data-testid": testId,
}: SkeletonLoaderProps) {
  // reduce-motionの検出（最適化済み）
  const prefersReducedMotion = useReducedMotion();

  // モバイル画面の検出（最適化済み）
  const isMobile = useIsMobile();

  // 負の値をデフォルト値に修正
  const safeWidth = typeof width === "number" && width < 0 ? "100%" : width;
  const safeHeight = typeof height === "number" && height < 0 ? "20px" : height;

  const baseClasses = "skeleton-loader";
  const variantClasses = {
    text: "skeleton-loader--text",
    image: "skeleton-loader--image",
    button: "skeleton-loader--button",
    card: "skeleton-loader--card",
  };

  const classes = cn(
    baseClasses,
    {
      "skeleton-loader--animated": animate,
      "skeleton-loader--reduced-motion": prefersReducedMotion,
      "skeleton-loader--responsive": responsive,
      "skeleton-loader--mobile": responsive && isMobile,
      "skeleton-loader--desktop": responsive && !isMobile,
    },
    variantClasses[variant] || variantClasses.text,
    className
  );

  const styles: React.CSSProperties = {
    width: typeof safeWidth === "number" ? `${safeWidth}px` : safeWidth,
    height: typeof safeHeight === "number" ? `${safeHeight}px` : safeHeight,
    backgroundColor: "#e5e7eb",
    borderRadius: "4px",
    transform: "translateZ(0)", // GPUアクセラレーション
    willChange: "transform",
    ...style,
  };

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={classes}
      style={styles}
      data-testid={testId}
    />
  );
}
