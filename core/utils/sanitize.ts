import DOMPurify from "isomorphic-dompurify";

// EventPay特化のDOMPurify設定（すべてのHTMLタグを除去）
const EVENTPAY_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [], // すべてのタグを禁止
  ALLOWED_ATTR: [], // すべての属性を禁止
  KEEP_CONTENT: true, // タグ内のテキストは保持
  REMOVE_SCRIPT_TYPE_ATTR: true,
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "svg", "math"],
  FORBID_ATTR: [
    "style",
    "onerror",
    "onload",
    "onclick",
    "onmouseover",
    "onfocus",
    "onblur",
    "onchange",
    "onsubmit",
    "javascript",
  ],
};

// イベント説明文用設定（改行のみ許可）
const EVENTPAY_DESCRIPTION_CONFIG = {
  ALLOWED_TAGS: ["br"], // 改行タグのみ許可
  ALLOWED_ATTR: [], // すべての属性を禁止
  KEEP_CONTENT: true,
  REMOVE_SCRIPT_TYPE_ATTR: true,
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "svg", "math"],
  FORBID_ATTR: [
    "style",
    "onerror",
    "onload",
    "onclick",
    "onmouseover",
    "onfocus",
    "onblur",
    "onchange",
    "onsubmit",
    "javascript",
  ],
};

/**
 * EventPay統一サニタイズ関数
 * 決済・個人情報を扱うアプリケーション向けの厳格なXSS対策
 * すべてのHTMLタグを除去してテキストのみを残す
 */
export function sanitizeForEventPay(input: string | null | undefined): string {
  if (!input) return "";

  return DOMPurify.sanitize(input, EVENTPAY_SANITIZE_CONFIG);
}

/**
 * イベント説明文の安全な表示用サニタイズ関数
 * 改行タグのみを許可し、その他のHTMLタグを除去
 */
export function sanitizeEventDescription(description: string | null | undefined): string {
  if (!description) return "";

  return DOMPurify.sanitize(description, EVENTPAY_DESCRIPTION_CONFIG);
}
