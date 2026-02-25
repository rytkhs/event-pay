import { generateRandomBytes, toBase64UrlSafe } from "@core/security/crypto";
import { RLSGuestTokenValidator } from "@core/security/guest-token-validator";
import { type GuestAttendanceData } from "@core/types/guest";
import { handleServerError } from "@core/utils/error-handler.server";

export type { GuestAttendanceData };

/**
 * ゲスト管理機能のためのユーティリティ関数
 *
 * 主な機能:
 * - ゲストトークンの生成・検証
 * - 参加データの取得・整形
 * - 参加状況変更可能性の判定
 */

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
  errorCode?: import("@core/security/guest-token-errors").GuestErrorCode;
}> {
  try {
    // 新しいRLSベースのバリデーターを使用
    const validator = new RLSGuestTokenValidator();
    const rlsResult = await validator.validateGuestTokenWithDetails(guestToken);

    // 従来の形式に変換
    return {
      isValid: rlsResult.isValid,
      attendance: rlsResult.attendance,
      errorMessage: rlsResult.errorMessage,
      canModify: rlsResult.canModify,
      errorCode: rlsResult.errorCode,
    };
  } catch (error) {
    handleServerError("GUEST_TOKEN_VALIDATION_FAILED", {
      category: "authentication",
      action: "guest_token_validation",
      actorType: "anonymous",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return {
      isValid: false,
      errorMessage: "参加データの取得中にエラーが発生しました",
      canModify: false,
      errorCode: "TOKEN_NOT_FOUND" as import("@core/security/guest-token-errors").GuestErrorCode,
    };
  }
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

/**
 * ゲストトークンからゲストURLを生成
 *
 * @param guestToken - ゲストトークン
 * @returns ゲストURL (/guest/{guestToken})
 */
export function buildGuestUrl(guestToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/guest/${guestToken}`;
}
