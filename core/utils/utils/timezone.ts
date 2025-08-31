/**
 * タイムゾーン処理ユーティリティ関数
 *
 * 基本方針:
 * - データベースには常にUTCで保存
 * - 表示時にJSTに変換
 * - datetime-local入力値はJSTとして解釈してUTCに変換
 */

import { parseISO, differenceInCalendarDays } from "date-fns";
import { fromZonedTime, toZonedTime, format } from "date-fns-tz";

const JST_TIMEZONE = "Asia/Tokyo";

/**
 * 日時変換エラーの種類
 */
class DateConversionError extends Error {
  constructor(
    message: string,
    public readonly errorType: "INVALID_FORMAT" | "INVALID_DATE" | "PAST_DATE" | "OUT_OF_RANGE"
  ) {
    super(message);
    this.name = "DateConversionError";
  }
}

/**
 * datetime-local入力値（'2025-07-13T10:00'形式）をJSTとして解釈してUTCに変換
 */
export function convertDatetimeLocalToUtc(datetimeLocalString: string): Date {
  // 基本的なフォーマットチェック
  if (!datetimeLocalString || typeof datetimeLocalString !== "string") {
    throw new DateConversionError("日時が入力されていません", "INVALID_FORMAT");
  }

  // datetime-local形式のチェック（YYYY-MM-DDTHH:mm または YYYY-MM-DDTHH:mm:ss）
  const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
  if (!dateTimePattern.test(datetimeLocalString)) {
    throw new DateConversionError(
      "日時の形式が正しくありません（YYYY-MM-DDTHH:MM形式で入力してください）",
      "INVALID_FORMAT"
    );
  }

  try {
    // 環境依存を避けるため、文字列を明示的にJST付きISO形式に正規化
    const hasSeconds =
      datetimeLocalString.includes(":") && datetimeLocalString.split(":").length === 3;
    const jstIsoString = hasSeconds
      ? `${datetimeLocalString}+09:00`
      : `${datetimeLocalString}:00+09:00`;

    const date = new Date(jstIsoString);

    // 無効な日付チェック
    if (isNaN(date.getTime())) {
      throw new DateConversionError(
        "指定された日時は存在しません（例：2月30日など）",
        "INVALID_DATE"
      );
    }

    // 合理的な範囲チェック（1900年〜2100年）
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) {
      throw new DateConversionError(
        "日時は1900年から2100年の範囲で入力してください",
        "OUT_OF_RANGE"
      );
    }

    return date;
  } catch (error) {
    if (error instanceof DateConversionError) {
      throw error;
    }
    throw new DateConversionError("日時の変換に失敗しました", "INVALID_FORMAT");
  }
}

/**
 * UTC日時をJSTに変換して指定フォーマットで表示
 */
export function formatUtcToJst(
  utcDate: Date | string,
  formatString: string = "yyyy/MM/dd HH:mm"
): string {
  const date = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  const jstDate = toZonedTime(date, JST_TIMEZONE);
  return format(jstDate, formatString, { timeZone: JST_TIMEZONE });
}

/**
 * JST日付文字列（'2025-07-13'形式）をUTC範囲に変換
 */
export function convertJstDateToUtcRange(jstDateString: string): {
  startOfDay: Date;
  endOfDay: Date;
} {
  // JST日付の開始時刻（00:00:00）をUTCに変換
  const startOfDay = fromZonedTime(parseISO(jstDateString + "T00:00:00"), JST_TIMEZONE);

  // JST日付の終了時刻（23:59:59.999）をUTCに変換
  const endOfDay = fromZonedTime(parseISO(jstDateString + "T23:59:59.999"), JST_TIMEZONE);

  return { startOfDay, endOfDay };
}

/**
 * 現在のJST時刻を取得
 */
export function getCurrentJstTime(): Date {
  return toZonedTime(new Date(), JST_TIMEZONE);
}

/**
 * datetime-local入力の最小値を生成（現在時刻+1時間のJST）
 */
export function getMinDatetimeLocal(): string {
  const now = getCurrentJstTime();
  // 1時間後
  now.setHours(now.getHours() + 1);

  // 'YYYY-MM-DDTHH:mm'形式に変換
  return format(now, "yyyy-MM-dd'T'HH:mm", { timeZone: JST_TIMEZONE });
}

/**
 * UTC日時がJSTの現在時刻より未来かどうかを判定
 */
export function isUtcDateFuture(utcDate: Date | string): boolean {
  const date = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  const nowUtc = new Date();
  return date > nowUtc;
}

/**
 * ISO8601日時文字列の妥当性チェック（Zまたはオフセット許容、ミリ秒は1〜6桁許容）
 * 例: 2024-05-01T12:34:56Z / 2024-05-01T12:34:56.000Z / 2024-05-01T12:34:56.123456+09:00
 */
export function isValidIsoDateTimeString(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  // YYYY-MM-DDTHH:mm:ss(.SSS..SSSSSS)?(Z|±HH:MM)
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+\-]\d{2}:\d{2})$/;
  if (!isoRegex.test(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}


/**
 * UTC日時文字列をdatetime-local形式のJST文字列に安全に変換
 * フォーム入力での使用を想定
 */
export function formatUtcToDatetimeLocal(dateString: string): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return formatUtcToJst(date, "yyyy-MM-dd'T'HH:mm");
  } catch {
    return "";
  }
}

/**
 * UTC日時文字列を日本語表示形式のJST文字列に変換
 * UI表示での使用を想定
 */
export function formatUtcToJapaneseDisplay(dateString: string): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return formatUtcToJst(date, "yyyy年MM月dd日 HH:mm");
  } catch {
    return "";
  }
}

/**
 * 汎用的な安全な日付フォーマット関数
 */
export function formatUtcToJstSafe(
  dateString: string,
  format: string = "yyyy/MM/dd HH:mm"
): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return formatUtcToJst(date, format);
  } catch {
    return "";
  }
}

/**
 * 日付フォーマットの種類
 */
export type DateFormatType =
  | "datetime-local" // yyyy-MM-ddTHH:mm
  | "japanese" // yyyy年MM月dd日 HH:mm
  | "standard" // yyyy/MM/dd HH:mm
  | "iso" // yyyy-MM-dd HH:mm:ss
  | "time-only"; // HH:mm

/**
 * 統一的な日付フォーマット関数
 */
export function formatUtcToJstByType(dateString: string, type: DateFormatType): string {
  const formatMap: Record<DateFormatType, string> = {
    "datetime-local": "yyyy-MM-dd'T'HH:mm",
    japanese: "yyyy年MM月dd日 HH:mm",
    standard: "yyyy/MM/dd HH:mm",
    iso: "yyyy-MM-dd HH:mm:ss",
    "time-only": "HH:mm",
  };

  return formatUtcToJstSafe(dateString, formatMap[type]);
}

// Phase 2: JST基準の暦日ユーティリティ

/**
 * 任意のUTC日時をJSTに変換して 'yyyy-MM-dd' 形式で返す
 */
export function formatDateToJstYmd(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const jst = toZonedTime(d, JST_TIMEZONE);
  return format(jst, "yyyy-MM-dd", { timeZone: JST_TIMEZONE });
}

/**
 * JSTにおける暦日差（now - since）を返す
 */
export function getElapsedCalendarDaysInJst(since: Date | string, now: Date = new Date()): number {
  const sinceDate = typeof since === "string" ? new Date(since) : since;
  const sinceJst = toZonedTime(sinceDate, JST_TIMEZONE);
  const nowJst = toZonedTime(now, JST_TIMEZONE);
  return differenceInCalendarDays(nowJst, sinceJst);
}
