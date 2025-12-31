import { z } from "zod";

import { logger } from "@core/logging/app-logger";
import { sanitizeForEventPay } from "@core/utils/sanitize";

// 招待トークンの検証スキーマ
const inviteTokenSchema = z
  .string()
  .min(32, "招待トークンが短すぎます")
  .max(64, "招待トークンが長すぎます")
  .regex(/^[a-zA-Z0-9_-]+$/, "無効な招待トークンの文字です");

// ニックネームの検証スキーマ
const nicknameSchema = z
  .string()
  .min(1, "ニックネームを入力してください")
  .max(50, "ニックネームは50文字以内で入力してください")
  .refine((val) => val.trim().length > 0, "ニックネームを入力してください")
  .transform((val) => sanitizeForEventPay(val.trim()));

// メールアドレスの検証スキーマ
const emailSchema = z
  .string()
  .transform((val) => val.trim().toLowerCase())
  .pipe(
    z
      .string()
      .email("有効なメールアドレスを入力してください")
      .max(255, "メールアドレスは255文字以内で入力してください")
      .transform((val) => sanitizeForEventPay(val))
  );

// 参加ステータスの検証スキーマ
export const attendanceStatusSchema = z
  .string()
  .refine((val) => val === "" || ["attending", "not_attending", "maybe"].includes(val), {
    message: "参加ステータスを選択してください",
  })
  .refine((val) => val !== "", {
    message: "参加ステータスを選択してください",
  })
  .transform((val) => val as "attending" | "not_attending" | "maybe");

// 決済方法の検証スキーマ（参加ステータスが"attending"かつ有料の場合のみ必須）
export const paymentMethodSchema = z
  .string()
  .refine((val) => val === "" || ["stripe", "cash"].includes(val), {
    message: "有効な決済方法を選択してください",
  })
  .transform((val) => (val === "" ? undefined : (val as "stripe" | "cash")))
  .optional();

// 参加フォームの基本検証スキーマ（動的バリデーション用）
export const createParticipationFormSchema = (
  eventFee: number = 0
): z.ZodEffects<
  z.ZodObject<{
    inviteToken: typeof inviteTokenSchema;
    nickname: typeof nicknameSchema;
    email: typeof emailSchema;
    attendanceStatus: typeof attendanceStatusSchema;
    paymentMethod: typeof paymentMethodSchema;
  }>
> => {
  return z
    .object({
      inviteToken: inviteTokenSchema,
      nickname: nicknameSchema,
      email: emailSchema,
      attendanceStatus: attendanceStatusSchema,
      paymentMethod: paymentMethodSchema,
    })
    .refine(
      (data) => {
        // 参加ステータスが"attending"かつ有料イベントの場合のみ決済方法が必須
        if (data.attendanceStatus === "attending" && eventFee > 0) {
          return data.paymentMethod !== undefined;
        }
        return true;
      },
      {
        message: "参加を選択した場合は決済方法を選択してください",
        path: ["paymentMethod"],
      }
    );
};

// 後方互換性のための基本スキーマ（無料イベント用）
export const participationFormSchema = createParticipationFormSchema(0);

// 参加フォームデータの型定義（動的スキーマ対応）
export type ParticipationFormData = {
  inviteToken: string;
  nickname: string;
  email: string;
  attendanceStatus: "attending" | "not_attending" | "maybe";
  paymentMethod?: "stripe" | "cash" | undefined;
};

// 型生成のためのヘルパー関数（動的スキーマ用）
export type ParticipationFormDataForEventFee<T extends number> = T extends 0
  ? ParticipationFormData & { paymentMethod?: undefined }
  : ParticipationFormData & { paymentMethod: "stripe" | "cash" };

// 後方互換性のための静的型（無料イベント用）
// export type ParticipationFormDataStatic = z.infer<typeof participationFormSchema>;

// 参加フォームの検証エラー型
interface ParticipationValidationErrors {
  [key: string]: string | undefined;
  inviteToken?: string;
  nickname?: string;
  email?: string;
  attendanceStatus?: string;
  paymentMethod?: string;
  general?: string;
}

/**
 * 参加フォームの個別フィールド検証（セキュリティログ付き）
 * @param name フィールド名
 * @param value フィールドの値
 * @param formData 全体のフォームデータ（相関チェック用）
 * @param eventFee イベント参加費（決済方法の必須判定用）
 * @param request リクエスト情報（ログ用）
 * @returns 検証エラー
 */
export const validateParticipationField = (
  name: keyof ParticipationFormData,
  value: string,
  formData?: Partial<ParticipationFormData>,
  _eventFee: number = 0,
  request?: {
    userAgent?: string;
    ip?: string;
    eventId?: string;
  }
): ParticipationValidationErrors => {
  const errors: ParticipationValidationErrors = {};

  try {
    switch (name) {
      case "inviteToken":
        inviteTokenSchema.parse(value);
        break;
      case "nickname":
        nicknameSchema.parse(value);
        break;
      case "email":
        emailSchema.parse(value);
        break;
      case "attendanceStatus":
        attendanceStatusSchema.parse(value);
        break;
      case "paymentMethod":
        if (value) {
          paymentMethodSchema.parse(value);
        }
        break;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors[0].message;
      errors[name as string] = errorMessage;

      // バリデーション失敗をログに記録
      if (request) {
        logger.warn("Validation failed", {
          category: "system",
          action: "validation_failed",
          actor_type: "anonymous",
          field_name: String(name),
          error_message: errorMessage,
          input_length: value?.length,
          user_agent: request.userAgent,
          ip: request.ip,
          event_id: request.eventId,
          outcome: "failure",
        });
      }
    }
  }

  return errors;
};

/**
 * メールアドレスの重複チェック付き検証（セキュリティログ付き）
 * @param formData フォームデータ
 * @param eventId イベントID
 * @param request リクエスト情報（ログ用）
 * @returns 検証エラー（重複チェック含む）
 */
export const validateParticipationFormWithDuplicateCheck = async (
  formData: ParticipationFormData,
  eventId: string,
  request?: {
    userAgent?: string;
    ip?: string;
  }
): Promise<ParticipationValidationErrors> => {
  // 基本検証
  let errors: ParticipationValidationErrors = {};
  try {
    participationFormSchema.parse(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        const fieldPath = err.path[0] as keyof ParticipationFormData;
        const errorMessage = err.message;
        errors[fieldPath as string] = errorMessage;

        // バリデーション失敗をログに記録
        if (request) {
          const fieldValue = formData[fieldPath];
          logger.warn("Validation failed", {
            category: "system",
            action: "validation_failed",
            actor_type: "anonymous",
            field_name: String(fieldPath),
            error_message: errorMessage,
            input_length: typeof fieldValue === "string" ? fieldValue.length : undefined,
            user_agent: request.userAgent,
            ip: request.ip,
            event_id: eventId,
            outcome: "failure",
          });
        }
      });
    } else {
      errors = { general: "予期しないエラーが発生しました" };
    }
  }

  // 基本検証でエラーがある場合は重複チェックをスキップ
  if (Object.keys(errors).length > 0) {
    return errors;
  }

  // 重複チェックはサーバーサイドで実行される
  // クライアントサイドでは実行しない

  return errors;
};

// 入力サニタイゼーション用のユーティリティ関数
export const sanitizeParticipationInput = {
  /**
   * ニックネームのサニタイゼーション（セキュリティログ付き）
   * @param nickname 入力されたニックネーム
   * @param request リクエスト情報（ログ用）
   * @returns サニタイズされたニックネーム
   */
  nickname: (
    nickname: string,
    request?: {
      userAgent?: string;
      ip?: string;
      eventId?: string;
    }
  ): string => {
    if (!nickname) return "";

    const trimmed = nickname.trim();
    const sanitized = sanitizeForEventPay(trimmed);

    // サニタイゼーションログを記録
    if (request && trimmed !== sanitized) {
      logger.info("Sanitization applied", {
        category: "system",
        action: "sanitization_applied",
        actor_type: "anonymous",
        field_name: "nickname",
        original_length: trimmed.length,
        sanitized_length: sanitized.length,
        user_agent: request.userAgent,
        ip: request.ip,
        event_id: request.eventId,
        outcome: "success",
      });
    }

    return sanitized;
  },

  /**
   * メールアドレスのサニタイゼーション（セキュリティログ付き）
   * @param email 入力されたメールアドレス
   * @param request リクエスト情報（ログ用）
   * @returns サニタイズされたメールアドレス
   */
  email: (
    email: string,
    request?: {
      userAgent?: string;
      ip?: string;
      eventId?: string;
    }
  ): string => {
    if (!email) return "";

    const normalized = email.trim().toLowerCase();
    const sanitized = sanitizeForEventPay(normalized);

    // サニタイゼーションログを記録
    if (request && normalized !== sanitized) {
      logger.info("Sanitization applied", {
        category: "system",
        action: "sanitization_applied",
        actor_type: "anonymous",
        field_name: "email",
        original_length: normalized.length,
        sanitized_length: sanitized.length,
        user_agent: request.userAgent,
        ip: request.ip,
        event_id: request.eventId,
        outcome: "success",
      });
    }

    return sanitized;
  },
};
