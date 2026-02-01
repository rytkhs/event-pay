"use client";

import { useTransition, useEffect } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFormState } from "react-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import { useFocusManagement } from "@core/hooks/useFocusManagement";

// useAuthFormのオプション型
interface UseAuthFormOptions<T extends ActionResult> {
  onSuccess?: (result: T) => void;
  redirectOnSuccess?: boolean;
  initialState?: Partial<T>;
  enableFocusManagement?: boolean;
}

/**
 * 認証フォーム用カスタムフック
 * Server Actionsを使った認証フォームの共通処理を提供
 * オプションでフォーカス管理機能を統合
 *
 * @param action - Server Action関数
 * @param options - フック動作のオプション
 * @returns フォーム状態とアクション、ペンディング状態、フォーカス管理関数
 */
export function useAuthForm<T extends ActionResult>(
  action: (formData: FormData) => Promise<T>,
  options: UseAuthFormOptions<T> = {}
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { focusFirstError } = useFocusManagement();

  // デフォルト初期状態
  const defaultInitialState = {
    success: false,
    ...options.initialState,
  } as T;

  // useFormStateで状態管理
  const [state, dispatch] = useFormState(
    async (prevState: Awaited<T>, formData: FormData): Promise<T> => {
      return await action(formData);
    },
    defaultInitialState as Awaited<T>
  );
  const error = state.success ? undefined : state.error;

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

  // フォーカス管理（オプション有効時）
  useEffect(() => {
    if (options.enableFocusManagement !== false && !state.success) {
      const fieldErrors = error?.fieldErrors;
      if (fieldErrors && Object.keys(fieldErrors).length > 0) {
        focusFirstError(Object.keys(fieldErrors));
      }
    }
  }, [error?.fieldErrors, state.success, focusFirstError, options.enableFocusManagement]);

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
    focusFirstError,
  };
}

// === react-hook-form実装（新実装） ===

// バリデーションスキーマ
const loginSchema = z.object({
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("有効なメールアドレスを入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});

const registerSchema = z.object({
  name: z.string().min(1, "表示名を入力してください").max(50, "名前は50文字以内で入力してください"),
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("有効なメールアドレスを入力してください"),
  password: z.string().min(8, "パスワードは8文字以上で入力してください"),
});

type LoginFormDataRHF = z.infer<typeof loginSchema>;
type RegisterFormDataRHF = z.infer<typeof registerSchema>;

interface UseAuthFormRHFOptions<T> {
  enableFocusManagement?: boolean;
  onSuccess?: (result: T) => void;
  onError?: (error: string) => void;
}

// ログインフォーム用react-hook-formフック
export function useLoginFormRHF<T extends ActionResult>(
  action: (formData: FormData) => Promise<T>,
  options: UseAuthFormRHFOptions<T> = {}
) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<LoginFormDataRHF>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      try {
        // FormDataオブジェクトに変換
        const formData = new FormData();
        formData.append("email", data.email);
        formData.append("password", data.password);

        const result = await action(formData);

        if (result.success) {
          if (options.onSuccess) {
            options.onSuccess(result);
          }

          const redirectUrl = result.redirectUrl || "/dashboard";
          router.push(redirectUrl);
        } else {
          // エラー時でもリダイレクトが必要な場合（例：未確認ユーザー）
          if (result.redirectUrl) {
            router.push(result.redirectUrl);
            return; // リダイレクトするのでエラーメッセージは設定しない
          }

          // 通常のエラー処理
          if (result.error?.fieldErrors) {
            Object.entries(result.error.fieldErrors).forEach(([field, errors]) => {
              if (errors && errors.length > 0) {
                form.setError(field as keyof LoginFormDataRHF, {
                  type: "server",
                  message: errors[0],
                });
              }
            });
          }

          if (result.error?.userMessage) {
            form.setError("root", {
              type: "server",
              message: result.error.userMessage,
            });

            if (options.onError) {
              options.onError(result.error.userMessage);
            }
          }
        }
      } catch (_) {
        form.setError("root", {
          type: "manual",
          message: "ログイン中にエラーが発生しました。もう一度お試しください。",
        });
      }
    });
  });

  return {
    form,
    onSubmit,
    isPending,
  };
}

// 会員登録フォーム用react-hook-formフック
export function useRegisterFormRHF<T extends ActionResult>(
  action: (formData: FormData) => Promise<T>,
  options: UseAuthFormRHFOptions<T> = {}
) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<RegisterFormDataRHF>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      try {
        // FormDataオブジェクトに変換
        const formData = new FormData();
        formData.append("name", data.name);
        formData.append("email", data.email);
        formData.append("password", data.password);
        formData.append("termsAgreed", "true"); // 暗黙的に同意とみなす

        const result = await action(formData);

        if (result.success) {
          if (options.onSuccess) {
            options.onSuccess(result);
          }

          if (result.needsVerification) {
            router.push("/auth/verify-email");
          } else {
            const redirectUrl = result.redirectUrl || "/dashboard";
            router.push(redirectUrl);
          }
        } else {
          // サーバーエラーをフォームエラーとして設定
          if (result.error?.fieldErrors) {
            Object.entries(result.error.fieldErrors).forEach(([field, errors]) => {
              if (errors && errors.length > 0) {
                form.setError(field as keyof RegisterFormDataRHF, {
                  type: "server",
                  message: errors[0],
                });
              }
            });
          }

          if (result.error?.userMessage) {
            form.setError("root", {
              type: "server",
              message: result.error.userMessage,
            });

            if (options.onError) {
              options.onError(result.error.userMessage);
            }
          }
        }
      } catch (_) {
        form.setError("root", {
          type: "manual",
          message: "アカウント作成中にエラーが発生しました。もう一度お試しください。",
        });
      }
    });
  });

  return {
    form,
    onSubmit,
    isPending,
  };
}
