import { generateRandomBytes, toBase64UrlSafe } from "@/lib/security/crypto";
import {
  getRLSGuestTokenValidator,
  validateGuestTokenRLS,
  type RLSGuestAttendanceData
} from "@/lib/security/guest-token-validator";
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
 * ゲストトークン検証結果の型定義
 */
export interface GuestTokenValidationResult {
  isValid: boolean;
  attendance?: GuestAttendanceData;
  errorMessage?: string;
  canModify: boolean;
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
export async function validateGuestToken(guestToken: string): Promise<GuestTokenValidationResult> {
  try {
    // 新しいRLSベースのバリデーターを使用
    const rlsResult = await validateGuestTokenRLS(guestToken);

    // 従来の形式に変換
    return {
      isValid: rlsResult.isValid,
      attendance: rlsResult.attendance ? convertToLegacyFormat(rlsResult.attendance) : undefined,
      errorMessage: rlsResult.errorMessage,
      canModify: rlsResult.canModify,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error("ゲストトークン検証エラー:", error);
    }
    return {
      isValid: false,
      errorMessage: "参加データの取得中にエラーが発生しました",
      canModify: false,
    };
  }
}

/**
 * RLS形式のデータを従来形式に変換
 */
function convertToLegacyFormat(rlsData: RLSGuestAttendanceData): GuestAttendanceData {
  return {
    ...rlsData,
    event: {
      ...rlsData.event,
      // statusフィールドを除外（従来形式には含まれていない）
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      status: undefined,
    } as GuestAttendanceData["event"],
  };
}

/**
 * 参加状況を変更可能かどうかを判定する（従来互換）
 * 
 * 注意: この関数は後方互換性のために残されています。
 * 新しいコードではRLSGuestTokenValidatorの使用を推奨します。
 * 
 * @param event イベントデータ
 * @returns 変更可能かどうか
 */
function _checkCanModifyAttendance(event: GuestAttendanceData["event"]): boolean {
  const now = new Date();

  // 登録締切が設定されている場合、締切を過ぎていれば変更不可
  if (event.registration_deadline) {
    const deadline = new Date(event.registration_deadline);
    if (now > deadline) {
      return false;
    }
  }

  // イベント開始時刻を過ぎていれば変更不可
  const eventDate = new Date(event.date);
  if (now > eventDate) {
    return false;
  }

  return true;
}

/**
 * RLSベースのゲストトークンバリデーターを取得
 * 
 * 新しいコードではこの関数を使用してバリデーターを取得し、
 * 直接RLSベースの機能を使用することを推奨します。
 * 
 * @returns RLSベースのゲストトークンバリデーター
 */
export function getGuestTokenValidator() {
  return getRLSGuestTokenValidator();
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
 * ✅ _checkCanModifyAttendance() - 後方互換性のために保持
 * 
 * 新しいコードでの推奨事項:
 * - getRLSGuestTokenValidator()を使用してバリデーターを取得
 * - 直接RLSベースのメソッドを使用
 * - 新しいエラーハンドリングシステムを活用
 * 
 * 廃止予定:
 * - _checkCanModifyAttendance() - RLSGuestTokenValidatorのメソッドを使用
 * - GuestAttendanceData型 - RLSGuestAttendanceData型を使用
 * - GuestTokenValidationResult型 - RLSGuestTokenValidationResult型を使用
 */
