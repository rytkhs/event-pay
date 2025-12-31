"use client";

import { useCallback } from "react";

import { useRouter } from "next/navigation";

import type { Event, EventFormData } from "@core/types/models";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { handleClientError } from "@core/utils/error-handler.client";

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
      formData: EventFormData | Partial<EventFormData>,
      changes: ChangeItem[],
      setErrors: (errors: FormErrors) => void
    ): Promise<SubmitResult> => {
      try {
        // FormDataオブジェクトの構築（clearable項目は空文字も送信してクリア意図を伝える）
        const formDataObj = new FormData();
        const clearable = new Set([
          "location",
          "description",
          "capacity",
          "payment_deadline",
          "payment_methods",
        ]);

        Object.entries(formData).forEach(([key, value]) => {
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
          // 失敗時の処理 - 詳細なエラー情報を解析してフィールド別エラーを設定
          const errorMessage = result.success === false ? result.error : "エラーが発生しました";

          // サーバーエラーの詳細を解析してフィールド別エラーを設定
          const errors: FormErrors = {};

          // result.successがfalseの場合のみfieldErrorsやdetailsにアクセス可能
          if (!result.success) {
            // fieldErrorsがある場合（Zodバリデーションエラー）
            if (result.fieldErrors && Array.isArray(result.fieldErrors)) {
              result.fieldErrors.forEach((fieldError) => {
                if (fieldError.field && fieldError.message) {
                  errors[fieldError.field as keyof FormErrors] = fieldError.message;
                }
              });
            }

            // details内のfieldErrorsがある場合（カスタムバリデーションエラー）
            if (result.details?.fieldErrors && Array.isArray(result.details.fieldErrors)) {
              result.details.fieldErrors.forEach((fieldError: any) => {
                if (fieldError.field && fieldError.message) {
                  errors[fieldError.field as keyof FormErrors] = fieldError.message;
                }
              });
            }

            // violationsがある場合（制限違反エラー）
            if (result.details?.violations && Array.isArray(result.details.violations)) {
              result.details.violations.forEach((violation: any) => {
                if (violation.field && violation.reason) {
                  errors[violation.field as keyof FormErrors] = violation.reason;
                }
              });
            }
          }

          // フィールド別エラーが設定されていない場合はgeneralエラーを設定
          if (Object.keys(errors).length === 0) {
            errors.general = errorMessage;
          }

          setErrors(errors);
          return { success: false, error: errorMessage };
        }
      } catch (error) {
        handleClientError(error, {
          category: "event_management",
          action: "event_update_failed",
          eventId,
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
  const buildFormData = useCallback((data: EventFormData): FormData => {
    const formDataObj = new FormData();
    const clearable = new Set([
      "location",
      "description",
      "capacity",
      "payment_deadline",
      "payment_methods",
    ]);

    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length === 0 && clearable.has(key)) {
          formDataObj.append(key, "");
        } else {
          value.forEach((v) => formDataObj.append(key, v));
        }
      } else if (typeof value === "boolean") {
        formDataObj.append(key, String(value));
      } else if (value === "" && clearable.has(key)) {
        formDataObj.append(key, "");
      } else if (value !== "") {
        formDataObj.append(key, value);
      }
    });

    return formDataObj;
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
      handleClientError(error, {
        category: "event_management",
        action: "event_submission_failed",
        eventId,
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
    handleSubmissionResponse,
    handleSubmissionError,
    getSubmissionStatus,
  };
}
