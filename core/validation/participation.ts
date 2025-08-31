import { z } from "zod";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
import { logSanitizationEvent, logValidationFailure } from "@/lib/security/security-logger";



// 招待トークンの検証スキーマ
const inviteTokenSchema = z
  .string()
  .length(32, "無効な招待トークンの形式です")
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
export const attendanceStatusSchema = z.enum(["attending", "not_attending", "maybe"], {
  errorMap: () => ({ message: "有効な参加ステータスを選択してください" }),
});

// 決済方法の検証スキーマ（参加ステータスが"attending"かつ有料の場合のみ必須）
export const paymentMethodSchema = z
  .enum(["stripe", "cash"], {
    errorMap: () => ({ message: "有効な決済方法を選択してください" }),
  })
  .optional();

// 参加フォームの基本検証スキーマ
export const participationFormSchema = z
  .object({
    inviteToken: inviteTokenSchema,
    nickname: nicknameSchema,
    email: emailSchema,
    attendanceStatus: attendanceStatusSchema,
    paymentMethod: paymentMethodSchema,
  })
  .refine(
    (data) => {
      // 参加ステータスが"attending"の場合は決済方法が必須（無料イベントは除く）
      if (data.attendanceStatus === "attending") {
        return data.paymentMethod !== undefined;
      }
      return true;
    },
    {
      message: "参加を選択した場合は決済方法を選択してください",
      path: ["paymentMethod"],
    }
  );

// 参加フォームデータの型定義
export type ParticipationFormData = z.infer<typeof participationFormSchema>;

// 参加フォームの検証エラー型
interface ParticipationValidationErrors {
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
 * @param request リクエスト情報（ログ用）
 * @returns 検証エラー
 */
export const validateParticipationField = (
  name: keyof ParticipationFormData,
  value: string,
  formData?: Partial<ParticipationFormData>,
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
        // 参加ステータスが変更された場合、決済方法の要否をチェック
        if (value === "attending" && formData && !formData.paymentMethod) {
          errors.paymentMethod = "参加を選択した場合は決済方法を選択してください";
        }
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
      errors[name] = errorMessage;

      // バリデーション失敗をログに記録
      if (request) {
        logValidationFailure(name, errorMessage, value, request);
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
        errors[fieldPath] = errorMessage;

        // バリデーション失敗をログに記録
        if (request) {
          const fieldValue = formData[fieldPath];
          logValidationFailure(
            fieldPath,
            errorMessage,
            typeof fieldValue === "string" ? fieldValue : undefined,
            { ...request, eventId }
          );
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
    if (request) {
      logSanitizationEvent(trimmed, sanitized, "nickname", request);
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
    if (request) {
      logSanitizationEvent(normalized, sanitized, "email", request);
    }

    return sanitized;
  },
};
