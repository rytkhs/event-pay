import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
import type { Database } from "@/types/database";

// ゲスト参加データの型定義
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
    organizer_id: string;
  };
  payment?: {
    id: string;
    amount: number;
    method: Database["public"]["Enums"]["payment_method_enum"];
    status: Database["public"]["Enums"]["payment_status_enum"];
    created_at: string;
  } | null;
}

// ゲストトークン検証結果の型定義
export interface GuestTokenValidationResult {
  isValid: boolean;
  attendance?: GuestAttendanceData;
  errorMessage?: string;
  canModify: boolean;
}

/**
 * ゲストトークンを検証し、参加データを取得する
 * @param guestToken ゲストトークン
 * @returns 検証結果と参加データ
 */
export async function validateGuestToken(guestToken: string): Promise<GuestTokenValidationResult> {
  try {
    // トークンの基本検証
    if (!guestToken || typeof guestToken !== "string") {
      return {
        isValid: false,
        errorMessage: "無効なゲストトークンです",
        canModify: false,
      };
    }

    // トークンの形式チェック（32文字のURL安全な文字列）
    if (guestToken.length !== 32 || !/^[a-zA-Z0-9_-]+$/.test(guestToken)) {
      return {
        isValid: false,
        errorMessage: "無効なゲストトークンの形式です",
        canModify: false,
      };
    }

    const supabase = createClient();

    // ゲストトークンで参加データを取得
    const { data: attendance, error } = await supabase
      .from("attendances")
      .select(`
        id,
        nickname,
        email,
        status,
        guest_token,
        created_at,
        updated_at,
        event:events (
          id,
          title,
          description,
          date,
          location,
          fee,
          capacity,
          registration_deadline,
          payment_deadline,
          organizer_id
        ),
        payment:payments (
          id,
          amount,
          method,
          status,
          created_at
        )
      `)
      .eq("guest_token", guestToken)
      .single();

    if (error || !attendance) {
      return {
        isValid: false,
        errorMessage: "参加データが見つかりません",
        canModify: false,
      };
    }

    // イベントデータの存在確認
    if (!attendance.event) {
      return {
        isValid: false,
        errorMessage: "イベントデータが見つかりません",
        canModify: false,
      };
    }

    // 変更可能かどうかの判定
    const canModify = checkCanModifyAttendance(attendance.event);

    return {
      isValid: true,
      attendance: {
        ...attendance,
        nickname: sanitizeForEventPay(attendance.nickname),
        event: {
          ...attendance.event,
          title: sanitizeForEventPay(attendance.event.title),
          description: attendance.event.description
            ? sanitizeForEventPay(attendance.event.description)
            : null,
          location: attendance.event.location
            ? sanitizeForEventPay(attendance.event.location)
            : null,
        },
      } as GuestAttendanceData,
      canModify,
    };
  } catch (error) {
    console.error("ゲストトークン検証エラー:", error);
    return {
      isValid: false,
      errorMessage: "参加データの取得中にエラーが発生しました",
      canModify: false,
    };
  }
}

/**
 * 参加状況を変更可能かどうかを判定する
 * @param event イベントデータ
 * @returns 変更可能かどうか
 */
function checkCanModifyAttendance(event: GuestAttendanceData["event"]): boolean {
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
 * ゲストトークンを生成する
 * @returns 32文字のURL安全なゲストトークン
 */
export function generateGuestToken(): string {
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}