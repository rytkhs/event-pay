/**
 * Next.js ナビゲーション（redirect等）が投げる制御例外の検知ユーティリティ
 *
 * 現行のNext.jsでは `error.digest` に "NEXT_REDIRECT" で始まる文字列が格納される。
 * まれに `message === "NEXT_REDIRECT"` の形で来るケースへのフォールバックも保持。
 */
export function isNextRedirectError(err: unknown): boolean {
  try {
    const digest = (err as any)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return true;
    }
    const message = err instanceof Error ? err.message : String(err);
    return message === "NEXT_REDIRECT";
  } catch {
    return false;
  }
}
