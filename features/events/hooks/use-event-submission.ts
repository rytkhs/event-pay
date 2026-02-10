"use client";

import { useCallback } from "react";

import { useRouter } from "next/navigation";

import { AppError } from "@core/errors";
import {
  toAppResultFromActionResult,
  type ActionResult,
} from "@core/errors/adapters/server-actions";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import type { Event } from "@core/types/models";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { handleClientError } from "@core/utils/error-handler.client";
import type { EventFormData } from "@core/validation/event";

import { ChangeItem } from "@/components/ui/change-confirmation-dialog";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type SubmissionActionMeta = {
  message?: string;
  redirectUrl?: string;
  needsVerification?: boolean;
};
type SubmissionActionResult = AppResult<EventRow, SubmissionActionMeta>;

export type UpdateEventAction = (
  eventId: string,
  formData: FormData
) => Promise<ActionResult<EventRow>>;

interface UseEventSubmissionProps {
  eventId: string;
  onSubmit?: (data: Event) => void;
  updateEventAction: UpdateEventAction;
}

interface FormErrors {
  title?: string;
  description?: string;
  location?: string;
  date?: string;
  fee?: string;
  capacity?: string;
  payment_methods?: string;
  registration_deadline?: string;
  payment_deadline?: string;
  allow_payment_after_deadline?: string;
  grace_period_days?: string;
  general?: string;
}

export function useEventSubmission({
  eventId,
  onSubmit,
  updateEventAction,
}: UseEventSubmissionProps) {
  const router = useRouter();

  const extractFormErrorsFromAppError = useCallback((error: AppError): FormErrors => {
    const errors: FormErrors = {};
    const details = error.details as Record<string, unknown> | undefined;

    if (!details) {
      return errors;
    }

    const fields: Array<keyof FormErrors> = [
      "title",
      "description",
      "location",
      "date",
      "fee",
      "capacity",
      "payment_methods",
      "registration_deadline",
      "payment_deadline",
      "allow_payment_after_deadline",
      "grace_period_days",
    ];
    const fieldSet = new Set(fields);

    for (const [field, value] of Object.entries(details)) {
      if (field === "_form" && Array.isArray(value) && typeof value[0] === "string") {
        errors.general = value[0];
        continue;
      }

      if (!fieldSet.has(field as keyof FormErrors)) {
        continue;
      }

      if (Array.isArray(value) && typeof value[0] === "string") {
        errors[field as keyof FormErrors] = value[0];
      }
    }

    return errors;
  }, []);

  const processSubmissionResult = useCallback(
    (result: SubmissionActionResult, setErrors: (errors: FormErrors) => void): AppResult<Event> => {
      if (result.success) {
        if (!result.data) {
          const appError = new AppError("INTERNAL_ERROR", {
            userMessage: "エラーが発生しました。もう一度お試しください。",
          });
          setErrors({ general: appError.userMessage });
          return errResult(appError);
        }

        const updatedEvent = result.data;
        const dataWithStatus: Event = {
          ...updatedEvent,
          status: deriveEventStatus(updatedEvent.date, updatedEvent.canceled_at ?? null),
        };
        if (onSubmit) {
          onSubmit(dataWithStatus);
        } else {
          router.push(`/events/${eventId}`);
        }
        return okResult(dataWithStatus);
      }

      const errorMessage = result.error.userMessage || "エラーが発生しました";
      const errors = extractFormErrorsFromAppError(result.error);

      if (Object.keys(errors).length === 0) {
        errors.general = errorMessage;
      }

      setErrors(errors);
      return errResult(result.error);
    },
    [eventId, extractFormErrorsFromAppError, onSubmit, router]
  );

  const createFormDataFromSubmission = useCallback(
    (data: EventFormData | Partial<EventFormData>): FormData => {
      const formDataObj = new FormData();
      const clearable = new Set([
        "location",
        "description",
        "capacity",
        "payment_deadline",
        "payment_methods",
      ]);

      Object.entries(data).forEach(([key, value]) => {
        if (value == null) {
          return;
        }

        if (Array.isArray(value)) {
          if (value.length === 0 && clearable.has(key)) {
            // 空配列はクリア意図として空文字を1つ送る
            formDataObj.append(key, "");
          } else {
            value.forEach((v) => formDataObj.append(key, v));
          }
        } else if (typeof value === "boolean") {
          formDataObj.append(key, String(value));
        } else if (value === "" && clearable.has(key)) {
          // 空文字でも明示的に送る（クリア）
          formDataObj.append(key, "");
        } else if (value !== "") {
          formDataObj.append(key, String(value));
        }
      });

      return formDataObj;
    },
    []
  );

  // フォーム送信処理（型安全）
  const submitForm = useCallback(
    async (
      formData: EventFormData | Partial<EventFormData>,
      setErrors: (errors: FormErrors) => void
    ): Promise<AppResult<Event>> => {
      try {
        const formDataObj = createFormDataFromSubmission(formData);

        // サーバーアクション実行
        const result = await updateEventAction(eventId, formDataObj);
        const appResult = toAppResultFromActionResult(result);
        return processSubmissionResult(appResult, setErrors);
      } catch (error) {
        const appError = handleClientError(error, {
          category: "event_management",
          action: "event_update_failed",
          eventId,
        });
        setErrors({
          general: appError.userMessage || "エラーが発生しました。もう一度お試しください。",
        });
        return errResult(appError);
      }
    },
    [createFormDataFromSubmission, eventId, processSubmissionResult, updateEventAction]
  );

  // 送信前のデータ準備（バリデーション済みデータの変換）
  const prepareSubmissionData = useCallback((formData: EventFormData, changes: ChangeItem[]) => {
    // 変更があるフィールドのみを送信データに含める
    const submissionData: Partial<EventFormData> = {};

    changes.forEach((change) => {
      const field = change.field as keyof EventFormData;
      const value = formData[field];

      // 型安全なフィールドアクセス
      switch (field) {
        case "title":
          submissionData.title = value as string;
          break;
        case "description":
          submissionData.description = value as string;
          break;
        case "location":
          submissionData.location = value as string;
          break;
        case "date":
          submissionData.date = value as string;
          break;
        case "fee":
          submissionData.fee = value as string;
          break;
        case "capacity":
          submissionData.capacity = value as string;
          break;
        case "payment_methods":
          submissionData.payment_methods = value as string[];
          break;
        case "registration_deadline":
          submissionData.registration_deadline = value as string;
          break;
        case "payment_deadline":
          submissionData.payment_deadline = value as string;
          break;
        case "allow_payment_after_deadline":
          submissionData.allow_payment_after_deadline = value as boolean;
          break;
        case "grace_period_days":
          submissionData.grace_period_days = value as string;
          break;
      }
    });

    // 無料イベント（fee=0）の整合性強制維持
    // 注意: これは変更確認ダイアログで明示されない副次的変更を含む
    // ユーザーが参加費を0円に変更した場合、決済関連項目を自動的にクリアして
    // データの一貫性を保つ（無料イベントに決済手段は不要なため）
    const feeValue = Number(formData.fee || "0");
    if (feeValue === 0) {
      // 無料イベントの場合、決済関連項目を強制的にクリアして整合性を保つ
      submissionData.payment_methods = []; // 決済方法をクリア
      submissionData.payment_deadline = ""; // 決済締切をクリア
      submissionData.allow_payment_after_deadline = false; // 締切後決済を無効化
      submissionData.grace_period_days = "0"; // 猶予日数をリセット
    }

    return submissionData;
  }, []);

  // FormDataオブジェクトの構築
  const buildFormData = useCallback(
    (data: EventFormData): FormData => {
      return createFormDataFromSubmission(data);
    },
    [createFormDataFromSubmission]
  );

  // レスポンス処理
  const handleSubmissionResponse = useCallback(
    (result: SubmissionActionResult, setErrors: (errors: FormErrors) => void): AppResult<Event> =>
      processSubmissionResult(result, setErrors),
    [processSubmissionResult]
  );

  // エラーハンドリング
  const handleSubmissionError = useCallback(
    (error: unknown, setErrors: (errors: FormErrors) => void): AppResult<Event> => {
      const appError = handleClientError(error, {
        category: "event_management",
        action: "event_submission_failed",
        eventId,
      });
      setErrors({
        general: appError.userMessage || "エラーが発生しました。もう一度お試しください。",
      });
      return errResult(appError);
    },
    [eventId]
  );

  // 送信状況の監視
  const getSubmissionStatus = useCallback((result: AppResult<Event>) => {
    return {
      isLoading: false, // 実際の実装では状態管理が必要
      isSuccess: result.success,
      isError: !result.success,
      errorMessage: result.success ? undefined : result.error.userMessage,
      data: result.success ? result.data : undefined,
    };
  }, []);

  return {
    submitForm,
    prepareSubmissionData,
    buildFormData,
    handleSubmissionResponse,
    handleSubmissionError,
    getSubmissionStatus,
  };
}
