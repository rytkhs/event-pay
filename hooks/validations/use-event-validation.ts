"use client";

import { useState, useCallback } from "react";
import { z } from "zod";
import { updateEventSchema } from "@/lib/validations/event";
import {
  convertDatetimeLocalToUtc,
  isUtcDateFuture,
  DateConversionError,
} from "@/lib/utils/timezone";
import { safeParseNumber, parseCapacity } from "@/lib/utils/number-parsers";
import type { EventFormData } from "@/types/models";

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
  general?: string;
}

interface UseEventValidationProps {
  hasAttendees: boolean;
  attendeeCount: number;
}

interface FieldValidationContext {
  formData: EventFormData;
}

export function useEventValidation({ hasAttendees, attendeeCount }: UseEventValidationProps) {
  const [errors, setErrors] = useState<FormErrors>({});

  // 内部バリデーション関数（エラーオブジェクトの更新なし）
  const validateFieldInternally = useCallback(
    (field: string, value: string | string[], context: FieldValidationContext): string | null => {
      // 型安全なバリデーション
      switch (field) {
        case "title":
          if (!value || (typeof value === "string" && value.trim() === "")) {
            return "タイトルは必須です";
          } else if (typeof value === "string" && value.length > 100) {
            return "タイトルは100文字以内で入力してください";
          }
          break;

        case "description":
          if (typeof value === "string" && value.length > 1000) {
            return "説明は1000文字以内で入力してください";
          }
          break;

        case "location":
          if (typeof value === "string" && value.length > 200) {
            return "場所は200文字以内で入力してください";
          }
          break;

        case "date":
          if (!value || (typeof value === "string" && value.trim() === "")) {
            return "開催日時は必須です";
          } else if (typeof value === "string") {
            // datetime-local値をUTCに変換して未来日時かチェック
            try {
              const utcDate = convertDatetimeLocalToUtc(value);
              if (!isUtcDateFuture(utcDate)) {
                return "開催日時は現在時刻より後に設定してください";
              }
            } catch (error) {
              if (error instanceof DateConversionError) {
                return error.message;
              }
              return "無効な日時形式です";
            }
          }
          break;

        case "fee":
          if (typeof value === "string") {
            const numValue = safeParseNumber(value, -1);
            if (value !== "" && (numValue < 0 || numValue > 1000000)) {
              return "参加費は0以上1000000以下で入力してください";
            }
          }
          break;

        case "capacity":
          if (typeof value === "string" && value !== "") {
            const numValue = parseCapacity(value);
            if (numValue === null) {
              return "定員は1以上10000以下で入力してください";
            } else if (hasAttendees && numValue < attendeeCount) {
              return `定員は現在の参加者数（${attendeeCount}名）以上で設定してください`;
            }
          }
          break;

        case "payment_methods":
          if (Array.isArray(value)) {
            if (value.length === 0) {
              return "決済方法を選択してください";
            } else if (value.includes("free") && value.length > 1) {
              return "無料イベントと有料決済方法を同時に選択することはできません";
            }
          }
          break;

        case "registration_deadline":
          if (typeof value === "string" && value !== "") {
            try {
              const regUtcDate = convertDatetimeLocalToUtc(value);
              const eventUtcDate = convertDatetimeLocalToUtc(context.formData.date);
              if (regUtcDate >= eventUtcDate) {
                return "参加申込締切は開催日時より前に設定してください";
              }
            } catch (error) {
              if (error instanceof DateConversionError) {
                return `参加申込締切: ${error.message}`;
              }
              return "無効な日時形式です";
            }
          }
          break;

        case "payment_deadline":
          if (typeof value === "string" && value !== "") {
            try {
              const payUtcDate = convertDatetimeLocalToUtc(value);
              const eventUtcDate = convertDatetimeLocalToUtc(context.formData.date);
              const regDeadline = context.formData.registration_deadline
                ? convertDatetimeLocalToUtc(context.formData.registration_deadline)
                : null;

              if (payUtcDate >= eventUtcDate) {
                return "決済締切は開催日時より前に設定してください";
              } else if (regDeadline && payUtcDate < regDeadline) {
                return "決済締切は参加申込締切以降に設定してください";
              }
            } catch (error) {
              if (error instanceof DateConversionError) {
                return `決済締切: ${error.message}`;
              }
              return "無効な日時形式です";
            }
          }
          break;
      }
      return null;
    },
    [hasAttendees, attendeeCount]
  );

  // 強化されたバリデーション関数（従来方式 + runtime check）
  const validateField = useCallback(
    (field: string, value: string | string[], context: FieldValidationContext) => {
      const newErrors = { ...errors };

      const fieldError = validateFieldInternally(field, value, context);
      if (fieldError) {
        newErrors[field as keyof FormErrors] = fieldError;
      } else {
        delete newErrors[field as keyof FormErrors];
      }

      setErrors(newErrors);
    },
    [errors, validateFieldInternally]
  );

  // 全フィールドバリデーション関数
  const validateAllFields = useCallback(
    (formData: EventFormData) => {
      const newErrors: FormErrors = {};
      const context: FieldValidationContext = { formData };

      // 全フィールドを検証
      const fieldsToValidate = [
        { field: "title", value: formData.title },
        { field: "description", value: formData.description },
        { field: "location", value: formData.location },
        { field: "date", value: formData.date },
        { field: "fee", value: formData.fee },
        { field: "capacity", value: formData.capacity },
        { field: "payment_methods", value: formData.payment_methods },
        { field: "registration_deadline", value: formData.registration_deadline },
        { field: "payment_deadline", value: formData.payment_deadline },
      ];

      fieldsToValidate.forEach(({ field, value }) => {
        const fieldErrors = validateFieldInternally(field, value, context);
        if (fieldErrors) {
          newErrors[field as keyof FormErrors] = fieldErrors;
        }
      });

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [validateFieldInternally]
  );

  // Zodスキーマバリデーション（セキュリティ強化）
  const validateWithZodSchema = useCallback((formData: EventFormData) => {
    try {
      const validationData: Record<string, string> = {};

      // 空でないフィールドのみをバリデーション対象に
      Object.entries(formData).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          if (value.length > 0) {
            validationData[key] = value.join(",");
          }
        } else if (value !== "") {
          validationData[key] = value;
        }
      });

      updateEventSchema.parse(validationData);
      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: FormErrors = {};
        error.errors.forEach((err) => {
          const field = err.path[0] as keyof FormErrors;
          fieldErrors[field] = err.message;
        });
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
        return { success: false, errors: fieldErrors };
      }
      return { success: false, errors: {} };
    }
  }, []);

  // エラー状態のクリア
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  // 特定フィールドのエラークリア
  const clearFieldError = useCallback((field: keyof FormErrors) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  // エラー状態の取得
  const hasErrors = Object.keys(errors).length > 0;
  const hasFieldError = useCallback(
    (field: keyof FormErrors) => {
      return !!errors[field];
    },
    [errors]
  );

  return {
    errors,
    hasErrors,
    hasFieldError,
    validateField,
    validateAllFields,
    validateWithZodSchema,
    clearErrors,
    clearFieldError,
    setErrors,
  };
}
