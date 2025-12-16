"use client";

import { useCallback, useEffect, useMemo, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useErrorHandler } from "@core/hooks/use-error-handler";
import { logger } from "@core/logging/app-logger";
import type { Event, EventFormData } from "@core/types/models";
import { safeParseNumber, parseFee } from "@core/utils/number-parsers";
import {
  convertDatetimeLocalToUtc,
  formatUtcToDatetimeLocal,
  isUtcDateFuture,
} from "@core/utils/timezone";

import type { ChangeItem } from "@/components/ui/change-confirmation-dialog";

import { useEventChanges } from "./use-event-changes";
import { useEventSubmission } from "./use-event-submission";
import {
  useUnifiedRestrictions,
  useRestrictionContext,
  useFormDataSnapshot,
} from "./use-unified-restrictions";

interface UseEventEditFormProps {
  event: Event;
  attendeeCount: number;
  onSubmit?: (data: Event) => void;
  hasStripePaid: boolean;
}

// react-hook-form用のスキーマ（フォーム入力値をそのまま扱う）
const eventEditFormSchemaBase = z
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
    payment_methods: z.array(z.string()), // min制約を削除
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
  // NOTE: 新しく入力する開催日時は未来である必要があります。
  // 既存の過去イベントの編集禁止はページレベルで実装済みです。
  .refine(
    (data) => {
      if (!data.registration_deadline || !data.date) return true;
      try {
        const deadlineUtc = convertDatetimeLocalToUtc(data.registration_deadline);
        const eventUtc = convertDatetimeLocalToUtc(data.date);
        return deadlineUtc <= eventUtc;
      } catch {
        return false;
      }
    },
    {
      message: "参加申込締切は開催日時以前に設定してください",
      path: ["registration_deadline"],
    }
  )
  .refine(
    (data) => {
      // registration_deadline ≤ payment_deadline（両方入力時）
      if (!data.payment_deadline || !data.registration_deadline) return true;
      try {
        const payUtc = convertDatetimeLocalToUtc(data.payment_deadline);
        const regUtc = convertDatetimeLocalToUtc(data.registration_deadline);
        return regUtc <= payUtc;
      } catch {
        return false;
      }
    },
    {
      message: "オンライン決済締切は参加申込締切以降に設定してください",
      path: ["payment_deadline"],
    }
  )
  .refine(
    (data) => {
      // payment_deadline ≤ date + 30日
      if (!data.payment_deadline || !data.date) return true;
      try {
        const payUtc = convertDatetimeLocalToUtc(data.payment_deadline);
        const eventUtc = convertDatetimeLocalToUtc(data.date);
        const maxUtc = new Date(eventUtc.getTime() + 30 * 24 * 60 * 60 * 1000);
        return payUtc <= maxUtc;
      } catch {
        return false;
      }
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
            : convertDatetimeLocalToUtc(data.date); // effective_payment_deadline（サーバー仕様と統一）
          const eventUtc = convertDatetimeLocalToUtc(data.date);
          const grace = Number(data.grace_period_days ?? "0") || 0;
          if (!Number.isInteger(grace) || grace < 0 || grace > 30) return false;
          const finalCandidate = new Date(baseUtc.getTime() + grace * 24 * 60 * 60 * 1000);
          const eventPlus30d = new Date(eventUtc.getTime() + 30 * 24 * 60 * 60 * 1000);
          return finalCandidate <= eventPlus30d;
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
  );
// フォームデータ型（react-hook-form用）
export type EventEditFormDataRHF = z.infer<typeof eventEditFormSchemaBase>;

// 参加者数依存の capacity バリデーションと既存値考慮のスキーマ
function createEventEditFormSchema(attendeeCount: number, existingEvent: Event) {
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
        const hasStripe = Array.isArray(data.payment_methods)
          ? data.payment_methods.includes("stripe")
          : false;
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

export function useEventEditForm({
  event,
  attendeeCount,
  onSubmit,
  hasStripePaid,
}: UseEventEditFormProps) {
  const hasAttendees = attendeeCount > 0;
  const [isPending, startTransition] = useTransition();
  const { submitWithErrorHandling } = useErrorHandler();

  // 初期値をメモ化（型安全）
  // registration_deadline: DBでNOT NULL制約のため既存値を使用（変更検出問題を回避）
  // payment_deadline: 存在する場合は既存値を使用、stripe選択解除時は動的にクリア
  const initialFormData = useMemo<EventEditFormDataRHF>(
    () => ({
      title: event.title || "",
      description: event.description || "",
      location: event.location || "",
      date: formatUtcToDatetimeLocal(event.date),
      fee: event.fee?.toString() || "0",
      capacity: event.capacity?.toString() || "",
      payment_methods: event.payment_methods || [],
      registration_deadline: formatUtcToDatetimeLocal(event.registration_deadline),
      payment_deadline: formatUtcToDatetimeLocal(event.payment_deadline || ""),
      allow_payment_after_deadline: (event as any).allow_payment_after_deadline ?? false,
      grace_period_days: ((event as any).grace_period_days ?? 0).toString(),
    }),
    [event]
  );

  // react-hook-formの初期化
  const form = useForm<EventEditFormDataRHF>({
    resolver: zodResolver(createEventEditFormSchema(attendeeCount, event)),
    defaultValues: initialFormData,
    mode: "all", // クロスフィールドバリデーション対応
    reValidateMode: "onChange",
  });

  // リアルタイムでフォーム値を監視
  const watchedValues = form.watch();

  // 参加費をリアルタイムで監視
  const watchedFee = form.watch("fee");
  // 空文字列や未入力の場合は無料イベントとして扱わない
  const currentFee = watchedFee && watchedFee.trim() !== "" ? safeParseNumber(watchedFee) : null;
  const isFreeEvent = currentFee === 0;

  // 決済方法をリアルタイムで監視
  const watchedPaymentMethods = form.watch("payment_methods");

  // 無料イベントの場合は決済方法をクリア
  useEffect(() => {
    if (isFreeEvent) {
      form.setValue("payment_methods", []);
    }
  }, [isFreeEvent, form]);

  // stripe選択解除時のpayment_deadline および関連フィールドのクリア
  useEffect(() => {
    const paymentMethods = watchedPaymentMethods || [];

    if (!paymentMethods.includes("stripe")) {
      const currentPaymentDeadline = form.getValues("payment_deadline");
      const currentAllowPaymentAfterDeadline = form.getValues("allow_payment_after_deadline");
      const currentGracePeriodDays = form.getValues("grace_period_days");

      // payment_deadlineをクリア
      if (currentPaymentDeadline && currentPaymentDeadline.trim() !== "") {
        form.setValue("payment_deadline", "", {
          shouldValidate: true,
          shouldTouch: false, // 自動クリアは変更扱いしない
        });
      }

      // allow_payment_after_deadlineをクリア
      if (currentAllowPaymentAfterDeadline) {
        form.setValue("allow_payment_after_deadline", false, {
          shouldValidate: true,
          shouldTouch: false, // 自動クリアは変更扱いしない
        });
      }

      // grace_period_daysをクリア
      if (
        currentGracePeriodDays &&
        currentGracePeriodDays.trim() !== "" &&
        currentGracePeriodDays !== "0"
      ) {
        form.setValue("grace_period_days", "0", {
          shouldValidate: true,
          shouldTouch: false, // 自動クリアは変更扱いしない
        });
      }
    }
  }, [watchedPaymentMethods, form]);

  // フォーム値のシリアライズ（比較用）- 無限ループ防止のため
  const serializedValues = JSON.stringify(watchedValues);

  // 現在のフォームデータを取得（メモ化）
  // NOTE: form.watch()が返すオブジェクトは毎回参照が変わる可能性があるため、
  // 単純な依存配列に入れると無限ループの原因になります。
  // JSON.stringifyで値の等価性をチェックすることで、値が変動した時のみ再計算されるようにします。
  const currentFormData = useMemo((): EventFormData => {
    return {
      title: watchedValues.title || "",
      description: watchedValues.description || "",
      location: watchedValues.location || "",
      date: watchedValues.date || "",
      fee: (watchedValues.fee || "").toString(), // 文字列として統一
      capacity: (watchedValues.capacity || "").toString(), // 文字列として統一
      payment_methods: watchedValues.payment_methods || [],
      registration_deadline: watchedValues.registration_deadline || "",
      payment_deadline: watchedValues.payment_deadline || "",
      allow_payment_after_deadline: watchedValues.allow_payment_after_deadline ?? false,
      grace_period_days: watchedValues.grace_period_days || "0",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializedValues]);

  // 統一制限システムの初期化
  const restrictionContext = useRestrictionContext(
    {
      fee: event.fee,
      capacity: event.capacity,
      payment_methods: event.payment_methods,
      title: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      date: event.date,
      registration_deadline: event.registration_deadline ?? undefined,
      payment_deadline: event.payment_deadline ?? undefined,
      allow_payment_after_deadline: event.allow_payment_after_deadline ?? undefined,
      grace_period_days: event.grace_period_days ?? undefined,
    },
    { hasAttendees, attendeeCount, hasStripePaid },
    event.status ?? "upcoming"
  );
  const formDataSnapshot = useFormDataSnapshot(
    currentFormData as unknown as Record<string, unknown>
  );
  const unifiedRestrictions = useUnifiedRestrictions(restrictionContext, formDataSnapshot);

  // 分割されたフックの初期化
  const changes = useEventChanges({
    event,
    formData: currentFormData,
    hasValidationErrors: !form.formState.isValid,
    isFieldEditable: (field: string) => unifiedRestrictions.isFieldEditable(field as any),
  });
  const submission = useEventSubmission({ eventId: event.id, onSubmit });

  // フォームリセット
  const resetForm = useCallback(() => {
    form.reset(initialFormData);
  }, [form, initialFormData]);

  // 変更検出（リアルタイム）
  const detectChanges = useCallback((): ChangeItem[] => {
    return changes.detectChanges();
  }, [changes]);

  // 変更があるかチェック（依存配列を安定化）
  const hasChanges = useMemo(() => {
    return changes.hasChanges;
  }, [changes]);

  // フォーム送信処理
  const handleSubmit = useCallback(
    async (data: EventEditFormDataRHF) => {
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        startTransition(async () => {
          // EventFormData形式に変換（numeric フィールドの型安全性確保）
          const formData: EventFormData = {
            title: data.title,
            description: data.description,
            location: data.location,
            date: data.date,
            fee: data.fee.toString(), // 文字列として統一
            capacity: data.capacity?.toString() || "", // 文字列として統一
            payment_methods: data.payment_methods,
            registration_deadline: data.registration_deadline || "",
            payment_deadline: data.payment_deadline || "",
            allow_payment_after_deadline: data.allow_payment_after_deadline ?? false,
            grace_period_days: data.grace_period_days || "0",
          };

          // 変更検出
          const detectedChanges = detectChanges();

          if (detectedChanges.length === 0) {
            form.setError("root", {
              type: "manual",
              message: "変更がありません",
            });
            resolve({ success: false, error: "変更がありません" });
            return;
          }

          // @note エラーハンドリングの重複について:
          // 現在3段階でエラーハンドリングが実行される:
          // 1. submitWithErrorHandling（グローバルエラーハンドリング）
          // 2. submission.submitForm（送信固有のエラーハンドリング）
          // 3. form.setError（react-hook-formエラー設定）
          //
          // @todo 将来的な改善提案:
          // - エラーハンドリングを2段階に簡素化
          // - Zodエラーの複数エラー対応を統一
          // - エラーメッセージの一元管理

          const result = await submitWithErrorHandling(
            () =>
              submission.submitForm(formData, detectedChanges, (errors) => {
                // エラーをreact-hook-formに設定
                Object.entries(errors).forEach(([field, message]) => {
                  if (field === "general") {
                    form.setError("root", {
                      type: "manual",
                      message: message,
                    });
                  } else {
                    form.setError(field as keyof EventEditFormDataRHF, {
                      type: "manual",
                      message: message,
                    });
                  }
                });
              }),
            {
              action: "event_edit",
              eventId: event.id,
            }
          );

          if (result.success) {
            resolve({ success: true });
          } else {
            // submitWithErrorHandling でエラーハンドリング済みなので、フォームエラーのみ設定
            form.setError("root", {
              type: "manual",
              message: result.error?.userMessage || "更新に失敗しました。もう一度お試しください。",
            });
            resolve({
              success: false,
              error: result.error?.userMessage || "更新に失敗しました。もう一度お試しください。",
            });
          }
        });
      });
    },
    [form, detectChanges, submission, startTransition, event.id, submitWithErrorHandling]
  );

  // 変更リストを指定して送信する関数
  const submitFormWithChanges = useCallback(
    async (data: EventEditFormDataRHF, changeList: ChangeItem[]) => {
      const result = new Promise<{ success: boolean; error?: string }>((resolve) => {
        startTransition(async () => {
          try {
            // EventFormData形式に変換（numeric フィールドの型安全性確保）
            const fullFormData: EventFormData = {
              title: data.title,
              description: data.description,
              location: data.location,
              date: data.date,
              fee: data.fee.toString(), // 文字列として統一
              capacity: data.capacity?.toString() || "", // 文字列として統一
              payment_methods: data.payment_methods,
              registration_deadline: data.registration_deadline || "",
              payment_deadline: data.payment_deadline || "",
              allow_payment_after_deadline: data.allow_payment_after_deadline ?? false,
              grace_period_days: data.grace_period_days || "0",
            };

            // 確認された変更のみを含むフォームデータを作成
            const selectedFormData = submission.prepareSubmissionData(fullFormData, changeList);

            // 実際の送信処理（選択された変更のみ）
            const result = await submission.submitForm(selectedFormData, changeList, (errors) => {
              // エラーをreact-hook-formに設定
              Object.entries(errors).forEach(([field, message]) => {
                if (field === "general") {
                  form.setError("root", {
                    type: "manual",
                    message: message,
                  });
                } else {
                  form.setError(field as keyof EventEditFormDataRHF, {
                    type: "manual",
                    message: message,
                  });
                }
              });
            });

            resolve(result);
          } catch (error) {
            logger.error("Event edit form submission with changes failed", {
              tag: "eventEditForm",
              event_id: event.id,
              error_name: error instanceof Error ? error.name : "Unknown",
              error_message: error instanceof Error ? error.message : String(error),
            });
            form.setError("root", {
              type: "manual",
              message: "更新に失敗しました。もう一度お試しください。",
            });
            resolve({ success: false, error: "更新に失敗しました。もう一度お試しください。" });
          }
        });
      });

      return result;
    },
    [form, submission, startTransition, event.id]
  );

  // フィールド制限チェック
  const isFieldRestricted = useCallback(
    (field: string): boolean => {
      return unifiedRestrictions.isFieldRestricted(field as any);
    },
    [unifiedRestrictions]
  );

  // フィールド編集可能チェック
  const isFieldEditable = useCallback(
    (field: string): boolean => {
      return unifiedRestrictions.isFieldEditable(field as any);
    },
    [unifiedRestrictions]
  );

  // 変更数の取得
  const getChangeCount = useCallback(() => {
    return changes.getChangeCount();
  }, [changes]);

  // 統合APIの提供
  return {
    // === React Hook Form ===
    form,
    onSubmit: form.handleSubmit(handleSubmit),
    isPending,

    // === フォーム状態 ===
    formData: currentFormData,
    hasAttendees,
    isFreeEvent, // 無料イベント判定フラグ

    // === バリデーション ===
    validation: {
      errors: form.formState.errors,
      hasErrors: !form.formState.isValid,
      isValid: form.formState.isValid,
      isDirty: form.formState.isDirty,
    },

    // === 編集制限 ===
    restrictions: {
      isFieldRestricted,
      isFieldEditable,
      details: unifiedRestrictions, // 全詳細情報へのアクセス
    },

    // === 変更検出 ===
    changes: {
      hasChanges,
      detectChanges,
      hasFieldChanged: changes.hasFieldChanged,
      getChangedFieldNames: changes.getChangedFieldNames,
      getChangeCount,
      getChangeSummary: changes.getChangeSummary,
      getChangesByType: changes.getChangesByType,
      hasCriticalChanges: changes.hasCriticalChanges,
      getRevertData: changes.getRevertData,
    },

    // === フォーム操作 ===
    actions: {
      resetForm,
      submitForm: handleSubmit,
      submitFormWithChanges,
    },
  };
}
