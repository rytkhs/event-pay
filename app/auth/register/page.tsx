"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiResponse, getErrorMessage } from "@/lib/types/api";
import { usePasswordConfirmation } from "@/lib/hooks/usePasswordConfirmation";
import { PasswordStatusIcon } from "@/components/ui/PasswordStatusIcon";
import { FormField } from "@/components/ui/FormField";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // パスワード確認カスタムフック
  const passwordConfirmation = usePasswordConfirmation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setFieldErrors({});

    // パスワード確認バリデーション
    if (!passwordConfirmation.actions.validateMatch()) {
      setLoading(false);
      return;
    }

    // 確認パスワードが空の場合
    if (passwordConfirmation.validation.isEmpty) {
      setLoading(false);
      return;
    }

    // 送信用データの構築
    const submitData = {
      ...formData,
      password: passwordConfirmation.state.password,
      confirmPassword: passwordConfirmation.state.confirmPassword,
    };

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      });

      const data: ApiResponse = await response.json();

      if (data.success) {
        router.push(`/auth/confirm?email=${encodeURIComponent(formData.email)}`);
      } else {
        // フィールド固有のエラーがある場合
        if (data.details) {
          setFieldErrors(data.details);
          setError("入力内容を確認してください");
        } else {
          setError(getErrorMessage(data.error, "登録に失敗しました"));
        }
      }
    } catch {
      setError("登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">ユーザー登録</h1>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <FormField label="名前" error={fieldErrors.name} required>
          <input
            type="text"
            placeholder="名前を入力してください"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 transition-colors ${
              fieldErrors.name ? "border-red-500" : "border-gray-300"
            }`}
          />
        </FormField>

        <FormField label="メールアドレス" error={fieldErrors.email} required>
          <input
            type="email"
            placeholder="example@mail.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 transition-colors ${
              fieldErrors.email ? "border-red-500" : "border-gray-300"
            }`}
          />
        </FormField>

        <FormField label="パスワード" error={fieldErrors.password} required>
          <input
            type="password"
            placeholder="英数字を含む8文字以上"
            value={passwordConfirmation.state.password}
            onChange={(e) => passwordConfirmation.actions.setPassword(e.target.value)}
            required
            className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 transition-colors ${
              fieldErrors.password ? "border-red-500" : "border-gray-300"
            }`}
          />
        </FormField>

        <div className="space-y-1">
          <input
            type="password"
            placeholder="パスワード（確認）"
            value={passwordConfirmation.state.confirmPassword}
            onChange={(e) => passwordConfirmation.actions.setConfirmPassword(e.target.value)}
            onBlur={passwordConfirmation.actions.validateMatch}
            required
            aria-label="パスワード確認入力"
            aria-describedby="password-confirm-help"
            aria-invalid={passwordConfirmation.validation.hasError ? "true" : "false"}
            className={passwordConfirmation.validation.className}
          />

          {/* エラーメッセージ */}
          {passwordConfirmation.validation.hasError && (
            <div role="alert" aria-live="polite" className="text-red-600 text-sm">
              {passwordConfirmation.state.error}
            </div>
          )}
          {fieldErrors.confirmPassword && (
            <div className="text-red-600 text-sm">{fieldErrors.confirmPassword}</div>
          )}

          {/* ステータスアイコンとメッセージ */}
          {passwordConfirmation.validation.iconType === "success" && (
            <PasswordStatusIcon type="success" message="パスワードが一致しています" />
          )}
          {passwordConfirmation.validation.iconType === "error" && (
            <PasswordStatusIcon type="error" message={passwordConfirmation.state.error} />
          )}

          {/* ヘルプテキスト */}
          <div id="password-confirm-help" className="text-xs text-gray-500">
            上記と同じパスワードを入力してください
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full p-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? "登録中..." : "登録"}
        </button>
      </form>
    </div>
  );
}
