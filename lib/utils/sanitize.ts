/**
 * HTML タグを除去してテキストのみを残すサニタイズ関数
 * XSS攻撃の防止に使用
 */
export function sanitizeHtml(input: string): string {
  if (!input) return '';
  
  // HTMLタグとその内容を除去（scriptタグやstyleタグの内容も含む）
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '');
}

/**
 * イベント説明文の安全な表示用サニタイズ関数
 * 改行は保持し、HTMLタグのみを除去
 */
export function sanitizeEventDescription(description: string): string {
  if (!description) return '';
  
  // HTMLタグとその内容を除去し、改行は保持
  return description
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '');
}