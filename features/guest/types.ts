/**
 * Guest Feature Types
 * ゲスト機能UI関連の型定義
 */

import {
  type AttendanceStatus,
  type PaymentMethod,
  type PaymentStatus,
  type GuestAttendanceData,
  type UpdateGuestAttendanceData,
} from "@core/types/guest";

export {
  type AttendanceStatus,
  type PaymentMethod,
  type PaymentStatus,
  type GuestAttendanceData,
  type UpdateGuestAttendanceData,
};

// ゲストの状況シナリオ（UI表示用）
export enum GuestScenario {
  PAID = "PAID",
  PENDING_CASH = "PENDING_CASH",
  PENDING_ONLINE = "PENDING_ONLINE",
  MAYBE = "MAYBE",
  NOT_ATTENDING = "NOT_ATTENDING",
}
