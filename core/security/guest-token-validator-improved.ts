/**
 * 改善されたゲストトークンバリデーター
 * Service Role を使用せず、RLSポリシーに依存した実装
 */

import { createClient } from "@supabase/supabase-js";

export class ImprovedGuestTokenValidator {
  /**
   * RLSポリシーに基づく安全なゲストトークン検証
   * Service Roleを使用しない
   */
  async validateGuestToken(guestToken: string) {
    // X-Guest-Tokenヘッダーを設定した匿名クライアント
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase configuration is missing");
    }

    const clientWithGuestToken = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          "X-Guest-Token": guestToken,
        },
      },
    });

    try {
      // 匿名テーブルSELECTを廃止し、公開RPC経由で取得
      const { data: rpcData, error } = await (clientWithGuestToken as any).rpc(
        "rpc_guest_get_attendance",
        { p_guest_token: guestToken }
      );

      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;

      if (error || !row) {
        return {
          isValid: false,
          errorMessage: "参加データが見つかりません",
          canModify: false,
          errorCode: "TOKEN_NOT_FOUND" as const,
        };
      }

      const attendance = {
        id: row.attendance_id,
        nickname: row.nickname,
        email: row.email,
        status: row.status,
        guest_token: row.guest_token,
        created_at: undefined,
        updated_at: undefined,
        event: {
          id: row.event_id,
          title: row.event_title,
          date: row.event_date,
          fee: row.event_fee,
          created_by: row.created_by,
          registration_deadline: row.registration_deadline,
          payment_deadline: row.payment_deadline,
          canceled_at: row.canceled_at,
        },
      } as any;

      return {
        isValid: true,
        attendance,
        canModify: this.determineCanModify(attendance),
        errorCode: undefined,
      };
    } catch (error) {
      return {
        isValid: false,
        errorMessage: "参加データの取得中にエラーが発生しました",
        canModify: false,
        errorCode: "INTERNAL_ERROR" as const,
      };
    }
  }

  private determineCanModify(attendance: any): boolean {
    // イベント期限などに基づく変更可能性判定
    const event = attendance.event;
    if (!event.registration_deadline) return true;

    const deadline = new Date(event.registration_deadline);
    const now = new Date();

    return now < deadline;
  }
}

/**
 * 必要なRLSポリシー（マイグレーション）:
 *
 * CREATE POLICY "guest_token_access_policy"
 * ON public.attendances
 * FOR ALL
 * TO anon, authenticated
 * USING (
 *   guest_token = current_setting('request.headers', true)::json->>'x-guest-token'
 * )
 * WITH CHECK (
 *   guest_token = current_setting('request.headers', true)::json->>'x-guest-token'
 * );
 */
