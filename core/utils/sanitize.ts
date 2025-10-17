import sanitizeHtml from "sanitize-html";

// EventPay特化のサニタイズ設定（すべてのHTMLタグを除去）
const EVENTPAY_SANITIZE_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

// イベント説明文用設定（改行のみ許可）
const EVENTPAY_DESCRIPTION_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: ["br"],
  allowedAttributes: {},
};

/**
 * 危険な可能性のあるプロトコル文字列を除去する
 * @param text
 * @returns
 */
function removeDangerousProtocols(text: string): string {
  // javascript:, vbscript:, data: などの危険なプロトコルを先頭から除去
  // 安全性を優先し、意図しないマッチの可能性よりも確実なブロックを重視する
  return text.replace(/^\s*(javascript|vbscript|data):/i, "");
}

/**
 * EventPay統一サニタイズ関数
 * 決済・個人情報を扱うアプリケーション向けの厳格なXSS対策
 * すべてのHTMLタグを除去してテキストのみを残す
 */
export function sanitizeForEventPay(input: string | null | undefined): string {
  if (!input) return "";

  const sanitized = sanitizeHtml(input, EVENTPAY_SANITIZE_CONFIG);
  return removeDangerousProtocols(sanitized);
}

/**
 * イベント説明文の安全な表示用サニタイズ関数
 * 改行タグのみを許可し、その他のHTMLタグを除去
 */
export function sanitizeEventDescription(description: string | null | undefined): string {
  if (!description) return "";

  const sanitized = sanitizeHtml(description, EVENTPAY_DESCRIPTION_CONFIG);
  return removeDangerousProtocols(sanitized);
}
