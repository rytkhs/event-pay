/**
 * テスト用ヘルパー関数
 * タイムゾーン処理のベストプラクティスに準拠
 */

import { getMinDatetimeLocal } from "./timezone";

/**
 * テスト用の未来の日時文字列を生成（datetime-local形式）
 * @param hoursFromNow 現在時刻から何時間後か
 * @returns YYYY-MM-DDTHH:mm形式の文字列
 */
export function getFutureDatetimeLocalForTest(hoursFromNow: number = 2): string {
  const minDateTime = getMinDatetimeLocal();
  const date = new Date(minDateTime);
  date.setHours(date.getHours() + hoursFromNow - 1); // getMinDatetimeLocalは既に1時間後なので調整

  return date.toISOString().slice(0, 16);
}

/**
 * テスト用の過去の日時文字列を生成（datetime-local形式）
 * @param hoursAgo 現在時刻から何時間前か
 * @returns YYYY-MM-DDTHH:mm形式の文字列
 */
export function getPastDatetimeLocalForTest(hoursAgo: number = 2): string {
  const now = new Date();
  now.setHours(now.getHours() - hoursAgo);

  return now.toISOString().slice(0, 16);
}

/**
 * テスト用の現在時刻のdatetime-local文字列を生成
 * @returns YYYY-MM-DDTHH:mm形式の文字列
 */
export function getCurrentDatetimeLocalForTest(): string {
  return new Date().toISOString().slice(0, 16);
}
