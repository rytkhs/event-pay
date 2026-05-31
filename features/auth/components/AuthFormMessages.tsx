import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription } from "@/components/ui/alert";

interface AuthFormMessagesProps {
  state: ActionResult;
  className?: string;
}

/**
 * 認証フォーム用メッセージ表示コンポーネント
 * エラーメッセージと成功メッセージを統一的に表示
 */
export function AuthFormMessages({ state, className = "" }: AuthFormMessagesProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {/* エラーメッセージ */}
      {!state.success && state.error?.userMessage && (
        <Alert data-testid="error-message" variant="destructive" aria-live="polite">
          <AlertDescription>{state.error.userMessage}</AlertDescription>
        </Alert>
      )}

      {/* 成功メッセージ */}
      {state.success && state.message && (
        <Alert data-testid="success-message" variant="success" role="status" aria-live="polite">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
