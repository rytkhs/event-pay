'use client'

import Link from 'next/link'

import { useAuthForm, AuthFormWrapper, AuthEmailField, AuthSubmitButton } from '@features/auth'

import { resetPasswordAction } from '@/app/(auth)/actions'

export default function ResetPasswordPage() {
  const { state, formAction, isPending } = useAuthForm(resetPasswordAction, {
    redirectOnSuccess: false, // メール送信成功時はリダイレクトしない
  })

  return (
    <AuthFormWrapper
      title="パスワードリセット"
      subtitle="登録されたメールアドレスにリセット用のリンクを送信します"
      state={state}
      isPending={isPending}
      action={formAction}
      testId="reset-password-form"
    >
      <AuthEmailField
        name="email"
        label="メールアドレス"
        placeholder="登録されたメールアドレスを入力"
        fieldErrors={state.fieldErrors?.email}
        required
      />

      <AuthSubmitButton isPending={isPending}>リセットメール送信</AuthSubmitButton>

      <div className="text-center space-y-2">
        <div className="text-sm text-gray-600">
          <Link href="/login" className="text-blue-600 hover:text-blue-500 hover:underline">
            ログインページに戻る
          </Link>
        </div>
        <div className="text-sm text-gray-600">
          アカウントをお持ちでない方は{' '}
          <Link href="/register" className="text-blue-600 hover:text-blue-500 hover:underline">
            新規登録
          </Link>
        </div>
      </div>
    </AuthFormWrapper>
  )
}
