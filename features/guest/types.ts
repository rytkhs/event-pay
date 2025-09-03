/**
 * Guest Feature Types
 * ゲスト機能関連の型定義
 */

import { Database } from "@/types/database";

// Database型から必要な型を抽出
export type AttendanceStatus = Database["public"]["Enums"]["attendance_status_enum"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];

// Guest Action関連の型定義
export interface UpdateGuestAttendanceInput {
  guestToken: string;
  attendanceStatus: AttendanceStatus;
  paymentMethod?: PaymentMethod;
}

export interface UpdateGuestAttendanceData {
  attendanceId: string;
  status: AttendanceStatus;
  paymentMethod: PaymentMethod | null;
  requiresAdditionalPayment: boolean;
}

// ゲスト参加データ（core/utils/guest-token.tsから参照）
export interface GuestAttendanceData {
  id: string;
  name: string;
  email: string;
  status: AttendanceStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;

  // イベント情報
  event: {
    id: string;
    title: string;
    event_date: string;
    fee_amount: number;
    status: string;
    registration_deadline?: string | null;
    max_participants?: number | null;
    created_by: string;
  };

  // 決済情報
  payment?: {
    id: string;
    method: PaymentMethod;
    amount: number;
    status: PaymentStatus;
    paid_at?: string | null;
  } | null;
}

// ゲスト管理フォームの入力データ
export interface GuestManagementInput {
  attendanceStatus: AttendanceStatus;
  paymentMethod?: PaymentMethod;
}

// ゲスト決済セッション作成パラメータ
export interface GuestStripeSessionParams {
  guestToken: string;
  successUrl: string;
  cancelUrl: string;
}

// ゲスト関連エラー種別
export enum GuestErrorType {
  INVALID_TOKEN = "INVALID_TOKEN",
  EXPIRED_TOKEN = "EXPIRED_TOKEN",
  ATTENDANCE_NOT_FOUND = "ATTENDANCE_NOT_FOUND",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  PAYMENT_NOT_ALLOWED = "PAYMENT_NOT_ALLOWED",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
}

// ゲストエラークラス
export class GuestError extends Error {
  constructor(
    public type: GuestErrorType,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = "GuestError";
  }
}
