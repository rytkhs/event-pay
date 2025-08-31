"use client";

import { ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@core/utils";
import { useReducedMotion, useIsMobile } from "@core/hooks/useMediaQuery";

interface AuthSubmitButtonProps {
  children: ReactNode;
  isPending: boolean;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  disabled?: boolean;
  // 新機能
  loadingVariant?: "spinner" | "dots" | "pulse";
  showProgress?: boolean;
  progress?: number;
  showProgressText?: boolean;
  estimatedTimeRemaining?: number;
  loadingText?: string;
  canCancel?: boolean;
  onCancel?: () => void;
  timeoutMs?: number;
  showTimeoutCountdown?: boolean;
  onTimeout?: () => void;
  responsive?: boolean;
}

/**
 * 認証フォーム用送信ボタンコンポーネント
 * ローディング状態の表示と二重送信防止機能を提供
 * 追加機能: プログレス表示、キャンセル機能、タイムアウト処理
 */
export function AuthSubmitButton({
  children,
  isPending,
  className = "",
  variant = "default",
  size = "default",
  disabled = false,
  loadingVariant = "spinner",
  showProgress = false,
  progress = 0,
  showProgressText = false,
  estimatedTimeRemaining,
  loadingText = "処理中...",
  canCancel = false,
  onCancel,
  timeoutMs,
  showTimeoutCountdown = false,
  onTimeout,
  responsive = false,
}: AuthSubmitButtonProps) {
  const [timeoutCountdown, setTimeoutCountdown] = useState<number | null>(null);

  // タイムアウトカウントダウン
  useEffect(() => {
    if (isPending && timeoutMs && showTimeoutCountdown) {
      setTimeoutCountdown(Math.floor(timeoutMs / 1000));

      const interval = setInterval(() => {
        setTimeoutCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setTimeoutCountdown(null);
    }
  }, [isPending, timeoutMs, showTimeoutCountdown]);

  // タイムアウト処理
  useEffect(() => {
    if (isPending && timeoutMs && onTimeout) {
      const timeout = setTimeout(() => {
        onTimeout();
      }, timeoutMs);

      return () => clearTimeout(timeout);
    }
  }, [isPending, timeoutMs, onTimeout]);

  // reduce-motionの検出
  const prefersReducedMotion = useReducedMotion();

  // モバイル画面の検出
  const isMobile = useIsMobile();

  const safeProgress = Math.max(0, Math.min(100, progress || 0));
  const safeLoadingVariant = ["spinner", "dots", "pulse"].includes(loadingVariant)
    ? loadingVariant
    : "spinner";

  const buttonClasses = cn(
    `w-full h-12 min-h-12`,
    {
      [`auth-submit-button--${safeLoadingVariant}`]: isPending,
      "auth-submit-button--reduced-motion": prefersReducedMotion,
      "auth-submit-button--mobile": responsive && isMobile,
      "auth-submit-button--desktop": responsive && !isMobile,
    },
    className
  );

  const descriptionId = isPending ? "auth-submit-description" : undefined;
  const progressDescription =
    showProgress && typeof progress === "number"
      ? `${loadingText}進捗: ${safeProgress}%`
      : loadingText;

  return (
    <div className="relative">
      <Button
        type="submit"
        disabled={isPending || disabled}
        variant={variant}
        size={size}
        className={buttonClasses}
        aria-describedby={descriptionId}
        aria-busy={isPending}
        aria-live="polite"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" role="status" aria-hidden="true" />
            <span>{loadingText}</span>
          </>
        ) : (
          children
        )}
      </Button>

      {/* プログレスバー */}
      {isPending && showProgress && (
        <div
          role="progressbar"
          aria-valuenow={safeProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300"
          style={{ width: `${safeProgress}%` }}
        />
      )}

      {/* プログレステキスト */}
      {isPending && showProgress && showProgressText && (
        <span className="absolute top-0 right-0 text-xs text-gray-500">{safeProgress}%</span>
      )}

      {/* 推定残り時間 */}
      {isPending && estimatedTimeRemaining && (
        <span className="absolute top-0 right-0 text-xs text-gray-500">
          残り約{estimatedTimeRemaining}秒
        </span>
      )}

      {/* タイムアウトカウントダウン */}
      {isPending && timeoutCountdown && (
        <span className="absolute top-0 left-0 text-xs text-gray-500">
          タイムアウトまで{timeoutCountdown}秒
        </span>
      )}

      {/* キャンセルボタン */}
      {isPending && canCancel && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="absolute top-0 right-0 ml-2"
          aria-label="処理をキャンセルする"
          tabIndex={0}
        >
          キャンセル
        </Button>
      )}

      {/* アクセシビリティ用の説明 */}
      {isPending && (
        <span id={descriptionId} className="sr-only">
          {progressDescription}
        </span>
      )}
    </div>
  );
}
