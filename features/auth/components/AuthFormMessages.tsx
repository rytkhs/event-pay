import { ServerActionResult } from "@features/auth/hooks/useAuthForm";

interface AuthFormMessagesProps {
  state: ServerActionResult;
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
      {state.error && (
        <div
          data-testid="error-message"
          className="text-red-600 text-sm bg-red-50 p-3 rounded border border-red-200"
          role="alert"
          aria-live="polite"
        >
          {state.error}
        </div>
      )}

      {/* 成功メッセージ */}
      {state.message && state.success && (
        <div
          data-testid="success-message"
          className="text-green-600 text-sm bg-green-50 p-3 rounded border border-green-200"
          role="status"
          aria-live="polite"
        >
          {state.message}
        </div>
      )}

      {/* 情報メッセージ（成功していないが表示すべきメッセージ） */}
      {state.message && !state.success && !state.error && (
        <div
          className="text-blue-600 text-sm bg-blue-50 p-3 rounded border border-blue-200"
          role="status"
          aria-live="polite"
        >
          {state.message}
        </div>
      )}
    </div>
  );
}
