import { generateRandomBytes, toBase64UrlSafe } from "@core/security/crypto";
import {
  validateGuestTokenRLS,
  type RLSGuestAttendanceData,
} from "@core/security/guest-token-validator";

import type { Database } from "@/types/database";

/**
 * ゲスト管理機能のためのユーティリティ関数
 *
 * 主な機能:
 * - ゲストトークンの生成・検証
 * - 参加データの取得・整形
 * - 参加状況変更可能性の判定
 */

/**
 * ゲスト参加データの型定義
 */
export interface GuestAttendanceData {
  id: string;
  nickname: string;
  email: string;
  status: Database["public"]["Enums"]["attendance_status_enum"];
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
    allow_payment_after_deadline?: boolean;
    grace_period_days?: number | null;
    created_by: string;
  };
  payment?: {
    id: string;
    amount: number;
    method: Database["public"]["Enums"]["payment_method_enum"];
    status: Database["public"]["Enums"]["payment_status_enum"];
    created_at: string;
  } | null;
}

/**
 * ゲストトークンを検証し、参加データを取得する
 *
 * 新しいRLSベースの実装を使用し、管理者権限を使用しない
 * セキュアなアクセス制御を提供する
 *
 * @param guestToken - 36文字のプレフィックス付きゲストトークン
 * @returns 検証結果と参加データ
 */
export async function validateGuestToken(guestToken: string): Promise<{
  isValid: boolean;
  attendance?: GuestAttendanceData;
  errorMessage?: string;
  canModify: boolean;
  errorCode?: import("@core/security/secure-client-factory.types").GuestErrorCode;
}> {
  try {
    // 新しいRLSベースのバリデーターを使用
    const rlsResult = await validateGuestTokenRLS(guestToken);

    // 従来の形式に変換
    return {
      isValid: rlsResult.isValid,
      attendance: rlsResult.attendance ? convertToLegacyFormat(rlsResult.attendance) : undefined,
      errorMessage: rlsResult.errorMessage,
      canModify: rlsResult.canModify,
      errorCode: rlsResult.errorCode,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const { logger } = await import("@core/logging/app-logger");
      logger.error("ゲストトークン検証エラー", {
        tag: "guestToken",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
    return {
      isValid: false,
      errorMessage: "参加データの取得中にエラーが発生しました",
      canModify: false,
      errorCode:
        "TOKEN_NOT_FOUND" as import("@core/security/secure-client-factory.types").GuestErrorCode,
    };
  }
}

/**
 * RLS形式のデータを従来形式に変換
 */
function convertToLegacyFormat(rlsData: RLSGuestAttendanceData): GuestAttendanceData {
  // RLS から取得した event オブジェクトをそのまま使用
  const event = Array.isArray(rlsData.event) ? rlsData.event[0] : rlsData.event;
  return {
    ...rlsData,
    event: event as GuestAttendanceData["event"],
  };
}

/**
 * ゲストトークンを生成する
 *
 * 24バイト（192ビット）のランダムデータをURLセーフなBase64でエンコードし、
 * プレフィックス付きの36文字の一意なトークンを生成する
 * Edge runtimeとNode.js両方で動作
 *
 * @returns 36文字のURL安全なゲストトークン (形式: gst_[32文字])
 */
export function generateGuestToken(): string {
  const bytes = generateRandomBytes(24);
  const baseToken = toBase64UrlSafe(bytes);
  return `gst_${baseToken}`;
}

// ====================================================================
// マイグレーション情報
// ====================================================================

/**
 * このファイルは段階的にRLSベースの新しいシステムに移行されています。
 *
 * 移行状況:
 * ✅ validateGuestToken() - RLSベースの実装に移行済み
 * ✅ generateGuestToken() - 変更なし（既に安全）
 *
 * 新しいコードでの推奨事項:
 * - getRLSGuestTokenValidator()を使用してバリデーターを取得
 * - 直接RLSベースのメソッドを使用
 * - 新しいエラーハンドリングシステムを活用
 *
 */
