"use client";

import Link from "next/link";

import { updatePasswordAction } from "@core/actions/auth";

import {
  useAuthForm,
  AuthFormWrapper,
  AuthFormField,
  AuthSubmitButton,
  usePasswordConfirmation,
} from "@features/auth";

import { PasswordStatusIcon } from "@/components/ui/PasswordStatusIcon";

export default function UpdatePasswordPage() {
  // 共通認証フォームフック
  const { state, formAction, isPending } = useAuthForm(updatePasswordAction);

  // パスワード確認カスタムフック
  const passwordConfirmation = usePasswordConfirmation();

  const handleSubmit = async (formData: FormData) => {
    // パスワード確認バリデーション
    if (!passwordConfirmation.actions.validateMatch()) {
      return;
    }

    // 確認パスワードが空の場合
    if (passwordConfirmation.validation.isEmpty) {
      return;
    }

    // フォームデータにパスワードを追加
    formData.set("password", passwordConfirmation.state.password);
    formData.set("passwordConfirm", passwordConfirmation.state.confirmPassword);

    // Server Actionを実行
    return formAction(formData);
  };

  return (
    <AuthFormWrapper
      title="新しいパスワードの設定"
      subtitle="パスワードリセット用の新しいパスワードを設定してください"
      state={state}
      isPending={isPending}
      action={handleSubmit}
    >
      <AuthFormField
        type="password"
        name="password"
        label="新しいパスワード"
        placeholder="8文字以上"
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
          name="passwordConfirm"
          label="新しいパスワード（確認）"
          placeholder="上記と同じパスワードを入力"
          value={passwordConfirmation.state.confirmPassword}
          onChange={(e) => passwordConfirmation.actions.setConfirmPassword(e.target.value)}
          onBlur={passwordConfirmation.actions.validateMatch}
          autoComplete="new-password"
          disabled={isPending}
          error={
            passwordConfirmation.validation.hasError
              ? passwordConfirmation.state.error
              : state.fieldErrors?.passwordConfirm?.[0]
          }
          required
        />

        {passwordConfirmation.validation.iconType === "success" && (
          <PasswordStatusIcon type="success" message="パスワードが一致しています" />
        )}
        {passwordConfirmation.validation.iconType === "error" && (
          <PasswordStatusIcon type="error" message={passwordConfirmation.state.error} />
        )}
      </div>

      <AuthSubmitButton isPending={isPending}>パスワード更新</AuthSubmitButton>

      <div className="text-center">
        <Link
          href="/login"
          className="inline-block py-2 text-sm sm:text-base text-blue-600 hover:text-blue-500 hover:underline"
        >
          ログインページに戻る
        </Link>
      </div>
    </AuthFormWrapper>
  );
}
