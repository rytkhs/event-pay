"use client";

import { ReactNode, useEffect, useRef } from "react";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import { useFocusManagement } from "@core/hooks/useFocusManagement";

import { AuthCard } from "./AuthCard";
import { AuthFormMessages } from "./AuthFormMessages";

interface AuthFormWrapperProps {
  title: string;
  subtitle?: string;
  state: ActionResult;
  isPending: boolean;
  children: ReactNode;
  action?: string | ((formData: FormData) => void | Promise<void>);
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  testId?: string;
}

/**
 * 認証フォームラッパーコンポーネント
 * 認証ページの共通レイアウトとフォーム設定を提供
 * フォーカス管理機能を統合
 */
export function AuthFormWrapper({
  title,
  subtitle,
  state,
  isPending,
  children,
  action,
  className = "",
  maxWidth = "md",
  testId,
}: AuthFormWrapperProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const { focusFirstError, restoreFocus } = useFocusManagement();
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const error = state.success ? undefined : state.error;

  // フォーム送信前に現在のフォーカス要素を保存
  useEffect(() => {
    if (isPending) {
      previousActiveElement.current = document.activeElement as HTMLElement;
    }
  }, [isPending]);

  // エラー発生時に最初のエラーフィールドにフォーカス
  useEffect(() => {
    if (error?.fieldErrors) {
      const errorFields = Object.keys(error.fieldErrors);
      focusFirstError(errorFields);
    }
  }, [error?.fieldErrors, focusFirstError]);

  // フォーム送信完了後のフォーカス復元
  useEffect(() => {
    if (!isPending && previousActiveElement.current) {
      // 送信が完了し、エラーがない場合はフォーカスを復元
      if (state.success || !error?.fieldErrors) {
        restoreFocus(previousActiveElement.current);
      }
      previousActiveElement.current = null;
    }
  }, [isPending, state.success, error?.fieldErrors, restoreFocus]);
  return (
    <AuthCard title={title} description={subtitle} maxWidth={maxWidth} className="py-12">
      <form
        ref={formRef}
        action={typeof action === "string" ? action : undefined}
        onSubmit={
          typeof action === "function"
            ? async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                await action(formData);
              }
            : undefined
        }
        className={`flex flex-col gap-4 md:gap-6 ${className}`}
        noValidate
        aria-describedby={error?.userMessage ? "form-error" : undefined}
        data-testid={testId}
      >
        <AuthFormMessages state={state} />

        <fieldset className="flex flex-col gap-3 md:gap-4">{children}</fieldset>
      </form>
    </AuthCard>
  );
}
