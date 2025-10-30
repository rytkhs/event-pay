"use client";

import { useTransition, useEffect } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFormState } from "react-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useFocusManagement } from "@core/hooks/useFocusManagement";

// Server Action結果の共通型（既存と同じ）
export interface ServerActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
  redirectUrl?: string;
  needsEmailConfirmation?: boolean;
}

// 旧useAuthForm実装（パスワードリセット等で使用）

// useAuthFormのオプション型
interface UseAuthFormOptions<T extends ServerActionResult> {
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
export function useAuthForm<T extends ServerActionResult>(
  action: (formData: FormData) => Promise<T>,
  options: UseAuthFormOptions<T> = {}
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { focusFirstError } = useFocusManagement();

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

  // フォーカス管理（オプション有効時）
  useEffect(() => {
    if (
      options.enableFocusManagement !== false &&
      !state.success &&
      state.fieldErrors &&
      Object.keys(state.fieldErrors).length > 0
    ) {
      const errorFields = Object.keys(state.fieldErrors);
      focusFirstError(errorFields);
    }
  }, [state.fieldErrors, state.success, focusFirstError, options.enableFocusManagement]);

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
  rememberMe: z.boolean().optional(),
});

const registerSchema = z
  .object({
    name: z.string().min(1, "名前を入力してください").max(50, "名前は50文字以内で入力してください"),
    email: z
      .string()
      .min(1, "メールアドレスを入力してください")
      .email("有効なメールアドレスを入力してください"),
    password: z.string().min(8, "パスワードは8文字以上で入力してください"),
    passwordConfirm: z.string().min(1, "パスワード確認を入力してください"),
    termsAgreed: z.boolean().refine((val) => val === true, "利用規約に同意してください"),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "パスワードが一致しません",
    path: ["passwordConfirm"],
  });

type LoginFormDataRHF = z.infer<typeof loginSchema>;
type RegisterFormDataRHF = z.infer<typeof registerSchema>;

interface UseAuthFormRHFOptions<T> {
  enableFocusManagement?: boolean;
  onSuccess?: (result: T) => void;
  onError?: (error: string) => void;
}

// ログインフォーム用react-hook-formフック
export function useLoginFormRHF<T extends ServerActionResult>(
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
      rememberMe: false,
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
        if (data.rememberMe) {
          formData.append("rememberMe", "true");
        }

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
          if (result.fieldErrors) {
            Object.entries(result.fieldErrors).forEach(([field, errors]) => {
              if (errors && errors.length > 0) {
                form.setError(field as keyof LoginFormDataRHF, {
                  type: "server",
                  message: errors[0],
                });
              }
            });
          }

          if (result.error) {
            form.setError("root", {
              type: "server",
              message: result.error,
            });

            if (options.onError) {
              options.onError(result.error);
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
export function useRegisterFormRHF<T extends ServerActionResult>(
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
      passwordConfirm: "",
      termsAgreed: false,
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
        formData.append("passwordConfirm", data.passwordConfirm);
        formData.append("termsAgreed", data.termsAgreed.toString());

        const result = await action(formData);

        if (result.success) {
          if (options.onSuccess) {
            options.onSuccess(result);
          }

          if (result.needsEmailConfirmation) {
            router.push("/auth/verify-email");
          } else {
            const redirectUrl = result.redirectUrl || "/dashboard";
            router.push(redirectUrl);
          }
        } else {
          // サーバーエラーをフォームエラーとして設定
          if (result.fieldErrors) {
            Object.entries(result.fieldErrors).forEach(([field, errors]) => {
              if (errors && errors.length > 0) {
                form.setError(field as keyof RegisterFormDataRHF, {
                  type: "server",
                  message: errors[0],
                });
              }
            });
          }

          if (result.error) {
            form.setError("root", {
              type: "server",
              message: result.error,
            });

            if (options.onError) {
              options.onError(result.error);
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
