"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { ServerActionResult } from "@core/types/server-actions";

import { submitContact } from "./actions";

/**
 * お問い合わせ入力スキーマ（クライアント用）
 */
export const ContactInputSchema = z.object({
  name: z.string().min(1, "氏名を入力してください").max(100, "氏名は100文字以内で入力してください"),
  email: z
    .string()
    .email("有効なメールアドレスを入力してください")
    .max(320, "メールアドレスは320文字以内で入力してください"),
  message: z
    .string()
    .min(10, "お問い合わせ内容は10文字以上で入力してください")
    .max(4000, "お問い合わせ内容は4000文字以内で入力してください"),
  consent: z.boolean().refine((val) => val === true, {
    message: "プライバシーポリシーに同意してください",
  }),
});

export type ContactInput = z.infer<typeof ContactInputSchema>;

/**
 * お問い合わせフォーム用React Hook
 */
export function useContactForm() {
  const [isPending, startTransition] = useTransition();
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<ContactInput>({
    resolver: zodResolver(ContactInputSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
      consent: false,
    },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      try {
        const result = (await submitContact(data)) as ServerActionResult<{ ok: boolean }>;

        if (result && (result as any).success === true) {
          // 成功
          setIsSuccess(true);
          form.reset();
        } else {
          // エラーハンドリング（ServerActionError 準拠）
          const error = result as any;

          if (error?.fieldErrors) {
            error.fieldErrors.forEach(
              (fieldError: { field: string; code: string; message: string }) => {
                form.setError(fieldError.field as keyof ContactInput, {
                  type: "server",
                  message: fieldError.message,
                });
              }
            );
          }

          const baseMessage = error?.error || error?.detail || error?.title || "送信に失敗しました";
          const retryAfterSec = error?.details?.retryAfterSec;
          const composed =
            typeof retryAfterSec === "number"
              ? `${baseMessage}（約${retryAfterSec}秒後に再度お試しください）`
              : baseMessage;

          form.setError("root", {
            type: "server",
            message: composed,
          });
        }
      } catch (err) {
        // 予期せぬエラー
        form.setError("root", {
          type: "manual",
          message: "送信中にエラーが発生しました。しばらく待ってから再度お試しください。",
        });
      }
    });
  });

  return {
    form,
    onSubmit,
    isPending,
    isSuccess,
    resetSuccess: () => setIsSuccess(false),
  };
}
