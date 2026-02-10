/**
 * 数値変換のユーティリティ関数
 */

// 数値変換のヘルパー関数（型安全）
export const safeParseNumber = (value: string, defaultValue: number = 0): number => {
  if (!value || value.trim() === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

// 参加費専用のパーサー（0円を明確に区別）
export const parseFee = (value: string): number => {
  if (!value || value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
