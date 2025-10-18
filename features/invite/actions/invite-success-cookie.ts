"use server";

import { cookies } from "next/headers";

import { getEnv } from "@core/utils/cloudflare-env";

/**
 * 申込成功状態を示す HttpOnly クッキーを削除するサーバーアクション
 * - 対象パスは特定の招待トークンページに限定
 * - クッキー値自体は扱わず、同名・同パスで期限切れを上書き
 */
export async function dismissInviteSuccessAction(inviteToken: string): Promise<{ ok: true }> {
  const cookieStore = cookies();
  try {
    cookieStore.set("invite_success", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: getEnv().NODE_ENV === "production",
      path: `/invite/${inviteToken}`,
      expires: new Date(0),
    });
  } catch {
    // 失敗してもUX優先でエラーは返さない（サイレント）
  }
  return { ok: true };
}
