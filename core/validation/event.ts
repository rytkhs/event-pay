import { z } from "zod";

import { parseFee } from "@core/utils/number-parsers";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { isUtcDateFuture, convertDatetimeLocalToUtc } from "@core/utils/timezone";

import type { Database } from "@/types/database";

// 決済方法の定数（無料イベントは参加費0円で判定）
const PAYMENT_METHODS: Database["public"]["Enums"]["payment_method_enum"][] = ["stripe", "cash"];

// 型ガード関数（型安全性強化）
function isValidPaymentMethod(
  method: string
): method is Database["public"]["Enums"]["payment_method_enum"] {
  return PAYMENT_METHODS.includes(method as Database["public"]["Enums"]["payment_method_enum"]);
}

// 強化されたバリデーション用のヘルパー関数（date-fns-tz統一）
const validateFutureDate = (val: string) => {
  if (!val) return false;
  try {
    const utcDate = convertDatetimeLocalToUtc(val);
    return isUtcDateFuture(utcDate);
  } catch {
    return false;
  }
};

const validateOptionalFutureDate = (val: string) => {
  if (!val) return true;
  try {
    const utcDate = convertDatetimeLocalToUtc(val);
    return isUtcDateFuture(utcDate);
  } catch {
    return false;
  }
};

const validatePositiveNumber = (val: string) => {
  if (!val) return false;
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 && num <= 1000000;
};

const validateOptionalPositiveNumber = (val: string) => {
  if (!val) return true;
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 && num <= 1000000;
};

const validateCapacity = (val: string) => {
  if (!val) return true;
  const capacity = Number(val);
  return Number.isFinite(capacity) && capacity >= 1 && capacity <= 10000;
};

// 文字列の長さと内容を検証
const validateTitle = (val: string) => {
  return val && val.trim().length > 0 && val.length <= 100;
};

const validateOptionalText = (val: string, maxLength: number) => {
  if (!val) return true;
  return val.length <= maxLength;
};

// より具体的なエラーメッセージを返す検証関数
const validatePaymentMethodsWithMessage = (methods: string[]) => {
  if (!methods || methods.length === 0) return "決済方法を選択してください";

  // 全ての決済方法が有効かチェック
  if (!methods.every((method) => isValidPaymentMethod(method)))
    return "有効な決済方法を選択してください";

  // 重複を除いて最低1つの決済方法が必要
  if ([...new Set(methods)].length === 0) return "決済方法を選択してください";

  return true;
};

export const createEventSchema = z
  .object({
    title: z
      .string()
      .min(1, "タイトルは必須です")
      .max(100, "タイトルは100文字以内で入力してください")
      .refine(validateTitle, "タイトルは1文字以上100文字以内で入力してください")
      .transform((val) => sanitizeForEventPay(val.trim())),

    date: z
      .string()
      .min(1, "開催日時は必須です")
      .transform((val) => sanitizeForEventPay(val.trim())) // XSS対策
      .refine(validateFutureDate, "開催日時は現在時刻より後である必要があります"),

    fee: z
      .string()
      .min(1, "参加費は必須です")
      .transform((val) => sanitizeForEventPay(val.trim())) // XSS対策
      .refine(validatePositiveNumber, "参加費は0以上1000000以下である必要があります")
      .transform((val) => Number(val)),

    payment_methods: z
      .array(z.string())
      .default([])
      .transform((methods) => {
        // 配列の各要素をバリデーションし、重複を除去
        return [...new Set(methods.filter(isValidPaymentMethod))];
      }),

    location: z
      .string()
      .max(200, "場所は200文字以内で入力してください")
      .refine((val) => validateOptionalText(val, 200), "場所は200文字以内で入力してください")
      .transform((val) => (val ? sanitizeForEventPay(val.trim()) : val))
      .optional(),

    description: z
      .string()
      .max(1000, "説明は1000文字以内で入力してください")
      .refine((val) => validateOptionalText(val, 1000), "説明は1000文字以内で入力してください")
      .transform((val) => (val ? sanitizeForEventPay(val.trim()) : val))
      .optional(),

    capacity: z
      .string()
      .transform((val) => (val ? sanitizeForEventPay(val.trim()) : val)) // XSS対策
      .refine(validateCapacity, "定員は1以上10000以下である必要があります")
      .transform((val) => (val ? Number(val) : null))
      .optional(),

    registration_deadline: z
      .string()
      .transform((val) => (val ? sanitizeForEventPay(val.trim()) : val)) // XSS対策
      // 作成時は未来必須（仕様）
      .refine(
        (val) => (val ? validateOptionalFutureDate(val) : true),
        "参加申込締切は現在時刻より後である必要があります"
      )
      .optional(),

    payment_deadline: z
      .string()
      .transform((val) => (val ? sanitizeForEventPay(val.trim()) : val)) // XSS対策
      // 作成時は未来必須（仕様）
      .refine(
        (val) => (val ? validateOptionalFutureDate(val) : true),
        "オンライン決済締切は現在時刻より後である必要があります"
      )
      .optional(),

    // 締切後のオンライン決済許可（UIは未対応でもサーバーで受け入れ可能に）
    allow_payment_after_deadline: z.boolean().optional().default(false),

    // 猶予（日）: 0〜30日（DB CHECK と整合）
    grace_period_days: z
      .union([z.string(), z.number()])
      .transform((v) => {
        if (v === undefined || v === null || v === "") return 0;
        const n = typeof v === "string" ? Number(v) : v;
        return Number.isFinite(n) ? Number(n) : 0;
      })
      .refine((n) => n >= 0 && n <= 30, "猶予（日）は0〜30の範囲で指定してください")
      .default(0),
  })
  .refine(
    (data) => {
      // 参加申込締切が開催日時以前であることを確認（date-fns-tz統一）
      if (data.registration_deadline && data.date) {
        try {
          const regUtcDate = convertDatetimeLocalToUtc(data.registration_deadline);
          const eventUtcDate = convertDatetimeLocalToUtc(data.date);
          return regUtcDate <= eventUtcDate;
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "参加申込締切は開催日時以前に設定してください",
      path: ["registration_deadline"],
    }
  )
  .refine(
    (data) => {
      // 決済締切が参加申込締切以降であることを確認（date-fns-tz統一）
      if (data.registration_deadline && data.payment_deadline) {
        try {
          const payUtcDate = convertDatetimeLocalToUtc(data.payment_deadline);
          const regUtcDate = convertDatetimeLocalToUtc(data.registration_deadline);
          return payUtcDate >= regUtcDate; // 包括比較
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "決済締切は参加申込締切以降に設定してください",
      path: ["payment_deadline"],
    }
  )
  .refine(
    (data) => {
      // 決済締切の上限: payment_deadline <= date + 30日（包括比較, nullはUIでdateを初期値表示）
      if (data.payment_deadline && data.date) {
        try {
          const payUtcDate = convertDatetimeLocalToUtc(data.payment_deadline);
          const eventUtcDate = convertDatetimeLocalToUtc(data.date);
          const eventPlus30d = new Date(eventUtcDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          return payUtcDate <= eventPlus30d; // 包括比較
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "オンライン決済締切は開催日時から30日以内に設定してください",
      path: ["payment_deadline"],
    }
  )
  .refine(
    (data) => {
      // 猶予ON時: final_payment_limit <= date + 30日 を満たすように grace_period_days を制限
      if (data.allow_payment_after_deadline && data.date) {
        try {
          const baseUtc = data.payment_deadline
            ? convertDatetimeLocalToUtc(data.payment_deadline)
            : convertDatetimeLocalToUtc(data.date); // effective_payment_deadline
          const eventUtcDate = convertDatetimeLocalToUtc(data.date);
          const finalCandidate = new Date(
            baseUtc.getTime() + (Number(data.grace_period_days) || 0) * 24 * 60 * 60 * 1000
          );
          const eventPlus30d = new Date(eventUtcDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          return finalCandidate <= eventPlus30d; // 包括比較
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "猶予を含む最終支払期限は開催日時から30日以内にしてください",
      path: ["grace_period_days"],
    }
  )
  .refine(
    (data) => {
      // 参加費1円以上の場合は決済方法が必須
      if (data.fee > 0) {
        return data.payment_methods.length > 0;
      }
      // 参加費0円の場合は決済方法は任意（空配列でもOK）
      return true;
    },
    {
      message: "有料イベントでは決済方法の選択が必要です",
      path: ["payment_methods"],
    }
  );

// 更新用のスキーマ（全フィールドをoptionalに、より柔軟なバリデーション）
export const updateEventSchema = z
  .object({
    title: z
      .string()
      .min(1, "タイトルが空です")
      .max(100, "タイトルは100文字以内で入力してください")
      .refine((val) => val.trim().length > 0, "タイトルは必須です")
      .transform((val) => sanitizeForEventPay(val.trim()))
      .optional(),

    date: z
      .string()
      .min(1, "開催日時が空です")
      .refine(validateFutureDate, "開催日時は現在時刻より後である必要があります")
      .optional(),

    fee: z
      .string()
      .refine(validateOptionalPositiveNumber, "参加費は0以上1000000以下である必要があります")
      .transform((val) => (val ? Number(val) : undefined))
      .optional(),

    payment_methods: z
      .array(z.string())
      .refine(
        (methods) => {
          const result = validatePaymentMethodsWithMessage(methods);
          return result === true;
        },
        (methods) => ({
          message: validatePaymentMethodsWithMessage(methods) as string,
        })
      )
      .transform((methods) => {
        // 型安全な変換: string[] → payment_method_enum[]
        const uniqueMethods = [...new Set(methods)]; // 重複を除去
        return uniqueMethods.filter(isValidPaymentMethod);
      })
      .optional(),

    location: z
      .string()
      .max(200, "場所は200文字以内で入力してください")
      .refine((val) => validateOptionalText(val, 200), "場所は200文字以内で入力してください")
      .transform((val) => {
        // 空文字やundefinedでも必ずサニタイズを実行
        const sanitized = sanitizeForEventPay(val || "");
        return sanitized.trim() ? sanitized : null;
      })
      .optional(),

    description: z
      .string()
      .max(1000, "説明は1000文字以内で入力してください")
      .refine((val) => validateOptionalText(val, 1000), "説明は1000文字以内で入力してください")
      .transform((val) => {
        // 空文字やundefinedでも必ずサニタイズを実行
        const sanitized = sanitizeForEventPay(val || "");
        return sanitized.trim() ? sanitized : null;
      })
      .optional(),

    capacity: z
      .string()
      .refine(validateCapacity, "定員は1以上10000以下である必要があります")
      .transform((val) => (val ? Number(val) : null))
      .optional(),

    registration_deadline: z
      .string()
      // 編集では過去日時も保存可能（運用整備用）。現在時刻チェックは行わない。
      .optional(),

    payment_deadline: z
      .string()
      // 編集では過去日時も保存可能（運用整備用）。現在時刻チェックは行わない。
      .optional(),

    allow_payment_after_deadline: z.boolean().optional(),
    grace_period_days: z
      .union([z.string(), z.number()])
      .transform((v) => {
        if (v === undefined || v === null || v === "") return undefined;
        const n = typeof v === "string" ? Number(v) : v;
        return Number.isFinite(n) ? Number(n) : 0;
      })
      .refine((n) => n === undefined || (n >= 0 && n <= 30), "猶予（日）は0〜30の範囲")
      .optional(),
  })
  .refine(
    (data) => {
      // 参加申込締切が開催日時以前であることを確認（date-fns-tz統一）
      if (data.registration_deadline && data.date) {
        try {
          const regUtcDate = convertDatetimeLocalToUtc(data.registration_deadline);
          const eventUtcDate = convertDatetimeLocalToUtc(data.date);
          return regUtcDate <= eventUtcDate;
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "参加申込締切は開催日時以前に設定してください",
      path: ["registration_deadline"],
    }
  )
  .refine(
    (data) => {
      // 決済締切が参加申込締切以降であることを確認（date-fns-tz統一）
      if (data.registration_deadline && data.payment_deadline) {
        try {
          const payUtcDate = convertDatetimeLocalToUtc(data.payment_deadline);
          const regUtcDate = convertDatetimeLocalToUtc(data.registration_deadline);
          return payUtcDate >= regUtcDate; // 包括比較
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "決済締切は参加申込締切以降に設定してください",
      path: ["payment_deadline"],
    }
  )
  .refine(
    (data) => {
      // 上限チェック: payment_deadline <= date + 30日
      if (data.payment_deadline && data.date) {
        try {
          const payUtcDate = convertDatetimeLocalToUtc(data.payment_deadline);
          const eventUtcDate = convertDatetimeLocalToUtc(data.date);
          const eventPlus30d = new Date(eventUtcDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          return payUtcDate <= eventPlus30d; // 包括比較
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "オンライン決済締切は開催日時から30日以内に設定してください",
      path: ["payment_deadline"],
    }
  )
  .refine(
    (data) => {
      // 猶予ON時: final_payment_limit <= date + 30日
      if (data.allow_payment_after_deadline && data.date) {
        try {
          const baseUtc = data.payment_deadline
            ? convertDatetimeLocalToUtc(data.payment_deadline)
            : convertDatetimeLocalToUtc(data.date);
          const eventUtcDate = convertDatetimeLocalToUtc(data.date);
          const grace = Number(data.grace_period_days ?? 0) || 0;
          const finalCandidate = new Date(baseUtc.getTime() + grace * 24 * 60 * 60 * 1000);
          const eventPlus30d = new Date(eventUtcDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          return finalCandidate <= eventPlus30d; // 包括比較
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "猶予を含む最終支払期限は開催日時から30日以内にしてください",
      path: ["grace_period_days"],
    }
  )
  .refine(
    (data) => {
      // 参加費が設定されている場合のみチェック（編集では部分更新）
      if (data.fee !== undefined && data.payment_methods !== undefined) {
        const fee = typeof data.fee === "number" ? data.fee : parseFee(String(data.fee || ""));
        // 無料イベント（fee=0）の場合は決済方法不要
        if (fee === 0) return true;
        // 有料イベント（fee≥1）の場合は決済方法必須
        return data.payment_methods.length > 0;
      }
      return true;
    },
    {
      message: "有料イベントでは決済方法の選択が必要です",
      path: ["payment_methods"],
    }
  );

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type UpdateEventFormData = z.input<typeof updateEventSchema>;

// 日付フィルター用のバリデーションスキーマ（強化版）
const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;

export const dateFilterSchema = z
  .object({
    start: z
      .string()
      .optional()
      .refine((val) => {
        if (!val) return true;
        return dateFormatRegex.test(val);
      }, "開始日はYYYY-MM-DD形式で入力してください")
      .refine((val) => {
        if (!val) return true;
        // 日付文字列の形式チェック（date-fns-tz統一）
        return dateFormatRegex.test(val);
      }, "有効な開始日を入力してください"),

    end: z
      .string()
      .optional()
      .refine((val) => {
        if (!val) return true;
        return dateFormatRegex.test(val);
      }, "終了日はYYYY-MM-DD形式で入力してください")
      .refine((val) => {
        if (!val) return true;
        // 日付文字列の形式チェック（date-fns-tz統一）
        return dateFormatRegex.test(val);
      }, "有効な終了日を入力してください"),
  })
  .refine(
    (data) => {
      // 開始日が終了日より前であることを確認（date-fns-tz統一）
      if (data.start && data.end) {
        // 日付文字列を直接比較（YYYY-MM-DD形式）
        return data.start <= data.end;
      }
      return true;
    },
    {
      message: "開始日は終了日以前に設定してください",
      path: ["start"],
    }
  );

export type DateFilterInput = z.infer<typeof dateFilterSchema>;
