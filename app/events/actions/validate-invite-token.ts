"use server";

import {
  validateInviteToken,
  type InviteValidationResult,
  type EventDetail,
} from "@/lib/utils/invite-token";

export interface ServerActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

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
      return {
        success: false,
        error: "招待トークンが必要です",
      };
    }

    // 招待トークンを検証
    const result: InviteValidationResult = await validateInviteToken(token);

    if (!result.isValid || !result.event) {
      return {
        success: false,
        error: result.errorMessage || "無効な招待リンクです",
      };
    }

    // イベントは有効だが参加登録できない場合、エラーを返す
    if (!result.canRegister) {
      return {
        success: false,
        error: result.errorMessage || "このイベントには参加できません",
      };
    }

    return {
      success: true,
      data: {
        event: result.event,
        isValid: result.isValid,
        canRegister: result.canRegister,
      },
    };
  } catch (error) {
    // エラーログは本番環境では適切なログシステムを使用
    return {
      success: false,
      error: "招待リンクの検証中にエラーが発生しました",
    };
  }
}
