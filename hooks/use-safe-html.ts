import { useMemo } from 'react';
import { sanitizeForEventPay, sanitizeEventDescription } from '@/lib/utils/sanitize';

interface UseSafeHTMLOptions {
  preserveLineBreaks?: boolean;
}

/**
 * 型安全なHTMLサニタイズフック
 * EventPay特化のDOMPurify設定を使用してXSS攻撃を防ぎます
 */
export function useSafeHTML(
  unsafeHTML: string,
  options: UseSafeHTMLOptions = {}
) {
  return useMemo(() => {
    if (!unsafeHTML) return { __html: '' };

    const sanitizer = options.preserveLineBreaks
      ? sanitizeEventDescription
      : sanitizeForEventPay;

    return { __html: sanitizer(unsafeHTML) };
  }, [unsafeHTML, options.preserveLineBreaks]);
}

/**
 * イベントタイトル用のサニタイズフック
 * 最も厳格なサニタイズを適用します
 */
export function useSafeEventTitle(title: string) {
  return useMemo(() => {
    return sanitizeForEventPay(title);
  }, [title]);
}

/**
 * イベント場所用のサニタイズフック
 * 最も厳格なサニタイズを適用します
 */
export function useSafeEventLocation(location: string) {
  return useMemo(() => {
    return sanitizeForEventPay(location || '');
  }, [location]);
}

/**
 * イベント説明用のサニタイズフック
 * 改行タグを許可したサニタイズを適用します
 */
export function useSafeEventDescription(description: string) {
  return useMemo(() => {
    return { __html: sanitizeEventDescription(description) };
  }, [description]);
}
