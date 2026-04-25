"use client";

import { useState, useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import {
  CommunityContactInputSchema,
  type CommunityContactInput,
} from "@core/validation/community-contact";

import { submitCommunityContact } from "./actions";

export { CommunityContactInputSchema };
export type { CommunityContactInput };

export function useCommunityContactForm(communitySlug: string) {
  const [isPending, startTransition] = useTransition();
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<CommunityContactInput>({
    resolver: zodResolver(CommunityContactInputSchema),
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
        const result = (await submitCommunityContact(communitySlug, data)) as ActionResult<void>;

        if (result.success) {
          setIsSuccess(true);
          form.reset();
          return;
        }

        const error = result.error;
        const hasFieldErrors = Object.values(error.fieldErrors ?? {}).some(
          (messages) => messages.length > 0
        );

        if (error.fieldErrors) {
          Object.entries(error.fieldErrors).forEach(([field, messages]) => {
            if (messages && messages.length > 0) {
              form.setError(field as keyof CommunityContactInput, {
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

        if (!hasFieldErrors) {
          form.setError("root", {
            type: "server",
            message: composed,
          });
        }
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
