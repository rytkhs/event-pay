import { logger } from "@core/logging/app-logger";
import { generateRandomBytes, toBase64UrlSafe } from "@core/security/crypto";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { deriveEventStatus } from "@core/utils/derive-event-status";

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
  status: "upcoming" | "ongoing" | "past" | "canceled";
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
    // 読み取り専用クライアント（匿名ロール） + 招待トークンヘッダー
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const anonClient = secureFactory.createReadOnlyClient({
      headers: { "x-invite-token": token },
    });

    // 公開RPCでイベント情報+参加者数を取得
    const { data: rpcData, error: rpcError } = await (anonClient as any).rpc(
      "rpc_public_get_event",
      { p_invite_token: token }
    );

    const evRow = Array.isArray(rpcData) ? rpcData[0] : undefined;

    if (rpcError || !evRow) {
      return {
        isValid: false,
        canRegister: false,
        errorMessage: "招待リンクが見つかりません",
        errorCode: "TOKEN_NOT_FOUND",
      };
    }
    const event = evRow as any;
    const actualAttendancesCount = Number(event.attendances_count) || 0;

    const computedStatus = deriveEventStatus(event.date, event.canceled_at ?? null);
    const eventDetail: EventDetail = {
      ...(event as any),
      status: computedStatus as any,
      attendances_count: actualAttendancesCount,
    };

    // イベントがキャンセルされているか確認
    if ((event as any).canceled_at) {
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
  capacity: number | null,
  inviteToken?: string
): Promise<boolean> {
  if (!capacity) {
    return false; // 定員制限なし
  }

  try {
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const client = secureFactory.createReadOnlyClient();

    const { data, error } = await (client as any).rpc("rpc_public_attending_count", {
      p_event_id: eventId,
      p_invite_token: inviteToken,
    });

    if (error) {
      if (process.env.NODE_ENV === "development") {
        logger.error("Failed to check event capacity", {
          tag: "inviteTokenValidation",
          error_name: (error as any)?.name ?? "Unknown",
          error_message: (error as any)?.message ?? String(error),
          event_id: eventId,
        });
      }
      return true; // 安全のため、エラー時は定員超過とみなす
    }

    const count = Number(data) || 0;
    return count >= capacity;
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
export async function checkDuplicateEmail(
  eventId: string,
  email: string,
  inviteToken?: string
): Promise<boolean> {
  try {
    // 招待トークンヘッダーが必要なため、呼び出し側でvalidateInviteToken済み前提
    // ここでは匿名RPCに委譲
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const client = secureFactory.createReadOnlyClient({
      headers: inviteToken ? { "x-invite-token": inviteToken } : {},
    });

    const { data, error } = await (client as any).rpc("rpc_public_check_duplicate_email", {
      p_event_id: eventId,
      p_email: email,
      p_invite_token: inviteToken,
    });

    if (error) {
      if (process.env.NODE_ENV === "development") {
        logger.error("Failed to check email duplication", {
          tag: "inviteTokenValidation",
          error_name: (error as any)?.name ?? "Unknown",
          error_message: (error as any)?.message ?? String(error),
          event_id: eventId,
        });
      }
      return true; // 安全のため、エラー時は重複とみなす
    }

    return Boolean(data);
  } catch (_error) {
    return true; // 安全のため、エラー時は重複とみなす
  }
}
