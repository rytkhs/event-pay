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
      // RLSポリシーが自動的にguest_tokenでフィルタリング
      const { data: attendance, error } = await clientWithGuestToken
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
          )
        `
        )
        .single(); // RLSにより該当する1件のみが取得される

      if (error || !attendance) {
        return {
          isValid: false,
          errorMessage: "参加データが見つかりません",
          canModify: false,
          errorCode: "TOKEN_NOT_FOUND" as const,
        };
      }

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
 *   guest_token = current_setting('request.headers.x-guest-token', true)
 * )
 * WITH CHECK (
 *   guest_token = current_setting('request.headers.x-guest-token', true)
 * );
 */
