/**
 * ゲスト機能共通型定義
 */

import type { AttendanceStatus, PaymentMethod, PaymentStatus } from "@core/types/statuses";

export type { AttendanceStatus, PaymentMethod, PaymentStatus } from "@core/types/statuses";

/**
 * ゲスト参加情報詳細
 * RLSベースの判定およびUI表示の両方で使用する最新のデータ構造
 */
export interface GuestAttendanceData {
  id: string;
  nickname: string;
  email: string;
  status: AttendanceStatus;
  guest_token: string;
  created_at: string;
  updated_at: string;
  event: {
    id: string;
    title: string;
    description: string | null;
    date: string;
    location: string | null;
    fee: number;
    capacity: number | null;
    registration_deadline: string | null;
    payment_deadline: string | null;
    payment_methods: PaymentMethod[];
    allow_payment_after_deadline: boolean;
    grace_period_days: number;
    created_by: string;
    canceled_at: string | null;
  };
  payment?: {
    id: string;
    amount: number;
    method: PaymentMethod;
    status: PaymentStatus;
    created_at: string;
  } | null;
}

/**
 * ゲスト参加更新アクションの結果データ
 */
export interface UpdateGuestAttendanceData {
  attendanceId: string;
  status: AttendanceStatus;
  paymentMethod: PaymentMethod | null;
  requiresAdditionalPayment: boolean;
}
