"use client";

import Link from "next/link";
import { useState } from "react";
import { usePasswordConfirmation } from "@/lib/hooks/usePasswordConfirmation";
import { PasswordStatusIcon } from "@/components/ui/PasswordStatusIcon";
import { registerAction } from "@/app/auth/actions";
import {
  useAuthForm,
  AuthFormWrapper,
  AuthFormField,
  AuthEmailField,
  AuthSubmitButton,
} from "@/components/auth";

export default function RegisterPage() {
  // 共通認証フォームフック
  const { state, formAction, isPending } = useAuthForm(registerAction);

  // パスワード確認カスタムフック
  const passwordConfirmation = usePasswordConfirmation();

  // 利用規約同意状態
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [termsError, setTermsError] = useState("");

  const handleSubmit = async (formData: FormData) => {
    // 利用規約同意バリデーション
    if (!termsAgreed) {
      setTermsError("利用規約に同意してください");
      return;
    }
    setTermsError("");

    // パスワード確認バリデーション
    if (!passwordConfirmation.actions.validateMatch()) {
      return;
    }

    // 確認パスワードが空の場合
    if (passwordConfirmation.validation.isEmpty) {
      return;
    }

    // フォームデータにパスワードと利用規約同意を追加
    formData.set("password", passwordConfirmation.state.password);
    formData.set("confirmPassword", passwordConfirmation.state.confirmPassword);
    formData.set("termsAgreed", termsAgreed.toString());

    // Server Actionを実行
    return formAction(formData);
  };

  return (
    <AuthFormWrapper
      title="ユーザー登録"
      subtitle="EventPayアカウントを作成してください"
      state={state}
      isPending={isPending}
      formAction={handleSubmit}
    >
      <AuthFormField
        type="text"
        name="name"
        label="名前"
        placeholder="名前を入力してください"
        fieldErrors={state.fieldErrors?.name}
        required
      />

      <AuthEmailField
        name="email"
        label="メールアドレス"
        placeholder="example@mail.com"
        fieldErrors={state.fieldErrors?.email}
        autoComplete="email"
        required
      />

      <AuthFormField
        type="password"
        name="password"
        label="パスワード"
        placeholder="英数字を含む8文字以上"
        value={passwordConfirmation.state.password}
        onChange={(e) => passwordConfirmation.actions.setPassword(e.target.value)}
        autoComplete="new-password"
        disabled={isPending}
        fieldErrors={state.fieldErrors?.password}
        required
      />

      <div className="space-y-2">
        <AuthFormField
          type="password"
          name="confirmPassword"
          label="パスワード（確認）"
          placeholder="上記と同じパスワードを入力"
          value={passwordConfirmation.state.confirmPassword}
          onChange={(e) => passwordConfirmation.actions.setConfirmPassword(e.target.value)}
          onBlur={passwordConfirmation.actions.validateMatch}
          autoComplete="new-password"
          disabled={isPending}
          error={
            passwordConfirmation.validation.hasError
              ? passwordConfirmation.state.error
              : state.fieldErrors?.confirmPassword?.[0]
          }
          required
        />

        {passwordConfirmation.validation.iconType === "success" && (
          <PasswordStatusIcon type="success" message="パスワードが一致しています" />
        )}
        {passwordConfirmation.validation.iconType === "error" && (
          <PasswordStatusIcon type="error" message={passwordConfirmation.state.error} />
        )}

        <div className="text-xs text-gray-500">上記と同じパスワードを入力してください</div>
      </div>

      {/* 利用規約同意チェックボックス */}
      <div className="space-y-2">
        <div className="flex items-start space-x-2">
          <input
            type="checkbox"
            id="terms-agreement"
            checked={termsAgreed}
            onChange={(e) => setTermsAgreed(e.target.checked)}
            className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            aria-required="true"
            aria-describedby="terms-description"
            disabled={isPending}
          />
          <label
            htmlFor="terms-agreement"
            className="text-sm text-gray-700 leading-5 cursor-pointer"
          >
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
            >
              利用規約
            </Link>
            に同意する
          </label>
        </div>

        <div id="terms-description" className="text-xs text-gray-500">
          EventPayをご利用いただくには利用規約への同意が必要です
        </div>

        {termsError && (
          <div data-testid="terms-error" className="text-red-500 text-sm" role="alert">
            {termsError}
          </div>
        )}
      </div>

      <AuthSubmitButton isPending={isPending}>登録</AuthSubmitButton>

      <div className="text-center text-sm text-gray-600">
        既にアカウントをお持ちの方は{" "}
        <Link href="/auth/login" className="text-blue-600 hover:text-blue-500 hover:underline">
          ログイン
        </Link>
      </div>
    </AuthFormWrapper>
  );
}
