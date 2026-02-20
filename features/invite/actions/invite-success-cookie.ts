import { cookies } from "next/headers";

import { type ActionResult, ok } from "@core/errors/adapters/server-actions";

/**
 * 申込成功状態を示す HttpOnly クッキーを削除するサーバーアクション
 * - 対象パスは特定の招待トークンページに限定
 * - クッキー値自体は扱わず、同名・同パスで期限切れを上書き
 */
export async function dismissInviteSuccessAction(inviteToken: string): Promise<ActionResult> {
  const cookieStore = await cookies();
  try {
    cookieStore.set("invite_success", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: `/invite/${inviteToken}`,
      expires: new Date(0),
    });
  } catch {
    // 失敗してもUX優先でエラーは返さない（サイレント）
  }
  return ok(undefined);
}
