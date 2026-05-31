"use client";

import { useCallback, useEffect, useState } from "react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

interface UseAuthResendOtpParams {
  email: string | null;
  type?: string;
  cooldownSeconds?: number;
  action: (formData: FormData) => Promise<ActionResult>;
}

export function useAuthResendOtp({
  email,
  type,
  cooldownSeconds = 60,
  action,
}: UseAuthResendOtpParams) {
  const [isPending, setIsPending] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((current) => current - 1), 1000);
      return () => clearTimeout(timer);
    }

    if (isDisabled) {
      setIsDisabled(false);
    }
  }, [countdown, isDisabled]);

  const resend = useCallback(async () => {
    if (!email || isDisabled) {
      return;
    }

    setIsPending(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("email", email);
      if (type) {
        formData.append("type", type);
      }

      const result = await action(formData);

      if (!result.success) {
        setError(result.error.userMessage);
        return;
      }

      setMessage("確認メールを再送信しました");
      setIsDisabled(true);
      setCountdown(cooldownSeconds);
    } catch {
      setError("再送信に失敗しました。");
    } finally {
      setIsPending(false);
    }
  }, [action, cooldownSeconds, email, isDisabled, type]);

  return {
    resend,
    isPending,
    isDisabled,
    countdown,
    message,
    error,
  };
}
