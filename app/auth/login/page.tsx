"use client";

import Link from "next/link";
import { loginAction } from "@/app/auth/actions";
import {
  useAuthForm,
  AuthFormWrapper,
  AuthEmailField,
  AuthPasswordField,
  AuthSubmitButton,
} from "@/components/auth";

export default function LoginPage() {
  const { state, formAction, isPending } = useAuthForm(loginAction);

  return (
    <AuthFormWrapper
      title="ログイン"
      subtitle="EventPayアカウントにログインしてください"
      state={state}
      isPending={isPending}
      formAction={formAction}
    >
      <AuthEmailField
        name="email"
        label="メールアドレス"
        placeholder="example@mail.com"
        fieldErrors={state.fieldErrors?.email}
        required
      />

      <AuthPasswordField
        name="password"
        label="パスワード"
        placeholder="パスワードを入力"
        fieldErrors={state.fieldErrors?.password}
        autoComplete="current-password"
        required
      />

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="rememberMe"
            name="rememberMe"
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label
            htmlFor="rememberMe"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            ログイン状態を保持
          </label>
        </div>
        <Link
          href="/auth/reset-password"
          className="text-blue-600 hover:text-blue-500 hover:underline"
        >
          パスワードを忘れた方
        </Link>
      </div>

      <AuthSubmitButton isPending={isPending}>ログイン</AuthSubmitButton>

      <div className="text-center text-sm text-gray-600">
        アカウントをお持ちでない方は{" "}
        <Link href="/auth/register" className="text-blue-600 hover:text-blue-500 hover:underline">
          新規登録
        </Link>
      </div>
    </AuthFormWrapper>
  );
}
