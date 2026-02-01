import { type ActionResult, fail, ok } from "@core/errors/adapters/server-actions";
import {
  validateInviteToken,
  type InviteValidationResult,
  type EventDetail,
} from "@core/utils/invite-token";

// 型は ActionResult を使用

export interface ValidateInviteTokenData {
  event: EventDetail;
  isValid: boolean;
  canRegister: boolean;
}

/**
 * 招待トークンを検証し、イベントデータを取得するサーバーアクション
 */
export async function validateInviteTokenAction(
  token: string
): Promise<ActionResult<ValidateInviteTokenData>> {
  try {
    // 入力検証
    if (!token || typeof token !== "string") {
      return fail("MISSING_PARAMETER", { userMessage: "招待トークンが必要です" });
    }

    // 招待トークンを検証
    const result: InviteValidationResult = await validateInviteToken(token);

    if (!result.isValid || !result.event) {
      return fail("INVITE_TOKEN_INVALID", {
        userMessage: result.errorMessage || "無効な招待リンクです",
      });
    }

    // イベントは有効だが参加登録できない場合、エラーを返す
    if (!result.canRegister) {
      return fail("REGISTRATION_DEADLINE_PASSED", {
        userMessage: result.errorMessage || "このイベントには参加できません",
      });
    }

    return ok({
      event: result.event,
      isValid: result.isValid,
      canRegister: result.canRegister,
    });
  } catch (_error) {
    // エラーログは本番環境では適切なログシステムを使用
    return fail("INTERNAL_ERROR", {
      userMessage: "招待リンクの検証中にエラーが発生しました",
      retryable: true,
    });
  }
}
