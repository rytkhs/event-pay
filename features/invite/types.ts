/**
 * Invite Feature Types
 * 招待機能関連の型定義
 */

import type { AttendanceStatus, PaymentMethod } from "@core/types/statuses";

export type { InviteEventDetail, InviteValidationResult } from "@core/types/invite";
export type { AttendanceStatus, EventStatus, PaymentMethod } from "@core/types/statuses";

// 参加登録結果データ
export interface RegisterParticipationData {
  attendanceId: string;
  guestToken: string;
  requiresAdditionalPayment: boolean;
  eventTitle: string;
  participantNickname: string;
  participantEmail: string;
  attendanceStatus: AttendanceStatus;
  paymentMethod?: PaymentMethod;
}

// 招待トークン生成オプション
export interface GenerateInviteTokenOptions {
  forceRegenerate?: boolean;
}

// 招待トークン生成結果
export interface GenerateInviteTokenResult {
  inviteToken: string;
  inviteUrl: string;
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
