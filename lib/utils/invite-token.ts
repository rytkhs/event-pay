import { z } from "zod";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// 招待トークンの検証スキーマ
export const inviteTokenSchema = z.string()
  .length(32, "無効な招待トークンの形式です")
  .regex(/^[a-zA-Z0-9_-]+$/, "無効な招待トークンの文字です");

/**
 * 暗号学的に安全な招待トークンを生成します。
 * 24バイトのランダムデータをURLセーフなBase64でエンコードします（32文字）。
 * @returns {string} 生成された招待トークン
 */
export function generateInviteToken(): string {
  return randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * 招待トークンの形式を検証します（validateInviteTokenFormatのエイリアス）。
 * @param {string} token - 検証するトークン
 * @returns {boolean} トークンが有効な場合はtrue、それ以外はfalse
 */
export function isValidInviteToken(token: string): boolean {
  return validateInviteTokenFormat(token);
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
}

/**
 * 招待トークンの形式を検証します。
 * @param {string} token - 検証するトークン
 * @returns {boolean} トークン形式が有効な場合はtrue、それ以外はfalse
 */
export function validateInviteTokenFormat(token: string): boolean {
  try {
    inviteTokenSchema.parse(token);
    return true;
  } catch {
    return false;
  }
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
    };
  }

  try {
    const supabase = createClient();

    // 招待トークンで参加者数と共にイベントを取得
    const { data: event, error } = await supabase
      .from("events")
      .select(`
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
        invite_token,
        attendances!inner(id)
      `)
      .eq("invite_token", token)
      .single();

    if (error || !event) {
      return {
        isValid: false,
        canRegister: false,
        errorMessage: "招待リンクが見つかりません",
      };
    }

    // 参加者数をカウント
    const attendances_count = Array.isArray(event.attendances) ? event.attendances.length : 0;

    const eventDetail: EventDetail = {
      ...event,
      attendances_count,
    };

    // イベントがキャンセルされているか確認
    if (event.status === "cancelled") {
      return {
        isValid: true,
        event: eventDetail,
        canRegister: false,
        errorMessage: "このイベントはキャンセルされました",
      };
    }

    // イベントが終了しているか確認
    if (event.status === "past") {
      return {
        isValid: true,
        event: eventDetail,
        canRegister: false,
        errorMessage: "このイベントは終了しています",
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
        };
      }
    }

    return {
      isValid: true,
      event: eventDetail,
      canRegister: true,
    };
  } catch (error) {
    console.error("招待トークンの検証エラー:", error);
    return {
      isValid: false,
      canRegister: false,
      errorMessage: "招待リンクの検証中にエラーが発生しました",
    };
  }
}

/**
 * イベントが参加者の定員に達しているか確認します。
 * @param {string} eventId - イベントID
 * @param {number | null} capacity - イベントの定員
 * @returns {Promise<boolean>} 定員に達している場合はtrue
 */
export async function checkEventCapacity(eventId: string, capacity: number | null): Promise<boolean> {
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
      console.error("定員チェックエラー:", error);
      return true; // 安全のため、エラー時は定員超過とみなす
    }

    return (count || 0) >= capacity;
  } catch (error) {
    console.error("定員チェックエラー:", error);
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
      console.error("メールアドレスの重複チェックエラー:", error);
      return true; // 安全のため、エラー時は重複とみなす
    }

    return (data?.length || 0) > 0;
  } catch (_error) {
    return true; // 安全のため、エラー時は重複とみなす
  }
}
