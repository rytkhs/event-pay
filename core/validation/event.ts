import { z } from "zod";

import { isValidPaymentMethod } from "@core/constants/statuses";
import { parseFee } from "@core/utils/number-parsers";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { isUtcDateFuture, convertDatetimeLocalToUtc } from "@core/utils/timezone";

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

// （旧）数値バリデーションは未使用のため削除

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

export const createEventSchema = z
  .object({
    title: z
      .string()
      .min(1, "イベント名は必須です")
      .max(100, "イベント名は100文字以内で入力してください")
      .refine(validateTitle, "イベント名は1文字以上100文字以内で入力してください")
      .transform((val) => sanitizeForEventPay(val.trim())),

    date: z
      .string()
      .min(1, "開催日時は必須です")
      .transform((val) => sanitizeForEventPay(val.trim())) // XSS対策
      .refine(validateFutureDate, "開催日時は現在時刻より後である必要があります"),

    fee: z
      .string()
      .min(1, "参加費は必須です")
      .regex(/^\d+$/, "参加費は0円（無料）または100〜1,000,000円の整数で入力してください")
      .refine((val: string) => {
        const n = Number(val);
        return Number.isInteger(n) && (n === 0 || (n >= 100 && n <= 1_000_000));
      }, "参加費は0円（無料）または100〜1,000,000円の整数で入力してください")
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
      .transform((val) => {
        // 空文字やundefinedでも必ずサニタイズを実行（updateスキーマと統一）
        const sanitized = sanitizeForEventPay(val || "");
        return sanitized.trim() ? sanitized : null;
      })
      .optional(),

    description: z
      .string()
      .max(1000, "説明は1000文字以内で入力してください")
      .refine((val) => validateOptionalText(val, 1000), "説明は1000文字以内で入力してください")
      .transform((val) => {
        // 空文字やundefinedでも必ずサニタイズを実行（updateスキーマと統一）
        const sanitized = sanitizeForEventPay(val || "");
        return sanitized.trim() ? sanitized : null;
      })
      .optional(),

    capacity: z
      .string()
      .transform((val) => (val ? sanitizeForEventPay(val.trim()) : val)) // XSS対策
      .refine(validateCapacity, "定員は1以上10,000以下である必要があります")
      .transform((val) => (val ? Number(val) : null))
      .optional(),

    registration_deadline: z
      .string()
      .min(1, "参加申込締切が空です")
      .refine((val) => val && val.trim() !== "", "参加申込締切は必須です")
      .transform((val) => sanitizeForEventPay(val.trim())) // XSS対策
      .refine(validateFutureDate, "参加申込締切は現在時刻より後である必要があります")
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
      // オンライン決済選択時は決済締切が必須
      const hasStripe = Array.isArray(data.payment_methods)
        ? data.payment_methods.includes("stripe")
        : false;
      if (hasStripe) {
        return Boolean(data.payment_deadline && String(data.payment_deadline).trim() !== "");
      }
      return true;
    },
    {
      message: "オンライン決済を選択した場合、決済締切は必須です",
      path: ["payment_deadline"],
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
      .min(1, "イベント名が空です")
      .max(100, "イベント名は100文字以内で入力してください")
      .refine((val) => val.trim().length > 0, "イベント名は必須です")
      .transform((val) => sanitizeForEventPay(val.trim()))
      .optional(),

    date: z
      .string()
      .min(1, "開催日時が空です")
      .refine(validateFutureDate, "開催日時は現在時刻より後である必要があります")
      .optional(),

    fee: z
      .string()
      .regex(/^\d+$/, "参加費は0円（無料）または100〜1,000,000円の整数で入力してください")
      .refine((val: string) => {
        if (val === "") return true;
        const n = Number(val);
        return Number.isInteger(n) && (n === 0 || (n >= 100 && n <= 1_000_000));
      }, "参加費は0円（無料）または100〜1,000,000円の整数で入力してください")
      .transform((val) => (val ? Number(val) : undefined))
      .optional(),

    payment_methods: z
      .array(z.string())
      .optional()
      .transform((methods) => {
        // 型安全な変換: string[] → payment_method_enum[]
        if (!methods) return undefined;
        const uniqueMethods = [...new Set(methods)]; // 重複を除去
        return uniqueMethods.filter(isValidPaymentMethod);
      }),

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
      .refine(validateCapacity, "定員は1以上10,000以下である必要があります")
      .transform((val) => (val ? Number(val) : null))
      .optional(),

    registration_deadline: z
      .string()
      .min(1, "参加申込締切が空です")
      .refine((val) => val && val.trim() !== "", "参加申込締切は空文字列では許可されません")
      // 編集では過去日時も保存可能（運用整備用）。現在時刻チェックは行わない。
      // 注意: DBで必須のため、送信する場合は有効な値が必要（空文字列不可）
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
  )
  .refine(
    (data) => {
      // 同一リクエストでStripe有効化する場合は決済締切も同時に必須
      if (Array.isArray(data.payment_methods) && data.payment_methods.includes("stripe")) {
        return typeof data.payment_deadline === "string" && data.payment_deadline.trim() !== "";
      }
      return true;
    },
    {
      message: "オンライン決済を選択した場合、決済締切は必須です",
      path: ["payment_deadline"],
    }
  );
// 更新時は部分更新を考慮し、payment_deadline必須チェックはアクション本体で統合実施
// Zodスキーマでは基本的なバリデーションのみ行う（上記は補助的な早期チェック）

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
