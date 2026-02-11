import { z } from "zod";

import type { Event } from "@core/types/models";
import { parseFee, safeParseNumber } from "@core/utils/number-parsers";
import { convertDatetimeLocalToUtc, isUtcDateFuture } from "@core/utils/timezone";

const hasStripePaymentMethod = (paymentMethods: string[] | undefined): boolean => {
  return Array.isArray(paymentMethods) ? paymentMethods.includes("stripe") : false;
};

const isRegistrationDeadlineBeforeEventDate = (
  registrationDeadline: string | undefined,
  date: string | undefined
): boolean => {
  if (!registrationDeadline || registrationDeadline.trim() === "" || !date) return true;
  try {
    const regUtc = convertDatetimeLocalToUtc(registrationDeadline);
    const eventUtc = convertDatetimeLocalToUtc(date);
    return regUtc <= eventUtc;
  } catch {
    return false;
  }
};

const isPaymentDeadlineAfterRegistrationDeadline = (
  paymentDeadline: string | undefined,
  registrationDeadline: string | undefined
): boolean => {
  if (
    !registrationDeadline ||
    registrationDeadline.trim() === "" ||
    !paymentDeadline ||
    paymentDeadline.trim() === ""
  ) {
    return true;
  }
  try {
    const payUtc = convertDatetimeLocalToUtc(paymentDeadline);
    const regUtc = convertDatetimeLocalToUtc(registrationDeadline);
    return payUtc >= regUtc;
  } catch {
    return false;
  }
};

const isPaymentDeadlineWithinThirtyDays = (
  paymentDeadline: string | undefined,
  date: string | undefined
): boolean => {
  if (!paymentDeadline || paymentDeadline.trim() === "" || !date) return true;
  try {
    const payUtc = convertDatetimeLocalToUtc(paymentDeadline);
    const eventUtc = convertDatetimeLocalToUtc(date);
    const maxUtc = new Date(eventUtc.getTime() + 30 * 24 * 60 * 60 * 1000);
    return payUtc <= maxUtc;
  } catch {
    return false;
  }
};

const isGracePeriodWithinThirtyDays = (params: {
  date?: string;
  paymentDeadline?: string;
  gracePeriodDays?: string;
  allowPaymentAfterDeadline?: boolean;
  requireStripe?: boolean;
  hasStripe?: boolean;
  allowDateFallbackBase?: boolean;
}): boolean => {
  const {
    date,
    paymentDeadline,
    gracePeriodDays,
    allowPaymentAfterDeadline,
    requireStripe = false,
    hasStripe = false,
    allowDateFallbackBase = false,
  } = params;

  if (!date) return true;
  if (!allowPaymentAfterDeadline) return true;
  if (requireStripe && !hasStripe) return true;

  const hasPaymentDeadline = Boolean(paymentDeadline && paymentDeadline.trim() !== "");
  if (!hasPaymentDeadline && !allowDateFallbackBase) return true;

  try {
    const baseUtc =
      hasPaymentDeadline && paymentDeadline
        ? convertDatetimeLocalToUtc(paymentDeadline)
        : convertDatetimeLocalToUtc(date);
    const eventUtc = convertDatetimeLocalToUtc(date);
    const grace = Number(gracePeriodDays ?? "0");
    if (!Number.isInteger(grace) || grace < 0 || grace > 30) return false;
    const finalDue = new Date(baseUtc.getTime() + grace * 24 * 60 * 60 * 1000);
    const maxUtc = new Date(eventUtc.getTime() + 30 * 24 * 60 * 60 * 1000);
    return finalDue <= maxUtc;
  } catch {
    return false;
  }
};

export const createEventFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "イベント名は必須です")
      .max(100, "イベント名は100文字以内で入力してください"),
    date: z
      .string()
      .min(1, "開催日時は必須です")
      .refine((val) => {
        if (!val) return false;
        try {
          const eventUtc = convertDatetimeLocalToUtc(val);
          return eventUtc > new Date();
        } catch {
          return false;
        }
      }, "開催日時は現在時刻より後である必要があります"),
    fee: z
      .string()
      .trim()
      .min(1, "参加費は必須です")
      .refine((val) => {
        const num = parseFee(val);
        return num === 0 || (num >= 100 && num <= 1000000);
      }, "参加費は0円(無料)または100円以上である必要があります"),
    payment_methods: z.array(z.enum(["stripe", "cash"])),
    location: z.string().trim().max(200, "場所は200文字以内で入力してください"),
    description: z.string().trim().max(1000, "説明は1000文字以内で入力してください"),
    capacity: z.string().refine((val) => {
      if (!val || val.trim() === "") return true;
      const num = safeParseNumber(val);
      return num >= 1 && num <= 10000;
    }, "定員は1以上10000以下である必要があります"),
    registration_deadline: z.string().min(1, "参加申込締切は必須です"),
    payment_deadline: z.string(),
    allow_payment_after_deadline: z.boolean().optional(),
    grace_period_days: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // 参加費に基づく決済方法バリデーション
    const fee = parseFee(data.fee);
    if (fee > 0 && data.payment_methods.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "有料イベントでは決済方法の選択が必要です",
        path: ["payment_methods"],
      });
    }
  })
  .superRefine((data, ctx) => {
    // オンライン決済を選択した場合は決済締切を必須にする
    const fee = parseFee(data.fee);
    const hasStripe = hasStripePaymentMethod(data.payment_methods);
    if (fee > 0 && hasStripe) {
      if (!data.payment_deadline || data.payment_deadline.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "オンライン決済締切は必須です",
          path: ["payment_deadline"],
        });
      }
    }
  })
  .refine((data) => isRegistrationDeadlineBeforeEventDate(data.registration_deadline, data.date), {
    message: "参加申込締切は開催日時以前に設定してください",
    path: ["registration_deadline"],
  })
  .refine(
    (data) => {
      // オンライン決済を選択した場合のみ、決済締切が必須
      const fee = parseFee(data.fee);
      const hasStripe = hasStripePaymentMethod(data.payment_methods);
      if (fee > 0 && hasStripe) {
        return Boolean(data.payment_deadline && data.payment_deadline.trim() !== "");
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
      // オンライン決済が選択されている場合のみ、決済締切 ≤ 開催日時 + 30日
      const hasStripe = hasStripePaymentMethod(data.payment_methods);
      if (!hasStripe) return true;
      return isPaymentDeadlineWithinThirtyDays(data.payment_deadline, data.date);
    },
    {
      message: "オンライン決済締切は開催日時から30日以内に設定してください",
      path: ["payment_deadline"],
    }
  )
  .refine(
    (data) => {
      // オンライン決済が選択されている場合のみ、決済締切が参加申込締切以降であることを確認
      const hasStripe = hasStripePaymentMethod(data.payment_methods);
      if (!hasStripe) return true;
      return isPaymentDeadlineAfterRegistrationDeadline(
        data.payment_deadline,
        data.registration_deadline
      );
    },
    {
      message: "決済締切は参加申込締切以降に設定してください",
      path: ["payment_deadline"],
    }
  )
  .refine(
    (data) => {
      // オンライン決済が選択されている場合のみ、最終支払期限（payment_deadline + 猶予日） ≤ 開催日時 + 30日
      const hasStripe = hasStripePaymentMethod(data.payment_methods);
      return isGracePeriodWithinThirtyDays({
        hasStripe,
        requireStripe: true,
        allowPaymentAfterDeadline: data.allow_payment_after_deadline,
        date: data.date,
        paymentDeadline: data.payment_deadline,
        gracePeriodDays: data.grace_period_days,
      });
    },
    {
      message: "最終支払期限は開催日時から30日以内に設定してください",
      path: ["grace_period_days"],
    }
  );

export type CreateEventFormData = z.infer<typeof createEventFormSchema>;

export const eventEditFormSchemaBase = z
  .object({
    title: z
      .string()
      .min(1, "イベント名は必須です")
      .max(100, "イベント名は100文字以内で入力してください"),
    description: z.string().max(1000, "説明は1000文字以内で入力してください"),
    location: z.string().max(200, "場所は200文字以内で入力してください"),
    date: z
      .string()
      .min(1, "開催日時は必須です")
      .refine((val) => {
        if (!val) return false;
        try {
          const utcDate = convertDatetimeLocalToUtc(val);
          return isUtcDateFuture(utcDate);
        } catch {
          return false;
        }
      }, "開催日時は現在時刻より後である必要があります"),
    fee: z
      .string()
      .regex(/^\d+$/, "参加費は数値で入力してください")
      .refine((v) => {
        const n = Number(v);
        return Number.isInteger(n) && (n === 0 || (n >= 100 && n <= 1_000_000));
      }, "参加費は0円（無料）または100〜1,000,000円の整数で入力してください"),
    capacity: z
      .string()
      .optional()
      .refine((val) => {
        if (!val || val.trim() === "") return true;
        const cap = Number(val);
        return Number.isInteger(cap) && cap >= 1 && cap <= 10_000;
      }, "定員は1以上10,000以下である必要があります"),
    payment_methods: z.array(z.string()),
    registration_deadline: z.string().optional(),
    payment_deadline: z.string().optional(),
    allow_payment_after_deadline: z.boolean().optional(),
    grace_period_days: z.string().optional(),
  })
  .refine(
    (data) => {
      const fee = parseFee(data.fee || "");
      // 無料イベント（fee=0）の場合は決済方法不要
      if (fee === 0) return true;
      // 有料イベント（fee≥1）の場合は決済方法必須
      return data.payment_methods.length > 0;
    },
    {
      message: "有料イベントでは決済方法の選択が必要です",
      path: ["payment_methods"],
    }
  )
  .refine((data) => isRegistrationDeadlineBeforeEventDate(data.registration_deadline, data.date), {
    message: "参加申込締切は開催日時以前に設定してください",
    path: ["registration_deadline"],
  })
  .refine(
    (data) =>
      isPaymentDeadlineAfterRegistrationDeadline(data.payment_deadline, data.registration_deadline),
    {
      message: "オンライン決済締切は参加申込締切以降に設定してください",
      path: ["payment_deadline"],
    }
  )
  .refine((data) => isPaymentDeadlineWithinThirtyDays(data.payment_deadline, data.date), {
    message: "オンライン決済締切は開催日時から30日以内に設定してください",
    path: ["payment_deadline"],
  })
  .refine(
    (data) =>
      isGracePeriodWithinThirtyDays({
        allowPaymentAfterDeadline: data.allow_payment_after_deadline,
        date: data.date,
        paymentDeadline: data.payment_deadline,
        gracePeriodDays: data.grace_period_days,
        allowDateFallbackBase: true,
      }),
    {
      message: "猶予を含む最終支払期限は開催日時から30日以内にしてください",
      path: ["grace_period_days"],
    }
  );

export type EventEditFormDataRHF = z.infer<typeof eventEditFormSchemaBase>;

// 参加者数依存の capacity バリデーションと既存値考慮のスキーマ
export function createEventEditFormSchema(attendeeCount: number, existingEvent: Event) {
  return eventEditFormSchemaBase
    .refine(
      (data) => {
        // 未入力（制限なし）は許可
        if (!data.capacity || data.capacity.trim() === "") return true;
        const cap = Number(data.capacity);
        // 基本的な制限はbaseスキーマで処理済み、ここでは参加者数の制限のみチェック
        return cap >= attendeeCount;
      },
      {
        message: `定員は現在の参加者数（${attendeeCount}名）以上で設定してください`,
        path: ["capacity"],
      }
    )
    .refine(
      (data) => {
        // オンライン決済選択時は決済締切が必須（existing値も考慮）
        const hasStripe = hasStripePaymentMethod(data.payment_methods);
        if (hasStripe) {
          // フォーム値または既存値のいずれかに締切が設定されていればOK
          const hasFormDeadline = Boolean(
            data.payment_deadline && String(data.payment_deadline).trim() !== ""
          );
          const hasExistingDeadline = Boolean(existingEvent.payment_deadline);
          return hasFormDeadline || hasExistingDeadline;
        }
        return true;
      },
      {
        message: "オンライン決済を選択した場合、決済締切の設定が必要です。",
        path: ["payment_deadline"],
      }
    );
}

export const generateGuestUrlInputSchema = z.object({
  eventId: z.string().uuid(),
  attendanceId: z.string().uuid(),
});

export const generateInviteTokenEventIdSchema = z.string().uuid("Invalid event ID format");

export const eventFilterDateSchema = z
  .object({
    start: z.string().optional(),
    end: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.start && data.end) {
        try {
          // 日付文字列を直接比較（YYYY-MM-DD形式）
          return data.end > data.start;
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "終了日は開始日より後の日付を選択してください",
    }
  );
