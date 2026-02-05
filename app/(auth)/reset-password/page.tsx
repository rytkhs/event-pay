"use client";

import Link from "next/link";

export const dynamic = "force-dynamic";

import { useAuthForm, AuthFormWrapper, AuthEmailField, AuthSubmitButton } from "@features/auth";

import { resetPasswordAction } from "@/app/(auth)/actions";
export default function ResetPasswordPage() {
  const { state, formAction, isPending } = useAuthForm(resetPasswordAction, {
    redirectOnSuccess: true, // OTP送信成功時はverify-otpページにリダイレクト
  });
  const error = state.success ? undefined : state.error;

  return (
    <AuthFormWrapper
      title="パスワードリセット"
      subtitle="登録されたメールアドレスに確認コードを送信します"
      state={state}
      isPending={isPending}
      action={formAction}
      testId="reset-password-form"
    >
      <AuthEmailField
        name="email"
        label="メールアドレス"
        placeholder="登録されたメールアドレスを入力"
        fieldErrors={error?.fieldErrors?.email}
        required
      />

      <AuthSubmitButton isPending={isPending}>確認コード送信</AuthSubmitButton>

      <div className="text-center space-y-3 sm:space-y-2">
        <div>
          <Link
            href="/login"
            className="inline-block py-2 text-sm sm:text-base text-blue-600 hover:text-blue-500 hover:underline"
          >
            ログインページに戻る
          </Link>
        </div>
        <div className="text-sm sm:text-base text-gray-600">
          アカウントをお持ちでない方は{" "}
          <Link
            href="/register"
            className="inline-block py-1 text-blue-600 hover:text-blue-500 hover:underline"
          >
            新規登録
          </Link>
        </div>
      </div>
    </AuthFormWrapper>
  );
}
