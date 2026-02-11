"use client";

import { useTransition, useEffect } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import type { EventCreatedParams } from "@core/analytics/event-types";
import { ga4Client } from "@core/analytics/ga4-client";
import { useToast } from "@core/contexts/toast-context";
import type { ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import type { EventRow } from "@core/types/models";
import { handleClientError } from "@core/utils/error-handler.client";
import { safeParseNumber, parseFee } from "@core/utils/number-parsers";
import type { EventFormData } from "@core/validation/event";

import { createEventFormSchema, type CreateEventFormData } from "../validation";

type EventFormSchemaData = CreateEventFormData;

// react-hook-form用のデフォルト値
const defaultValues: EventFormSchemaData = {
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
export type CreateEventAction = (formData: FormData) => Promise<ActionResult<EventRow>>;

type UseEventFormParams = {
  createEventAction: CreateEventAction;
};

export const useEventForm = ({
  createEventAction,
}: UseEventFormParams): {
  form: ReturnType<typeof useForm<EventFormSchemaData>>;
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
  const form = useForm<EventFormSchemaData>({
    resolver: zodResolver(createEventFormSchema),
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
  const onSubmit = async (data: EventFormSchemaData): Promise<void> => {
    startTransition(async () => {
      try {
        const submissionData: EventFormData = data;
        // フォームデータをFormDataオブジェクトに変換
        const formData = new FormData();

        // 基本フィールドの設定
        formData.append("title", submissionData.title);
        formData.append("date", submissionData.date);
        formData.append("fee", submissionData.fee);

        // 決済方法の設定（配列から文字列に変換）
        const paymentMethodsString = Array.isArray(submissionData.payment_methods)
          ? submissionData.payment_methods.join(",")
          : "";
        formData.append("payment_methods", paymentMethodsString);

        // オプショナルフィールドの設定
        if (submissionData.location) {
          formData.append("location", submissionData.location);
        }
        if (submissionData.description) {
          formData.append("description", submissionData.description);
        }
        if (submissionData.capacity) {
          formData.append("capacity", submissionData.capacity);
        }
        if (submissionData.registration_deadline) {
          formData.append("registration_deadline", submissionData.registration_deadline);
        }
        if (submissionData.payment_deadline) {
          formData.append("payment_deadline", submissionData.payment_deadline);
        }
        if (submissionData.allow_payment_after_deadline) {
          formData.append(
            "allow_payment_after_deadline",
            String(submissionData.allow_payment_after_deadline)
          );
        }
        if (submissionData.grace_period_days) {
          formData.append("grace_period_days", submissionData.grace_period_days);
        }

        // Server Actionの実行
        const result = await createEventAction(formData);

        if (result.success) {
          const createdEvent = result.data;
          if (!createdEvent) {
            throw new Error("イベント作成のレスポンスが不正です");
          }
          // GA4イベント送信: event_created
          try {
            const eventCreatedParams: EventCreatedParams = {
              event_id: createdEvent.id,
              event_title: submissionData.title,
              event_date: submissionData.date,
              amount: parseFee(submissionData.fee),
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
            router.push(`/events/${createdEvent.id}`);
          }, 500);
        } else {
          // エラー時はフォームにエラーを設定
          form.setError("root", {
            type: "server",
            message: result.error?.userMessage || "エラーが発生しました。もう一度お試しください。",
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
