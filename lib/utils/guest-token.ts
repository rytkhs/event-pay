import { generateRandomBytes, toBase64UrlSafe } from "@/lib/security/crypto";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
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
 * 注意: Row Level Security (RLS) のため、管理者権限でクエリを実行する
 * ゲスト認証では通常のRLSポリシーでは制限されるため、この処理は妥当である
 *
 * @param guestToken - 32文字のBase64エンコードされたゲストトークン
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

    // トークンの形式チェック（32文字のBase64エンコード形式のみ）
    const isBase64Format = /^[a-zA-Z0-9_-]{32}$/.test(guestToken);

    if (guestToken.length !== 32 || !isBase64Format) {
      return {
        isValid: false,
        errorMessage: "無効なゲストトークンの形式です",
        canModify: false,
      };
    }

    // 管理者権限でクエリを実行（RLSを回避）
    // 注意: ゲスト認証では通常のRLSポリシーでは制限されるため、管理者権限を使用
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createSupabaseAdminClient();

    // ゲストトークンで参加データを取得
    const { data: attendance, error } = await supabase
      .from("attendances")
      .select(
        `
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
          created_by
        ),
        payment:payments (
          id,
          amount,
          method,
          status,
          created_at
        )
      `
      )
      .eq("guest_token", guestToken)
      .single();

    if (error) {
      // 開発環境でのみエラー詳細をログ出力
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

    if (!attendance) {
      return {
        isValid: false,
        errorMessage: "参加データが見つかりません",
        canModify: false,
      };
    }

    // イベントデータの存在確認と正規化
    // Supabaseクエリの関連データは配列として返される場合がある
    let eventData;
    if (Array.isArray(attendance.event)) {
      eventData = attendance.event[0];
    } else {
      eventData = attendance.event;
    }

    if (!eventData) {
      return {
        isValid: false,
        errorMessage: "イベントデータが見つかりません",
        canModify: false,
      };
    }

    // 支払いデータの正規化
    let paymentData = null;
    if (attendance.payment) {
      if (Array.isArray(attendance.payment)) {
        paymentData = attendance.payment[0] || null;
      } else {
        paymentData = attendance.payment;
      }
    }

    // 変更可能かどうかの判定
    const canModify = checkCanModifyAttendance(eventData);

    return {
      isValid: true,
      attendance: {
        ...attendance,
        nickname: sanitizeForEventPay(attendance.nickname),
        event: {
          ...eventData,
          title: sanitizeForEventPay(eventData.title),
          description: eventData.description ? sanitizeForEventPay(eventData.description) : null,
          location: eventData.location ? sanitizeForEventPay(eventData.location) : null,
        },
        payment: paymentData,
      } as GuestAttendanceData,
      canModify,
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
 *
 * 24バイト（192ビット）のランダムデータをURLセーフなBase64でエンコードし、
 * 32文字の一意なトークンを生成する
 * Edge runtimeとNode.js両方で動作
 *
 * @returns 32文字のURL安全なゲストトークン (Base64形式: [a-zA-Z0-9_-]{32})
 */
export function generateGuestToken(): string {
  const bytes = generateRandomBytes(24);
  return toBase64UrlSafe(bytes);
}
