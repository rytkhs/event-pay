import { z } from "zod";
import type { Database } from "@/types/database";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
import { checkDuplicateEmail } from "@/lib/utils/invite-token";

// 参加ステータスの型定義
type AttendanceStatus = Database["public"]["Enums"]["attendance_status_enum"];
type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];

// 招待トークンの検証スキーマ
export const inviteTokenSchema = z.string()
  .length(32, "無効な招待トークンの形式です")
  .regex(/^[a-zA-Z0-9_-]+$/, "無効な招待トークンの文字です");

// ニックネームの検証スキーマ
export const nicknameSchema = z.string()
  .min(1, "ニックネームを入力してください")
  .max(50, "ニックネームは50文字以内で入力してください")
  .refine(
    (val) => val.trim().length > 0,
    "ニックネームを入力してください"
  )
  .transform((val) => sanitizeForEventPay(val.trim()));

// メールアドレスの検証スキーマ
export const emailSchema = z.string()
  .transform((val) => val.trim().toLowerCase())
  .pipe(
    z.string()
      .email("有効なメールアドレスを入力してください")
      .max(255, "メールアドレスは255文字以内で入力してください")
      .transform((val) => sanitizeForEventPay(val))
  );

// 参加ステータスの検証スキーマ
export const attendanceStatusSchema = z.enum(["attending", "not_attending", "maybe"], {
  errorMap: () => ({ message: "有効な参加ステータスを選択してください" }),
});

// 決済方法の検証スキーマ（参加ステータスが"attending"かつ有料の場合のみ必須）
export const paymentMethodSchema = z.enum(["stripe", "cash"], {
  errorMap: () => ({ message: "有効な決済方法を選択してください" }),
}).optional();

// 参加フォームの基本検証スキーマ
export const participationFormSchema = z.object({
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
export interface ParticipationValidationErrors {
  inviteToken?: string;
  nickname?: string;
  email?: string;
  attendanceStatus?: string;
  paymentMethod?: string;
  general?: string;
}

/**
 * 参加フォームの個別フィールド検証
 * @param name フィールド名
 * @param value フィールドの値
 * @param formData 全体のフォームデータ（相関チェック用）
 * @returns 検証エラー
 */
export const validateParticipationField = (
  name: keyof ParticipationFormData,
  value: string,
  formData?: Partial<ParticipationFormData>
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
      errors[name] = error.errors[0].message;
    }
  }

  return errors;
};

/**
 * 参加フォーム全体の検証
 * @param formData フォームデータ
 * @returns 検証エラー
 */
export const validateParticipationForm = (
  formData: ParticipationFormData
): ParticipationValidationErrors => {
  try {
    participationFormSchema.parse(formData);
    return {};
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: ParticipationValidationErrors = {};
      error.errors.forEach((err) => {
        const fieldPath = err.path[0] as keyof ParticipationFormData;
        errors[fieldPath] = err.message;
      });
      return errors;
    }
    return { general: "予期しないエラーが発生しました" };
  }
};

/**
 * メールアドレスの重複チェック付き検証
 * @param formData フォームデータ
 * @param eventId イベントID
 * @returns 検証エラー（重複チェック含む）
 */
export const validateParticipationFormWithDuplicateCheck = async (
  formData: ParticipationFormData,
  eventId: string
): Promise<ParticipationValidationErrors> => {
  // 基本検証
  const errors = validateParticipationForm(formData);

  // 基本検証でエラーがある場合は重複チェックをスキップ
  if (Object.keys(errors).length > 0) {
    return errors;
  }

  // メールアドレスの重複チェック（正規化されたメールアドレスを使用）
  try {
    const normalizedEmail = sanitizeParticipationInput.email(formData.email);
    const isDuplicate = await checkDuplicateEmail(eventId, normalizedEmail);
    if (isDuplicate) {
      errors.email = "このメールアドレスは既に登録されています";
    }
  } catch (_error) {
    errors.general = "登録の確認中にエラーが発生しました";
  }

  return errors;
};

// 入力サニタイゼーション用のユーティリティ関数
export const sanitizeParticipationInput = {
  /**
   * ニックネームのサニタイゼーション
   * @param nickname 入力されたニックネーム
   * @returns サニタイズされたニックネーム
   */
  nickname: (nickname: string): string => {
    if (!nickname) return "";
    return sanitizeForEventPay(nickname.trim());
  },

  /**
   * メールアドレスのサニタイゼーション
   * @param email 入力されたメールアドレス
   * @returns サニタイズされたメールアドレス
   */
  email: (email: string): string => {
    if (!email) return "";
    return sanitizeForEventPay(email.trim().toLowerCase());
  },
};

// エクスポート用の型定義
export type {
  AttendanceStatus,
  PaymentMethod,
};