/**
 * Invite Feature Types
 * 招待機能関連の型定義
 */

import { Database } from "@/types/database";

// Database型から必要な型を抽出
export type AttendanceStatus = Database["public"]["Enums"]["attendance_status_enum"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];
export type EventStatus = Database["public"]["Enums"]["event_status_enum"];

// イベント詳細情報（core/utils/invite-token.tsから参照）
export interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  fee: number;
  status: EventStatus;
  registration_deadline: string | null;
  capacity: number | null;
  attendances_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  invite_token: string | null;
}

// 参加登録結果データ - actionsから直接エクスポート
// export interface RegisterParticipationData は actions/register-participation.ts で定義

// 招待トークン生成オプション
export interface GenerateInviteTokenOptions {
  forceRegenerate?: boolean;
}

// 招待トークン生成結果
export interface GenerateInviteTokenResult {
  inviteToken: string;
  inviteUrl: string;
}

// 招待トークン検証結果
export interface InviteValidationResult {
  isValid: boolean;
  canRegister: boolean;
  event?: EventDetail;
  errorMessage?: string;
}

// 招待関連エラー種別
export enum InviteErrorType {
  INVALID_TOKEN = "INVALID_TOKEN",
  EXPIRED_TOKEN = "EXPIRED_TOKEN",
  EVENT_NOT_FOUND = "EVENT_NOT_FOUND",
  CAPACITY_FULL = "CAPACITY_FULL",
  REGISTRATION_CLOSED = "REGISTRATION_CLOSED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  DUPLICATE_EMAIL = "DUPLICATE_EMAIL",
  NETWORK_ERROR = "NETWORK_ERROR",
}

// 招待エラークラス
export class InviteError extends Error {
  constructor(
    public type: InviteErrorType,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = "InviteError";
  }
}
