"use client";

import { ReactNode } from "react";

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
  loadingText?: string;
}

/**
 * 認証フォーム用送信ボタンコンポーネント
 * ローディング状態の表示と二重送信防止機能を提供
 */
export function AuthSubmitButton({
  children,
  isPending,
  className = "",
  variant = "default",
  size = "default",
  disabled = false,
  loadingText = "処理中...",
}: AuthSubmitButtonProps) {
  const buttonClasses = cn("h-12 min-h-12 w-full", className);

  const descriptionId = isPending ? "auth-submit-description" : undefined;

  return (
    <>
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
            <Loader2
              className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span>{loadingText}</span>
          </>
        ) : (
          children
        )}
      </Button>

      {isPending && (
        <span id={descriptionId} className="sr-only">
          {loadingText}
        </span>
      )}
    </>
  );
}
