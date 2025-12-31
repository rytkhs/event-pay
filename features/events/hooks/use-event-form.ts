"use client";

import { useTransition, useEffect } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { EventCreatedParams } from "@core/analytics/event-types";
import { ga4Client } from "@core/analytics/ga4-client";
import { useToast } from "@core/contexts/toast-context";
import { logger } from "@core/logging/app-logger";
import { handleClientError } from "@core/utils/error-handler";
import { safeParseNumber, parseFee } from "@core/utils/number-parsers";
import { convertDatetimeLocalToUtc } from "@core/utils/timezone";

import { createEventAction } from "../actions";

// フロントエンド専用バリデーションスキーマ
const eventFormSchema = z
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
    if (fee > 0) {
      if (!Array.isArray(data.payment_methods) || data.payment_methods.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "有料イベントでは決済方法の選択が必要です",
          path: ["payment_methods"],
        });
      }
    }
  })
  .superRefine((data, ctx) => {
    // オンライン決済を選択した場合は決済締切を必須にする
    const fee = parseFee(data.fee);
    const hasStripe = Array.isArray(data.payment_methods)
      ? data.payment_methods.includes("stripe")
      : false;
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
  .refine(
    (data) => {
      // 参加申込締切が開催日時以前であることを確認（空文字列は無視）
      if (data.registration_deadline && data.registration_deadline.trim() !== "" && data.date) {
        try {
          const regUtc = convertDatetimeLocalToUtc(data.registration_deadline);
          const eventUtc = convertDatetimeLocalToUtc(data.date);
          return regUtc <= eventUtc;
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
      // オンライン決済を選択した場合のみ、決済締切が必須
      const fee = parseFee(data.fee);
      const hasOnline = Array.isArray(data.payment_methods)
        ? data.payment_methods.includes("stripe")
        : false;
      if (fee > 0 && hasOnline) {
        return data.payment_deadline && data.payment_deadline.trim() !== "";
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
      const hasStripe = Array.isArray(data.payment_methods)
        ? data.payment_methods.includes("stripe")
        : false;

      if (hasStripe && data.payment_deadline && data.payment_deadline.trim() !== "" && data.date) {
        try {
          const payUtc = convertDatetimeLocalToUtc(data.payment_deadline);
          const eventUtc = convertDatetimeLocalToUtc(data.date);
          const maxUtc = new Date(eventUtc.getTime() + 30 * 24 * 60 * 60 * 1000);
          return payUtc <= maxUtc;
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
      // オンライン決済が選択されている場合のみ、決済締切が参加申込締切以降であることを確認
      const hasStripe = Array.isArray(data.payment_methods)
        ? data.payment_methods.includes("stripe")
        : false;

      if (
        hasStripe &&
        data.registration_deadline &&
        data.registration_deadline.trim() !== "" &&
        data.payment_deadline &&
        data.payment_deadline.trim() !== ""
      ) {
        try {
          const payUtc = convertDatetimeLocalToUtc(data.payment_deadline);
          const regUtc = convertDatetimeLocalToUtc(data.registration_deadline);
          return payUtc >= regUtc;
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
      // オンライン決済が選択されている場合のみ、最終支払期限（payment_deadline + 猶予日） ≤ 開催日時 + 30日
      const hasStripe = Array.isArray(data.payment_methods)
        ? data.payment_methods.includes("stripe")
        : false;

      if (!hasStripe) return true;
      if (!data.date) return true;
      if (!data.allow_payment_after_deadline) return true;
      if (!data.payment_deadline || data.payment_deadline.trim() === "") return true;
      try {
        const payUtc = convertDatetimeLocalToUtc(data.payment_deadline);
        const eventUtc = convertDatetimeLocalToUtc(data.date);
        const grace = Number(data.grace_period_days ?? "0");
        if (!Number.isInteger(grace) || grace < 0 || grace > 30) return false;
        const finalDue = new Date(payUtc.getTime() + grace * 24 * 60 * 60 * 1000);
        const maxUtc = new Date(eventUtc.getTime() + 30 * 24 * 60 * 60 * 1000);
        return finalDue <= maxUtc;
      } catch {
        return false;
      }
    },
    {
      message: "最終支払期限は開催日時から30日以内に設定してください",
      path: ["grace_period_days"],
    }
  );

// Zodスキーマの推論型をフォーム型として使用（resolverとの互換性のため）
export type EventFormData = z.infer<typeof eventFormSchema>;

// react-hook-form用のデフォルト値
const defaultValues: EventFormData = {
  title: "",
  description: "",
  location: "",
  date: "",
  capacity: "",
  registration_deadline: "",
  payment_deadline: "",
  payment_methods: [], // default([])を手動で設定
  fee: "",
  allow_payment_after_deadline: false,
  grace_period_days: "0",
};

// datetime-local 形式 (YYYY-MM-DDTHH:mm) に整形
function toDatetimeLocalString(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * react-hook-formを使用したイベント作成フォーム用フック
 * セキュリティファースト設計を維持しながら、パフォーマンスと開発効率を向上
 */
export const useEventForm = (): {
  form: ReturnType<typeof useForm<EventFormData>>;
  onSubmit: () => void;
  isPending: boolean;
  hasErrors: boolean;
  isFreeEvent: boolean;
  errors: Record<string, string | undefined>;
} => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // react-hook-formの初期化
  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues,
    mode: "onChange", // 入力時にバリデーション（UX重視）
    reValidateMode: "onChange",
    shouldFocusError: true,
    criteriaMode: "all", // 全エラーを表示
    shouldUnregister: false, // マルチステップフォームでは値を保持
  });

  // 参加費をリアルタイムで監視
  const watchedFee = form.watch("fee");
  const watchedDate = form.watch("date");
  const watchedPaymentMethods = form.watch("payment_methods");
  // 空文字列や未入力の場合は無料イベントとして扱わない
  const currentFee = watchedFee && watchedFee.trim() !== "" ? safeParseNumber(watchedFee) : null;
  const isFreeEvent = currentFee === 0;

  // 無料イベントの場合は決済方法をクリア（トリガーでバリデーション更新）
  useEffect(() => {
    if (isFreeEvent) {
      // 無料イベント: 決済方法や猶予関連をクリア
      form.setValue("payment_methods", [], { shouldValidate: true, shouldTouch: false });
      form.setValue("allow_payment_after_deadline", false, {
        shouldValidate: true,
        shouldTouch: false,
      });
      form.setValue("grace_period_days", "0", { shouldValidate: true, shouldTouch: false });
      // ステップの相関バリデーション更新
      void form.trigger(["payment_methods", "allow_payment_after_deadline", "grace_period_days"]);
    }
  }, [isFreeEvent, form]);

  // 決済方法が変更されたときの処理
  // オンライン決済が追加された場合：決済締切をプリセット
  // オンライン決済が削除された場合：決済締切をクリア
  useEffect(() => {
    const paymentMethods = form.getValues("payment_methods") || [];
    const hasOnlinePayment = paymentMethods.includes("stripe");
    const dateValue = form.getValues("date");
    const currentPay = form.getValues("payment_deadline");

    if (hasOnlinePayment) {
      // オンライン決済が選択され、決済締切が空の場合、開催日時でプリセット
      if (dateValue && (!currentPay || currentPay.trim() === "")) {
        const eventLocal = new Date(dateValue);
        if (!Number.isNaN(eventLocal.getTime())) {
          const now = new Date();
          const minStart = new Date(now.getTime() + 60 * 60 * 1000);
          const clamp = (d: Date): Date => {
            if (d < minStart) return minStart;
            if (d > eventLocal) return eventLocal;
            return d;
          };
          const suggestPayment = clamp(new Date(eventLocal.getTime() - 1 * 24 * 60 * 60 * 1000));

          form.setValue("payment_deadline", toDatetimeLocalString(suggestPayment), {
            shouldValidate: true,
            shouldTouch: false,
          });
        }
      }
    } else {
      // オンライン決済が選択されていない場合、決済締切をクリア
      if (currentPay && currentPay.trim() !== "") {
        form.setValue("payment_deadline", "", {
          shouldValidate: true,
          shouldTouch: false,
        });
      }
    }
  }, [watchedPaymentMethods, form]);

  // 開催日時入力時に、締切サジェスト（申込: -3日 / 決済: -1日）を自動セット（未編集時のみ）
  // 決済締切は、オンライン決済（stripe）が選択されている場合のみプリセット
  useEffect(() => {
    const dateValue = watchedDate;
    if (!dateValue || dateValue.trim() === "") return;

    // 入力された開催日時（ローカル）をベースに計算
    const eventLocal = new Date(dateValue);
    if (Number.isNaN(eventLocal.getTime())) return;

    // 最小値: 現在から1時間後
    const now = new Date();
    const minStart = new Date(now.getTime() + 60 * 60 * 1000);

    // サジェスト値を計算し、[minStart, eventLocal] にクランプ
    const clamp = (d: Date): Date => {
      if (d < minStart) return minStart;
      if (d > eventLocal) return eventLocal;
      return d;
    };

    const suggestRegistration = clamp(new Date(eventLocal.getTime() - 3 * 24 * 60 * 60 * 1000));
    const suggestPayment = clamp(new Date(eventLocal.getTime() - 1 * 24 * 60 * 60 * 1000));

    const { dirtyFields } = form.formState;

    const currentReg = form.getValues("registration_deadline");
    const currentPay = form.getValues("payment_deadline");
    const paymentMethods = form.getValues("payment_methods") || [];
    const hasOnlinePayment = paymentMethods.includes("stripe");

    // 参加申込締切は常にプリセット
    if (!currentReg || currentReg.trim() === "" || !dirtyFields.registration_deadline) {
      form.setValue("registration_deadline", toDatetimeLocalString(suggestRegistration), {
        shouldValidate: true,
        shouldTouch: false,
      });
    }

    // 決済締切は、オンライン決済が選択されている場合のみプリセット
    if (
      hasOnlinePayment &&
      (!currentPay || currentPay.trim() === "" || !dirtyFields.payment_deadline)
    ) {
      form.setValue("payment_deadline", toDatetimeLocalString(suggestPayment), {
        shouldValidate: true,
        shouldTouch: false,
      });
    }
  }, [watchedDate, form]);

  // フォーム送信処理
  const onSubmit = async (data: EventFormData): Promise<void> => {
    startTransition(async () => {
      try {
        // フォームデータをFormDataオブジェクトに変換
        const formData = new FormData();

        // 基本フィールドの設定
        formData.append("title", data.title);
        formData.append("date", data.date);
        formData.append("fee", data.fee);

        // 決済方法の設定（配列から文字列に変換）
        const paymentMethodsString = Array.isArray(data.payment_methods)
          ? data.payment_methods.join(",")
          : "";
        formData.append("payment_methods", paymentMethodsString);

        // オプショナルフィールドの設定
        if (data.location) {
          formData.append("location", data.location);
        }
        if (data.description) {
          formData.append("description", data.description);
        }
        if (data.capacity) {
          formData.append("capacity", data.capacity);
        }
        if (data.registration_deadline) {
          formData.append("registration_deadline", data.registration_deadline);
        }
        if (data.payment_deadline) {
          formData.append("payment_deadline", data.payment_deadline);
        }
        if (data.allow_payment_after_deadline) {
          formData.append(
            "allow_payment_after_deadline",
            String(data.allow_payment_after_deadline)
          );
        }
        if (data.grace_period_days) {
          formData.append("grace_period_days", data.grace_period_days);
        }

        // Server Actionの実行
        const result = await createEventAction(formData);

        if (result.success) {
          // GA4イベント送信: event_created
          try {
            const eventCreatedParams: EventCreatedParams = {
              event_id: result.data.id,
              event_title: data.title,
              event_date: data.date,
              amount: parseFee(data.fee),
              currency: "JPY",
            };

            ga4Client.sendEvent({
              name: "event_created",
              params: eventCreatedParams,
            });
          } catch (analyticsError) {
            // アナリティクスエラーはユーザー体験に影響を与えないようログのみ
            logger.warn("Failed to send event_created analytics", {
              category: "event_management",
              action: "event_creation_analytics",
              actor_type: "user",
              error_message:
                analyticsError instanceof Error ? analyticsError.message : String(analyticsError),
              outcome: "failure",
            });
          }

          // 成功トースト通知を表示
          toast({
            title: "イベントを作成しました！",
            description: `「${data.title}」の作成が完了しました`,
            variant: "success",
            duration: 3000,
          });

          // ユーザーが成功を認識できるよう、短いディレイ後にリダイレクト
          setTimeout(() => {
            router.push(`/events/${result.data.id}`);
          }, 500);
        } else {
          // エラー時はフォームにエラーを設定
          form.setError("root", {
            type: "server",
            message: result.error || "エラーが発生しました。もう一度お試しください。",
          });
        }
      } catch (error) {
        handleClientError(error, {
          category: "event_management",
          action: "event_creation_failed",
        });
        form.setError("root", {
          type: "server",
          message: "予期しないエラーが発生しました。もう一度お試しください。",
        });
      }
    });
  };

  // フォーム状態の取得
  const { formState } = form;
  // カスタムルールではなく、実際のエラーの存在で判定
  const hasErrors = Object.keys(formState.errors).length > 0;

  return {
    form,
    onSubmit: form.handleSubmit(onSubmit),
    isPending,
    hasErrors,
    isFreeEvent,
    errors: Object.fromEntries(
      Object.entries(formState.errors).map(([key, error]) => [
        key,
        typeof error === "object" && error !== null && "message" in error
          ? (error.message ?? undefined)
          : undefined,
      ])
    ) as Record<string, string | undefined>,
  };
};
