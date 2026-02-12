"use client";

import { ReactNode, useEffect, useState } from "react";

import { Loader2 } from "lucide-react";

import { cn } from "@core/utils";

import { Button } from "@/components/ui/button";

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

  const safeProgress = Math.max(0, Math.min(100, progress || 0));
  const safeLoadingVariant = ["spinner", "dots", "pulse"].includes(loadingVariant)
    ? loadingVariant
    : "spinner";

  const buttonClasses = cn(
    "w-full",
    responsive
      ? "h-11 min-h-11 px-3 text-sm sm:h-12 sm:min-h-12 sm:px-4 sm:text-base"
      : "h-12 min-h-12",
    className
  );

  const descriptionId = isPending ? "auth-submit-description" : undefined;
  const progressDescription =
    showProgress && typeof progress === "number"
      ? `${loadingText}進捗: ${safeProgress}%`
      : loadingText;
  const loadingIndicator = (() => {
    if (safeLoadingVariant === "dots") {
      return (
        <span className="mr-2 inline-flex items-center gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce motion-reduce:animate-none" />
          <span
            className="h-1.5 w-1.5 rounded-full bg-current animate-bounce motion-reduce:animate-none"
            style={{ animationDelay: "120ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-current animate-bounce motion-reduce:animate-none"
            style={{ animationDelay: "240ms" }}
          />
        </span>
      );
    }

    if (safeLoadingVariant === "pulse") {
      return (
        <span className="mr-2 inline-flex h-4 w-4 items-center justify-center" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-current animate-pulse motion-reduce:animate-none" />
        </span>
      );
    }

    return (
      <Loader2
        className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
    );
  })();

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
            {loadingIndicator}
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
          className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300 motion-reduce:transition-none"
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
