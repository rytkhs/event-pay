import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult,
} from "@core/types/server-actions";
import {
  validateInviteToken,
  type InviteValidationResult,
  type EventDetail,
} from "@core/utils/invite-token";

// 型はコアの ServerActionResult を使用

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
): Promise<ServerActionResult<ValidateInviteTokenData>> {
  try {
    // 入力検証
    if (!token || typeof token !== "string") {
      return createServerActionError("MISSING_PARAMETER", "招待トークンが必要です");
    }

    // 招待トークンを検証
    const result: InviteValidationResult = await validateInviteToken(token);

    if (!result.isValid || !result.event) {
      return createServerActionError(
        "INVITE_TOKEN_INVALID",
        result.errorMessage || "無効な招待リンクです"
      );
    }

    // イベントは有効だが参加登録できない場合、エラーを返す
    if (!result.canRegister) {
      return createServerActionError(
        "REGISTRATION_DEADLINE_PASSED",
        result.errorMessage || "このイベントには参加できません"
      );
    }

    return createServerActionSuccess({
      event: result.event,
      isValid: result.isValid,
      canRegister: result.canRegister,
    });
  } catch (_error) {
    // エラーログは本番環境では適切なログシステムを使用
    return createServerActionError("INTERNAL_ERROR", "招待リンクの検証中にエラーが発生しました", {
      retryable: true,
    });
  }
}
