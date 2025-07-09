import React from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion, useIsMobile } from "@/lib/hooks/useMediaQuery";
import { LoadingSpinnerProps } from "@/lib/types/loading";
import { validateEnum, validateCSSTime, safeValidate } from "@/lib/utils/validation";

// バリデーション関数（共通ユーティリティを使用）
function validateSpinnerProps(props: LoadingSpinnerProps): void {
  const { size, variant, animationDuration } = props;

  if (size) {
    validateEnum(size, ["sm", "md", "lg"] as const, "size");
  }

  if (variant) {
    validateEnum(variant, ["spinner", "dots", "pulse"] as const, "variant");
  }

  if (animationDuration) {
    validateCSSTime(animationDuration, "animationDuration");
  }
}

/**
 * 汎用的なローディングスピナーコンポーネント
 * 複数のバリアントとサイズに対応
 */
export function LoadingSpinner(props: LoadingSpinnerProps) {
  // プロパティのバリデーション（安全なバリデーション）
  const validatedProps = safeValidate(
    () => {
      validateSpinnerProps(props);
      return props;
    },
    {
      ...props,
      size: "md" as const,
      variant: "spinner" as const,
      animationDuration: "1s",
    }
  );

  const {
    size = "md",
    variant = "spinner",
    className,
    color,
    "aria-label": ariaLabel = "読み込み中",
    "data-testid": dataTestId,
    responsive = false,
    animate = true,
    animationDuration = "1s",
  } = validatedProps;

  // reduce-motionの検出（最適化済み）
  const prefersReducedMotion = useReducedMotion();

  // モバイル画面の検出（最適化済み）
  useIsMobile();

  const baseClasses = "loading-spinner";
  const sizeClasses = {
    sm: "loading-spinner--sm",
    md: "loading-spinner--md",
    lg: "loading-spinner--lg",
  };
  const variantClasses = {
    spinner: "loading-spinner--spinner",
    dots: "loading-spinner--dots",
    pulse: "loading-spinner--pulse",
  };

  const classes = cn(
    baseClasses,
    sizeClasses[size] || sizeClasses.md,
    variantClasses[variant] || variantClasses.spinner,
    {
      "loading-spinner--reduced-motion": prefersReducedMotion,
      "loading-spinner--responsive": responsive,
      "loading-spinner--paused": !animate,
    },
    className
  );

  const styles = {
    color,
    animationDuration: animate ? animationDuration : undefined,
    transform: "translateZ(0)", // GPUアクセラレーション
    ...(!animate && { animationPlayState: "paused" as const }),
  };

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
      aria-busy="true"
      data-testid={dataTestId}
      className={classes}
      style={styles}
    >
      <span className="sr-only">{ariaLabel}</span>
      {variant === "spinner" && (
        <svg
          className="animate-spin h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {variant === "dots" && (
        <div className="flex space-x-1" aria-hidden="true">
          <div
            className="w-2 h-2 bg-current rounded-full animate-bounce"
            style={{ animationDelay: "0s" }}
          />
          <div
            className="w-2 h-2 bg-current rounded-full animate-bounce"
            style={{ animationDelay: "0.1s" }}
          />
          <div
            className="w-2 h-2 bg-current rounded-full animate-bounce"
            style={{ animationDelay: "0.2s" }}
          />
        </div>
      )}
      {variant === "pulse" && (
        <div className="w-6 h-6 bg-current rounded-full animate-pulse" aria-hidden="true" />
      )}
    </div>
  );
}
