import type { SupabaseClient } from "@supabase/supabase-js";

import { generateRandomBytes, toBase64UrlSafe } from "@core/security/crypto";
import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import type { InviteEventDetail, InviteValidationResult } from "@core/types/invite";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { handleServerError } from "@core/utils/error-handler.server";

import type { Database } from "@/types/database";

/**
 * 暗号学的に安全な招待トークンを生成します。
 * 24バイトのランダムデータをURLセーフなBase64でエンコードし、プレフィックスを追加します（36文字）。
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
    // 公開RPC向け匿名クライアント + 招待トークンヘッダー
    const secureFactory = getSecureClientFactory();
    const anonClient = secureFactory.createPublicClient({
      headers: { "x-invite-token": token },
    }) as SupabaseClient<Database>;

    // 公開RPCでイベント情報+参加者数を取得
    const { data: rpcData, error: rpcError } = await anonClient.rpc("rpc_public_get_event", {
      p_invite_token: token,
    });

    const evRow = Array.isArray(rpcData) ? rpcData[0] : undefined;

    if (rpcError || !evRow) {
      return {
        isValid: false,
        canRegister: false,
        errorMessage: "招待リンクが見つかりません",
        errorCode: "TOKEN_NOT_FOUND",
      };
    }
    const actualAttendancesCount = Number(evRow.attendances_count) || 0;

    const computedStatus = deriveEventStatus(evRow.date, evRow.canceled_at ?? null);
    const eventDetail: InviteEventDetail = {
      ...evRow,
      status: computedStatus,
      attendances_count: actualAttendancesCount,
    };

    // イベントがキャンセルされているか確認
    if (evRow.canceled_at) {
      return {
        isValid: true,
        event: eventDetail,
        canRegister: false,
        errorMessage: "このイベントはキャンセルされました",
        errorCode: "EVENT_CANCELED",
      };
    }

    // イベントが終了しているか確認
    if (computedStatus === "past") {
      return {
        isValid: true,
        event: eventDetail,
        canRegister: false,
        errorMessage: "このイベントは終了しています",
        errorCode: "EVENT_ENDED",
      };
    }

    // 参加申込期限を確認
    if (evRow.registration_deadline) {
      const now = new Date();
      const deadline = new Date(evRow.registration_deadline);

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
    handleServerError("UNKNOWN_ERROR", {
      category: "authentication",
      action: "invite_token_validation",
      actorType: "anonymous",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
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
  capacity: number | null,
  inviteToken?: string
): Promise<boolean> {
  if (!capacity) {
    return false; // 定員制限なし
  }

  try {
    const secureFactory = getSecureClientFactory();
    const client = secureFactory.createPublicClient() as SupabaseClient<Database>;

    const { data, error } = await client.rpc("rpc_public_attending_count", {
      p_event_id: eventId,
      p_invite_token: inviteToken ?? "",
    });

    if (error) {
      handleServerError("DATABASE_ERROR", {
        category: "authentication",
        action: "invite_token_validation",
        actorType: "anonymous",
        additionalData: {
          error_name: "PostgrestError",
          error_message: error.message,
          event_id: eventId,
        },
      });
      return true; // 安全のため、エラー時は定員超過とみなす
    }

    const count = Number(data) || 0;
    return count >= capacity;
  } catch (error) {
    handleServerError("DATABASE_ERROR", {
      category: "authentication",
      action: "invite_token_validation",
      actorType: "anonymous",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
        event_id: eventId,
      },
    });
    return true; // 安全のため、エラー時は定員超過とみなす
  }
}

/**
 * 指定されたメールアドレスが既にイベントに登録されているか確認します。
 * @param {string} eventId - イベントID
 * @param {string} email - 確認するメールアドレス
 * @returns {Promise<boolean>} 既に登録済みの場合はtrue
 */
export async function checkDuplicateEmail(
  eventId: string,
  email: string,
  inviteToken?: string
): Promise<boolean> {
  try {
    // 招待トークンヘッダーが必要なため、呼び出し側でvalidateInviteToken済み前提
    // ここでは匿名RPCに委譲
    const secureFactory = getSecureClientFactory();
    const client = secureFactory.createPublicClient({
      headers: inviteToken ? { "x-invite-token": inviteToken } : {},
    }) as SupabaseClient<Database>;

    const { data, error } = await client.rpc("rpc_public_check_duplicate_email", {
      p_event_id: eventId,
      p_email: email,
      p_invite_token: inviteToken ?? "",
    });

    if (error) {
      handleServerError("DATABASE_ERROR", {
        category: "authentication",
        action: "invite_token_validation",
        actorType: "anonymous",
        additionalData: {
          error_name: "PostgrestError",
          error_message: error.message,
          event_id: eventId,
        },
      });
      return true; // 安全のため、エラー時は重複とみなす
    }

    return Boolean(data);
  } catch (_error) {
    return true; // 安全のため、エラー時は重複とみなす
  }
}
