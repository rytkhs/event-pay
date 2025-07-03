"use client";

import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

// Server Action結果の共通型
export interface ServerActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
  redirectUrl?: string;
  needsEmailConfirmation?: boolean;
}

// useAuthFormのオプション型
interface UseAuthFormOptions<T extends ServerActionResult> {
  onSuccess?: (result: T) => void;
  redirectOnSuccess?: boolean;
  initialState?: Partial<T>;
}

/**
 * 認証フォーム用カスタムフック
 * Server Actionsを使った認証フォームの共通処理を提供
 *
 * @param action - Server Action関数
 * @param options - フック動作のオプション
 * @returns フォーム状態とアクション、ペンディング状態
 */
export function useAuthForm<T extends ServerActionResult>(
  action: (formData: FormData) => Promise<T>,
  options: UseAuthFormOptions<T> = {}
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // デフォルト初期状態
  const defaultInitialState = {
    success: false,
    error: "",
    ...options.initialState,
  } as T;

  // useFormStateで状態管理
  const [state, dispatch] = useFormState(
    async (prevState: Awaited<T>, formData: FormData): Promise<T> => {
      return await action(formData);
    },
    defaultInitialState as Awaited<T>
  );

  // 成功時・リダイレクト必要時の処理
  useEffect(() => {
    if (state.success) {
      // カスタム成功ハンドラーがあれば実行
      if (options.onSuccess) {
        options.onSuccess(state);
      }

      // リダイレクト処理（デフォルトで有効）
      if (options.redirectOnSuccess !== false && state.redirectUrl) {
        router.push(state.redirectUrl);
      }
    } else if (state.redirectUrl) {
      // 失敗時でもリダイレクトが必要な場合（例：未確認ユーザー）
      router.push(state.redirectUrl);
    }
  }, [state, router, options]);

  // ペンディング状態付きフォームアクション
  const enhancedFormAction = (formData: FormData) => {
    startTransition(() => {
      dispatch(formData);
    });
  };

  return {
    state,
    formAction: enhancedFormAction,
    isPending,
  };
}

/**
 * フィールドエラー取得ヘルパー
 */
export function getFieldError(
  fieldErrors: Record<string, string[]> | undefined,
  fieldName: string
): string | undefined {
  return fieldErrors?.[fieldName]?.[0];
}

/**
 * フィールドにエラーがあるかチェック
 */
export function hasFieldError(
  fieldErrors: Record<string, string[]> | undefined,
  fieldName: string
): boolean {
  return Boolean(fieldErrors?.[fieldName]?.length);
}
