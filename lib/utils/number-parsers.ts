/**
 * 数値変換のユーティリティ関数
 */

// 数値変換のヘルパー関数（型安全）
export const safeParseNumber = (value: string, defaultValue: number = 0): number => {
  if (!value || value.trim() === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

// capacity専用のパーサー（null/0の明確な分離）
export const parseCapacity = (value: string): number | null => {
  if (!value || value.trim() === "") return null; // 空文字はnull（制限なし）
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 10000 ? parsed : null;
};

// 参加費専用のパーサー（0円を明確に区別）
export const parseFee = (value: string): number => {
  if (!value || value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
