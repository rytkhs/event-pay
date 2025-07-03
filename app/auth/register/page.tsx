"use client";

import Link from "next/link";
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
    formData.set("confirmPassword", passwordConfirmation.state.confirmPassword);

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
