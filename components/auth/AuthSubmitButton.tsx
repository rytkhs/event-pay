import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface AuthSubmitButtonProps {
  children: ReactNode;
  isPending: boolean;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
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
}: AuthSubmitButtonProps) {
  return (
    <Button
      type="submit"
      disabled={isPending}
      variant={variant}
      size={size}
      className={`w-full ${className}`}
      aria-describedby={isPending ? "loading-description" : undefined}
    >
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span id="loading-description">処理中...</span>
        </>
      ) : (
        children
      )}
    </Button>
  );
}
