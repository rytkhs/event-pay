/**
 * イベント認証・権限チェック共通処理
 * 複数のアクション関数で使用される認証・権限確認処理を統一
 */

import { redirect } from "next/navigation";

import type { User } from "@supabase/supabase-js";

import { createServerActionSupabaseClient } from "@core/supabase/factory";
import { validateEventId } from "@core/validation/event-id";

/**
 * イベントアクセス確認の戻り値型
 */
interface EventAccessResult {
  user: User;
  eventId: string;
}

/**
 * イベントへのアクセス権限を確認する共通関数
 * @param eventId - 確認対象のイベントID
 * @returns Promise<EventAccessResult> - 認証済みユーザー情報と検証済みイベントID
 * @throws Error - 認証失敗、権限なし、不正なイベントIDなどの場合
 */
export async function verifyEventAccess(eventId: string): Promise<EventAccessResult> {
  // イベントIDのバリデーション
  const validation = validateEventId(eventId);
  if (!validation.success || !validation.data) {
    throw new Error("無効なイベントID形式です。");
  }

  const validatedEventId = validation.data;
  const supabase = await createServerActionSupabaseClient();

  // 認証確認
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
    // TypeScriptの型エラーを防ぐため、redirectの後でもthrowする
    throw new Error("Authentication required");
  }

  // イベントが自分のものかどうか確認
  const { data: eventDetail, error: eventError } = await supabase
    .from("events")
    .select("id, created_by")
    .eq("id", validatedEventId)
    .eq("created_by", user.id)
    .single();

  if (eventError || !eventDetail) {
    throw new Error("Event not found or access denied");
  }

  return { user, eventId: validatedEventId };
}

/**
 * データベースエラーをログ出力し、適切なエラーメッセージを生成する
 * @param error - Supabaseエラーオブジェクト
 * @param context - エラー発生時のコンテキスト情報
 * @throws Error - データベースエラーメッセージ
 */
export function handleDatabaseError(
  error: { message: string; code?: string },
  _context: { eventId: string; userId: string }
) {
  throw new Error(`Database error: ${error.message} (Code: ${error.code})`);
}
