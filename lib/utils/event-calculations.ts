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

/**
 * 参加状況のサマリーを計算する
 * @param attendances 出席情報の配列
 * @returns 各ステータスの人数
 */
export function calculateAttendanceSummary(attendances?: Attendance[]) {
  if (!attendances || !Array.isArray(attendances)) {
    return {
      attending: 0,
      not_attending: 0,
      maybe: 0,
      total: 0,
    };
  }

  const summary = attendances.reduce(
    (acc, attendance) => {
      acc[attendance.status]++;
      acc.total++;
      return acc;
    },
    {
      attending: 0,
      not_attending: 0,
      maybe: 0,
      total: 0,
    }
  );

  return summary;
}

/**
 * 定員に対する参加率を計算する
 * @param attendances 出席情報の配列
 * @param capacity 定員
 * @returns 参加率（0-1の範囲）
 */
export function calculateAttendanceRate(
  attendances?: Attendance[],
  capacity?: number | null
): number {
  if (!capacity || capacity <= 0) {
    return 0;
  }

  const attendeeCount = calculateAttendeeCount(attendances);
  return Math.min(attendeeCount / capacity, 1);
}
