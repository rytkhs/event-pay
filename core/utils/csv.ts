/**
 * CSVユーティリティ
 *
 * - Excel 数式インジェクション (=cmd|..., +, -, @ で始まるセル) を防ぐため、
 *   先頭が危険文字の場合は単一引用符 (') を付与してテキスト扱いにする。
 * - ダブルクォートを二重化して RFC4180 形式を維持。
 * - すべてのセルをダブルクォートで囲むことで、カンマ/改行を安全に含められるようにする。
 */

/**
 * Excel が数式とみなす先頭文字
 */
const DANGEROUS_FORMULA_REGEX = /^[=+\-@]/;

/**
 * セル値をサニタイズしてプレーンテキスト化する
 */
function sanitizeCsvCell(value: unknown): string {
  const str = value == null ? "" : String(value);

  // 先頭が危険文字の場合は単一引用符を付ける
  if (DANGEROUS_FORMULA_REGEX.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * CSV 用にダブルクォートエスケープ & サニタイズを行い、
 * RFC4180 準拠のセル文字列を返す。
 */
export function toCsvCell(value: unknown): string {
  const sanitized = sanitizeCsvCell(value);

  // ダブルクォートを "" にエスケープ
  const escaped = sanitized.replace(/"/g, '""');

  return `"${escaped}"`;
}
