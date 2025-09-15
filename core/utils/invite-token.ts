import { logger } from "@core/logging/app-logger";
import { generateRandomBytes, toBase64UrlSafe } from "@core/security/crypto";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { createClient } from "@core/supabase/server";

import type { Database } from "@/types/database";

/**
 * 暗号学的に安全な招待トークンを生成します。
 * 24バイトのランダムデータをURLセーフなBase64でエンコードし、プレフィックスを追加します（36文字）。
 * Edge runtimeとNode.js両方で動作。
 * @returns {string} 生成された招待トークン（形式: inv_[32文字]）
 */
export function generateInviteToken(): string {
  const bytes = generateRandomBytes(24);
  const baseToken = toBase64UrlSafe(bytes);
  return `inv_${baseToken}`;
}

/**
 * 招待トークンの形式を検証します（validateInviteTokenFormatのエイリアス）。
 * @param {string} token - 検証するトークン
 * @returns {boolean} トークンが有効な場合はtrue、それ以外はfalse
 */
export function isValidInviteToken(token: string): boolean {
  // 正式フォーマット（inv_接頭辞付き）
  if (validateInviteTokenFormat(token)) return true;
  // 後方互換: 接頭辞なし32文字のURLセーフトークンも許可
  const baseTokenPattern = /^[a-zA-Z0-9_-]{32}$/;
  return baseTokenPattern.test(token);
}

// 招待検証用のイベント詳細情報
export interface EventDetail {
  id: string;
  title: string;
  date: string;
  location: string | null;
  description: string | null;
  fee: number;
  capacity: number | null;
  payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
  registration_deadline: string | null;
  payment_deadline: string | null;
  status: Database["public"]["Enums"]["event_status_enum"];
  invite_token: string;
  attendances_count: number;
}

// 招待検証の結果
export interface InviteValidationResult {
  isValid: boolean;
  event?: EventDetail;
  canRegister: boolean;
  errorMessage?: string;
  errorCode?:
    | "INVALID_TOKEN"
    | "TOKEN_NOT_FOUND"
    | "EVENT_CANCELED"
    | "EVENT_ENDED"
    | "REGISTRATION_DEADLINE_PASSED"
    | "UNKNOWN_ERROR";
}

/**
 * 招待トークンの形式を検証します。
 * @param {string} token - 検証するトークン
 * @returns {boolean} トークン形式が有効な場合はtrue、それ以外はfalse
 */
function validateInviteTokenFormat(token: string): boolean {
  // 新仕様フォーマット（inv_プレフィックス付き36文字）
  return typeof token === "string" && token.length === 36 && /^inv_[a-zA-Z0-9_-]{32}$/.test(token);
}

/**
 * 招待トークンを検証し、イベントデータを取得します。
 * @param {string} token - 検証する招待トークン
 * @returns {Promise<InviteValidationResult>} 検証結果
 */
export async function validateInviteToken(token: string): Promise<InviteValidationResult> {
  // フォーマット検証
  if (!validateInviteTokenFormat(token)) {
    return {
      isValid: false,
      canRegister: false,
      errorMessage: "無効な招待リンクです",
      errorCode: "INVALID_TOKEN",
    };
  }

  try {
    // Phase 2: Service Roleクライアントを使用してRLS制約を回避
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.EVENT_MANAGEMENT,
      "validate_invite_token",
      { inviteToken: token }
    );

    // 招待トークンでイベントを取得
    const { data: event, error } = await adminClient
      .from("events")
      .select(
        `
        id,
        title,
        date,
        location,
        description,
        fee,
        capacity,
        payment_methods,
        registration_deadline,
        payment_deadline,
        status,
        invite_token
      `
      )
      .eq("invite_token", token)
      .single();

    if (error || !event) {
      return {
        isValid: false,
        canRegister: false,
        errorMessage: "招待リンクが見つかりません",
        errorCode: "TOKEN_NOT_FOUND",
      };
    }

    // 参加者数を別途取得（参加ステータスのみをカウント）
    const { count: attendances_count, error: countError } = await adminClient
      .from("attendances")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "attending");

    // DBエラー時は安全のため参加者数を取得できないとして処理
    if (countError) {
      if (process.env.NODE_ENV === "development") {
        logger.error("Failed to fetch participant count", {
          tag: "inviteTokenValidation",
          error_name: countError instanceof Error ? countError.name : "Unknown",
          error_message: countError instanceof Error ? countError.message : String(countError),
        });
      }
      // セキュリティのため、エラー時は定員超過扱いとする
      const actualAttendancesCount = event.capacity || 0;

      const eventDetail: EventDetail = {
        ...(event as any),
        attendances_count: actualAttendancesCount,
      };

      return {
        isValid: true,
        event: eventDetail,
        canRegister: false,
        errorMessage: "現在参加登録を受け付けることができません。しばらく後にお試しください。",
        errorCode: "UNKNOWN_ERROR",
      };
    }

    const actualAttendancesCount = attendances_count || 0;

    const eventDetail: EventDetail = {
      ...(event as any),
      attendances_count: actualAttendancesCount,
    };

    // イベントがキャンセルされているか確認
    if (event.status === "canceled") {
      return {
        isValid: true,
        event: eventDetail,
        canRegister: false,
        errorMessage: "このイベントはキャンセルされました",
        errorCode: "EVENT_CANCELED",
      };
    }

    // イベントが終了しているか確認
    if (event.status === "past") {
      return {
        isValid: true,
        event: eventDetail,
        canRegister: false,
        errorMessage: "このイベントは終了しています",
        errorCode: "EVENT_ENDED",
      };
    }

    // 参加申込期限を確認
    if (event.registration_deadline) {
      const now = new Date();
      const deadline = new Date(event.registration_deadline);
      if (now > deadline) {
        return {
          isValid: true,
          event: eventDetail,
          canRegister: false,
          errorMessage: "参加申込期限が過ぎています",
          errorCode: "REGISTRATION_DEADLINE_PASSED",
        };
      }
    }

    return {
      isValid: true,
      event: eventDetail,
      canRegister: true,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      logger.error("Failed to validate invite token", {
        tag: "inviteTokenValidation",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
    return {
      isValid: false,
      canRegister: false,
      errorMessage: "招待リンクの検証中にエラーが発生しました",
      errorCode: "UNKNOWN_ERROR",
    };
  }
}

/**
 * イベントが参加者の定員に達しているか確認します。
 * @param {string} eventId - イベントID
 * @param {number | null} capacity - イベントの定員
 * @returns {Promise<boolean>} 定員に達している場合はtrue
 */
export async function checkEventCapacity(
  eventId: string,
  capacity: number | null
): Promise<boolean> {
  if (!capacity) {
    return false; // 定員制限なし
  }

  try {
    const supabase = createClient();

    // 参加ステータスの参加者をカウント
    const { count, error } = await supabase
      .from("attendances")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "attending");

    if (error) {
      if (process.env.NODE_ENV === "development") {
        logger.error("Failed to check event capacity", {
          tag: "inviteTokenValidation",
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
          event_id: eventId,
        });
      }
      return true; // 安全のため、エラー時は定員超過とみなす
    }

    return (count || 0) >= capacity;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      logger.error("Failed to check event capacity", {
        tag: "inviteTokenValidation",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
        event_id: eventId,
      });
    }
    return true; // 安全のため、エラー時は定員超過とみなす
  }
}

/**
 * 指定されたメールアドレスが既にイベントに登録されているか確認します。
 * @param {string} eventId - イベントID
 * @param {string} email - 確認するメールアドレス
 * @returns {Promise<boolean>} 既に登録済みの場合はtrue
 */
export async function checkDuplicateEmail(eventId: string, email: string): Promise<boolean> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("attendances")
      .select("id")
      .eq("event_id", eventId)
      .eq("email", email)
      .limit(1);

    if (error) {
      if (process.env.NODE_ENV === "development") {
        logger.error("Failed to check email duplication", {
          tag: "inviteTokenValidation",
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
          event_id: eventId,
        });
      }
      return true; // 安全のため、エラー時は重複とみなす
    }

    return (data?.length || 0) > 0;
  } catch (_error) {
    return true; // 安全のため、エラー時は重複とみなす
  }
}
