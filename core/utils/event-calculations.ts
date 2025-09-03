/**
 * イベント関連の計算処理を行うユーティリティ関数群
 */

interface Attendance {
  id: string;
  status: "attending" | "not_attending" | "maybe";
}

/**
 * 参加者数を計算する
 * @param attendances 出席情報の配列
 * @returns 参加者数（status が "attending" の数）
 */
export function calculateAttendeeCount(attendances?: Attendance[]): number {
  if (!attendances || !Array.isArray(attendances)) {
    return 0;
  }

  return attendances.filter((attendance) => attendance.status === "attending").length;
}
