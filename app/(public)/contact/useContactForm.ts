"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import { ContactInputSchema, type ContactInput } from "@core/validation/contact";

import { submitContact } from "./actions";

export { ContactInputSchema };
export type { ContactInput };

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
        const result = (await submitContact(data)) as ActionResult;

        if (result.success) {
          // 成功
          setIsSuccess(true);
          form.reset();
        } else {
          const error = result.error;

          if (error.fieldErrors) {
            Object.entries(error.fieldErrors).forEach(([field, messages]) => {
              if (messages && messages.length > 0) {
                form.setError(field as keyof ContactInput, {
                  type: "server",
                  message: messages[0],
                });
              }
            });
          }

          const baseMessage = error.userMessage || "送信に失敗しました";
          const retryAfterSec = (error.details as { retryAfterSec?: number } | undefined)
            ?.retryAfterSec;
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
