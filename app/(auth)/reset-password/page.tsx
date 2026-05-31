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
        // placeholder="登録したメールアドレスを入力"
        fieldErrors={error?.fieldErrors?.email}
        required
      />

      <AuthSubmitButton isPending={isPending}>確認コード送信</AuthSubmitButton>

      <div className="flex flex-col gap-2 text-center">
        <div>
          <Link
            href="/login"
            className="inline-block py-2 text-sm text-primary hover:text-primary/80 hover:underline sm:text-base"
          >
            ログインページに戻る
          </Link>
        </div>
        <div className="text-sm text-muted-foreground sm:text-base">
          アカウントをお持ちでない方は{" "}
          <Link
            href="/register"
            className="inline-block py-1 text-primary hover:text-primary/80 hover:underline"
          >
            アカウント作成
          </Link>
        </div>
      </div>
    </AuthFormWrapper>
  );
}
