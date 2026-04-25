"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import type { ActionResult } from "@core/errors";
import { FeedbackInputSchema, type FeedbackInput } from "@core/validation/feedback";

import { submitFeedback } from "./actions";

export { FeedbackInputSchema };
export type { FeedbackInput };

const defaultValues: FeedbackInput = {
  category: "feature_request",
  message: "",
  pageContext: "",
  name: "",
  email: "",
  consent: false,
};

export function useFeedbackForm() {
  const [isPending, startTransition] = useTransition();
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<FeedbackInput>({
    resolver: zodResolver(FeedbackInputSchema),
    defaultValues,
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      try {
        const result = (await submitFeedback(data)) as ActionResult;

        if (result.success) {
          setIsSuccess(true);
          form.reset(defaultValues);
          return;
        }

        const error = result.error;
        if (error.fieldErrors) {
          Object.entries(error.fieldErrors).forEach(([field, messages]) => {
            if (messages && messages.length > 0) {
              form.setError(field as keyof FeedbackInput, {
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
      } catch {
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
