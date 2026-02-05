import type { ActionResult } from "@core/errors/adapters/server-actions";

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
        <div
          data-testid="error-message"
          className="text-red-600 text-sm bg-red-50 p-3 rounded border border-red-200"
          role="alert"
          aria-live="polite"
        >
          {state.error.userMessage}
        </div>
      )}

      {/* 成功メッセージ */}
      {state.success && state.message && (
        <div
          data-testid="success-message"
          className="text-green-600 text-sm bg-green-50 p-3 rounded border border-green-200"
          role="status"
          aria-live="polite"
        >
          {state.message}
        </div>
      )}
    </div>
  );
}
