/**
 * タイムゾーン処理ユーティリティ関数
 * 
 * 基本方針:
 * - データベースには常にUTCで保存
 * - 表示時にJSTに変換
 * - datetime-local入力値はJSTとして解釈してUTCに変換
 */

import { parseISO } from 'date-fns';
import { fromZonedTime, toZonedTime, format } from 'date-fns-tz';

export const JST_TIMEZONE = 'Asia/Tokyo';

/**
 * datetime-local入力値（'2025-07-13T10:00'形式）をJSTとして解釈してUTCに変換
 */
export function convertDatetimeLocalToUtc(datetimeLocalString: string): Date {
  // 環境依存を避けるため、文字列を明示的にJST付きISO形式に正規化してからzonedTimeToUtcを使用
  const jstIsoString = `${datetimeLocalString}:00+09:00`;
  
  // zonedTimeToUtcで直接UTC変換（date-fns-tzの推奨方法）
  return new Date(jstIsoString);
}

/**
 * UTC日時をJSTに変換して指定フォーマットで表示
 */
export function formatUtcToJst(utcDate: Date | string, formatString: string = 'yyyy/MM/dd HH:mm'): string {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
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
  const startOfDay = fromZonedTime(
    parseISO(jstDateString + 'T00:00:00'),
    JST_TIMEZONE
  );
  
  // JST日付の終了時刻（23:59:59.999）をUTCに変換
  const endOfDay = fromZonedTime(
    parseISO(jstDateString + 'T23:59:59.999'),
    JST_TIMEZONE
  );
  
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
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  const nowUtc = new Date();
  return date > nowUtc;
}