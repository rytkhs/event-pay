"use client";

import { useCallback, useEffect, useMemo, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import type { RestrictableField } from "@core/domain/event-edit-restrictions";
import { AppError } from "@core/errors";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import { useErrorHandler } from "@core/hooks/use-error-handler";
import type { Event } from "@core/types/models";
import { safeParseNumber } from "@core/utils/number-parsers";
import { formatUtcToDatetimeLocal } from "@core/utils/timezone";
import type { EventFormData } from "@core/validation/event";

import type { ChangeItem } from "@/components/ui/change-confirmation-dialog";

import { createEventEditFormSchema, type EventEditFormDataRHF } from "../validation";

import { useEventChanges } from "./use-event-changes";
import { useEventSubmission, type UpdateEventAction } from "./use-event-submission";
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
  updateEventAction: UpdateEventAction;
}

export type { UpdateEventAction, EventEditFormDataRHF };

const RESTRICTABLE_FIELDS = new Set<RestrictableField>([
  "fee",
  "payment_methods",
  "capacity",
  "title",
  "description",
  "location",
  "date",
  "registration_deadline",
  "payment_deadline",
  "allow_payment_after_deadline",
  "grace_period_days",
]);

const isRestrictableField = (field: string): field is RestrictableField => {
  return RESTRICTABLE_FIELDS.has(field as RestrictableField);
};

export function useEventEditForm({
  event,
  attendeeCount,
  onSubmit,
  hasStripePaid,
  updateEventAction,
}: UseEventEditFormProps) {
  const hasAttendees = attendeeCount > 0;
  const [isPending, startTransition] = useTransition();
  const { handleError } = useErrorHandler();

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
      allow_payment_after_deadline: event.allow_payment_after_deadline ?? false,
      grace_period_days: (event.grace_period_days ?? 0).toString(),
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
  const formDataSnapshot = useFormDataSnapshot({ ...currentFormData });
  const unifiedRestrictions = useUnifiedRestrictions(restrictionContext, formDataSnapshot);

  // 分割されたフックの初期化
  const changes = useEventChanges({
    event,
    formData: currentFormData,
    hasValidationErrors: !form.formState.isValid,
    isFieldEditable: (field: string) =>
      isRestrictableField(field) ? unifiedRestrictions.isFieldEditable(field) : true,
  });
  const submission = useEventSubmission({ eventId: event.id, onSubmit, updateEventAction });

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

  // RHFフォームデータを送信用のEventFormDataへ変換
  const toEventFormData = useCallback((data: EventEditFormDataRHF): EventFormData => {
    return {
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
  }, []);

  // フォーム送信処理
  const handleSubmit = useCallback(
    async (data: EventEditFormDataRHF) => {
      return new Promise<AppResult<void>>((resolve) => {
        startTransition(async () => {
          try {
            const formData = toEventFormData(data);

            // 変更検出
            const detectedChanges = detectChanges();

            if (detectedChanges.length === 0) {
              const appError = new AppError("VALIDATION_ERROR", {
                userMessage: "変更がありません",
                retryable: false,
              });
              form.setError("root", {
                type: "manual",
                message: appError.userMessage,
              });
              resolve(errResult(appError));
              return;
            }

            const result = await submission.submitForm(formData, (errors) => {
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

            if (result.success) {
              resolve(okResult());
              return;
            }

            resolve(errResult(result.error));
          } catch (error) {
            const appError = handleError(error, {
              category: "event_management",
              action: "event_edit",
              eventId: event.id,
            });
            form.setError("root", {
              type: "manual",
              message: appError.userMessage || "更新に失敗しました。もう一度お試しください。",
            });
            resolve(errResult(appError));
          }
        });
      });
    },
    [form, detectChanges, submission, startTransition, event.id, handleError, toEventFormData]
  );

  // 変更リストを指定して送信する関数
  const submitFormWithChanges = useCallback(
    async (data: EventEditFormDataRHF, changeList: ChangeItem[]) => {
      const submissionResultPromise = new Promise<AppResult<void>>((resolve) => {
        startTransition(async () => {
          try {
            const fullFormData = toEventFormData(data);

            // 確認された変更のみを含むフォームデータを作成
            const selectedFormData = submission.prepareSubmissionData(fullFormData, changeList);

            // 実際の送信処理（選択された変更のみ）
            const submissionResult = await submission.submitForm(selectedFormData, (errors) => {
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

            if (submissionResult.success) {
              resolve(okResult());
              return;
            }

            resolve(errResult(submissionResult.error));
          } catch (error) {
            const appError = handleError(error, {
              category: "event_management",
              action: "event_update_error",
              eventId: event.id,
            });
            form.setError("root", {
              type: "manual",
              message: appError.userMessage || "更新に失敗しました。もう一度お試しください。",
            });
            resolve(errResult(appError));
          }
        });
      });

      return submissionResultPromise;
    },
    [form, submission, startTransition, event.id, handleError, toEventFormData]
  );

  // フィールド制限チェック
  const isFieldRestricted = useCallback(
    (field: string): boolean => {
      return isRestrictableField(field) ? unifiedRestrictions.isFieldRestricted(field) : false;
    },
    [unifiedRestrictions]
  );

  // フィールド編集可能チェック
  const isFieldEditable = useCallback(
    (field: string): boolean => {
      return isRestrictableField(field) ? unifiedRestrictions.isFieldEditable(field) : true;
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
