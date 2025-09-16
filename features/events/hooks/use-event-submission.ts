"use client";

import { useCallback } from "react";

import { useRouter } from "next/navigation";

import { logger } from "@core/logging/app-logger";
import type { Event, EventFormData } from "@core/types/models";
import { deriveEventStatus } from "@core/utils/derive-event-status";

import { ChangeItem } from "@/components/ui/change-confirmation-dialog";

import { updateEventAction } from "../actions/update-event";

// 型安全なSubmitResult
interface SubmitResult {
  success: boolean;
  data?: Event;
  error?: string;
}

interface UseEventSubmissionProps {
  eventId: string;
  onSubmit?: (data: Event) => void;
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

export function useEventSubmission({ eventId, onSubmit }: UseEventSubmissionProps) {
  const router = useRouter();

  // フォーム送信処理（型安全）
  const submitForm = useCallback(
    async (
      formData: EventFormData,
      changes: ChangeItem[],
      setErrors: (errors: FormErrors) => void
    ): Promise<SubmitResult> => {
      try {
        // FormDataオブジェクトの構築
        const formDataObj = new FormData();

        Object.entries(formData).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach((v) => formDataObj.append(key, v));
          } else if (typeof value === "boolean") {
            formDataObj.append(key, String(value));
          } else if (value !== "") {
            formDataObj.append(key, value);
          }
        });

        // サーバーアクション実行
        const result = await updateEventAction(eventId, formDataObj);

        if (result.success && result.data) {
          // ステータス算出を付与
          const dataWithStatus: Event = {
            ...(result.data as any),
            status: deriveEventStatus(
              (result.data as any).date,
              (result.data as any).canceled_at ?? null
            ),
          };
          // 成功時の処理
          if (onSubmit) {
            onSubmit(dataWithStatus);
          } else {
            router.push(`/events/${eventId}`);
          }
          return { success: true, data: dataWithStatus };
        } else {
          // 失敗時の処理
          const errorMessage = result.success === false ? result.error : "エラーが発生しました";
          setErrors({ general: errorMessage });
          return { success: false, error: errorMessage };
        }
      } catch (error) {
        logger.error("Event update failed", {
          tag: "eventUpdate",
          event_id: eventId,
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
        });
        const errorMessage = "エラーが発生しました。もう一度お試しください。";
        setErrors({ general: errorMessage });
        return { success: false, error: errorMessage };
      }
    },
    [eventId, onSubmit, router]
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

    return submissionData;
  }, []);

  // FormDataオブジェクトの構築
  const buildFormData = useCallback((data: EventFormData): FormData => {
    const formDataObj = new FormData();

    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => formDataObj.append(key, v));
      } else if (typeof value === "boolean") {
        formDataObj.append(key, String(value));
      } else if (value !== "") {
        formDataObj.append(key, value);
      }
    });

    return formDataObj;
  }, []);

  // 送信データの検証
  const validateSubmissionData = useCallback((formData: EventFormData): boolean => {
    // 基本的な必須フィールドのチェック
    if (!formData.title?.trim()) {
      return false;
    }
    if (!formData.date?.trim()) {
      return false;
    }
    if (!formData.payment_methods || formData.payment_methods.length === 0) {
      return false;
    }

    return true;
  }, []);

  // レスポンス処理
  const handleSubmissionResponse = useCallback(
    (result: any, setErrors: (errors: FormErrors) => void): SubmitResult => {
      if (result.success && result.data) {
        if (onSubmit) {
          onSubmit(result.data);
        } else {
          router.push(`/events/${eventId}`);
        }
        return { success: true, data: result.data };
      } else {
        const errorMessage = result.success === false ? result.error : "エラーが発生しました";
        setErrors({ general: errorMessage });
        return { success: false, error: errorMessage };
      }
    },
    [eventId, onSubmit, router]
  );

  // エラーハンドリング
  const handleSubmissionError = useCallback(
    (error: any, setErrors: (errors: FormErrors) => void): SubmitResult => {
      logger.error("Event submission failed", {
        tag: "eventSubmission",
        event_id: eventId,
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
      const errorMessage = "エラーが発生しました。もう一度お試しください。";
      setErrors({ general: errorMessage });
      return { success: false, error: errorMessage };
    },
    [eventId]
  );

  // 送信状況の監視
  const getSubmissionStatus = useCallback((result: SubmitResult) => {
    return {
      isLoading: false, // 実際の実装では状態管理が必要
      isSuccess: result.success,
      isError: !result.success,
      errorMessage: result.error,
      data: result.data,
    };
  }, []);

  return {
    submitForm,
    prepareSubmissionData,
    buildFormData,
    validateSubmissionData,
    handleSubmissionResponse,
    handleSubmissionError,
    getSubmissionStatus,
  };
}
