"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useTransition } from "react";
import { z } from "zod";
import { convertDatetimeLocalToUtc, formatUtcToDatetimeLocal } from "@core/utils/timezone";
import { safeParseNumber, parseFee } from "@core/utils/number-parsers";
import { useEventRestrictions } from "@features/events/hooks/use-event-restrictions";
import { useEventChanges } from "@features/events/hooks/use-event-changes";
import { useEventSubmission } from "@features/events/hooks/use-event-submission";
import { logger } from "@core/logging/app-logger";
import type { Event, EventFormData } from "@/types/models";
import type { ChangeItem } from "@/components/ui/change-confirmation-dialog";
import { useErrorHandler } from "@core/hooks/use-error-handler";

interface UseEventEditFormProps {
  event: Event;
  attendeeCount: number;
  onSubmit?: (data: Event) => void;
}

// react-hook-form用のスキーマ（フォーム入力値をそのまま扱う）
const eventEditFormSchema = z
  .object({
    title: z
      .string()
      .min(1, "タイトルは必須です")
      .max(100, "タイトルは100文字以内で入力してください"),
    description: z.string().max(1000, "説明は1000文字以内で入力してください"),
    location: z.string().max(200, "場所は200文字以内で入力してください"),
    date: z.string().min(1, "開催日時は必須です"),
    fee: z.string().regex(/^\d+$/, "参加費は数値で入力してください"),
    capacity: z.string().optional(),
    payment_methods: z.array(z.string()), // min制約を削除
    registration_deadline: z.string().optional(),
    payment_deadline: z.string().optional(),
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
  .refine(
    (data) => {
      if (!data.date) return true;
      try {
        const eventUtc = convertDatetimeLocalToUtc(data.date);
        return eventUtc > new Date();
      } catch {
        return false;
      }
    },
    {
      message: "開催日時は現在時刻より後である必要があります",
      path: ["date"],
    }
  )
  .refine(
    (data) => {
      if (!data.registration_deadline || !data.date) return true;
      try {
        const deadlineUtc = convertDatetimeLocalToUtc(data.registration_deadline);
        const eventUtc = convertDatetimeLocalToUtc(data.date);
        return deadlineUtc < eventUtc;
      } catch {
        return false;
      }
    },
    {
      message: "参加申込締切は開催日時より前に設定してください",
      path: ["registration_deadline"],
    }
  )
  .refine(
    (data) => {
      if (!data.payment_deadline || !data.date) return true;
      try {
        const payUtc = convertDatetimeLocalToUtc(data.payment_deadline);
        const eventUtc = convertDatetimeLocalToUtc(data.date);
        return payUtc < eventUtc;
      } catch {
        return false;
      }
    },
    {
      message: "支払い締切は開催日時より前に設定してください",
      path: ["payment_deadline"],
    }
  );

// フォームデータ型（react-hook-form用）
export type EventEditFormDataRHF = z.infer<typeof eventEditFormSchema>;

export function useEventEditForm({ event, attendeeCount, onSubmit }: UseEventEditFormProps) {
  const hasAttendees = attendeeCount > 0;
  const [isPending, startTransition] = useTransition();
  const { submitWithErrorHandling } = useErrorHandler();

  // 初期値をメモ化（型安全）
  const initialFormData = useMemo<EventEditFormDataRHF>(
    () => ({
      title: event.title || "",
      description: event.description || "",
      location: event.location || "",
      date: formatUtcToDatetimeLocal(event.date),
      fee: event.fee?.toString() || "0",
      capacity: event.capacity?.toString() || "",
      payment_methods: event.payment_methods || [],
      registration_deadline: formatUtcToDatetimeLocal(event.registration_deadline || ""),
      payment_deadline: formatUtcToDatetimeLocal(event.payment_deadline || ""),
    }),
    [event]
  );

  // react-hook-formの初期化
  const form = useForm<EventEditFormDataRHF>({
    resolver: zodResolver(eventEditFormSchema),
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

  // 無料イベントの場合は決済方法をクリア
  useEffect(() => {
    if (isFreeEvent) {
      form.setValue("payment_methods", []);
    }
  }, [isFreeEvent, form]);

  // 現在のフォームデータを取得（EventFormData形式に変換、numeric フィールドの型安全性確保）
  const getCurrentFormData = useCallback((): EventFormData => {
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
    };
  }, [watchedValues]);

  // 現在のフォームデータをメモ化（変更検出のリアクティブ性確保）
  const currentFormData = useMemo(() => getCurrentFormData(), [getCurrentFormData]);

  // 分割されたフックの初期化
  const restrictions = useEventRestrictions({ hasAttendees, attendeeCount });
  const changes = useEventChanges({
    event,
    formData: currentFormData,
    hasValidationErrors: !form.formState.isValid,
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

          // submitWithErrorHandling を使用してエラーハンドリングを統一
          const result = await submitWithErrorHandling(
            () => submission.submitForm(formData, detectedChanges, (errors) => {
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
              eventId: event.id
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
            resolve({ success: false, error: result.error?.userMessage || "更新に失敗しました。もう一度お試しください。" });
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
            };

            // 実際の送信処理
            const result = await submission.submitForm(formData, changeList, (errors) => {
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
              error_message: error instanceof Error ? error.message : String(error)
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
      return restrictions.isFieldRestricted(field, currentFormData);
    },
    [restrictions, currentFormData]
  );

  // フィールド編集可能チェック
  const isFieldEditable = useCallback(
    (field: string): boolean => {
      return restrictions.isFieldEditable(field, currentFormData);
    },
    [restrictions, currentFormData]
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
      getFieldDisplayName: restrictions.getFieldDisplayName,
      getRestrictionReason: restrictions.getRestrictionReason,
      getRestrictedFields: () => restrictions.getRestrictedFields(currentFormData),
      getRestrictedFieldNames: () => restrictions.getRestrictedFieldNames(currentFormData),
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
