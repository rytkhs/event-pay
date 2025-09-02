"use client";

import { useState, useEffect, Suspense } from "react";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

import { verifyOtpAction, resendOtpAction } from "../actions";

function VerifyOtpContent() {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [success, setSuccess] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email");

  // カウントダウンタイマー
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (resendDisabled && countdown === 0) {
      setResendDisabled(false);
    }
  }, [countdown, resendDisabled]);

  // メールアドレスがない場合はリダイレクト
  useEffect(() => {
    if (!email) {
      router.push("/register");
    }
  }, [email, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || !otp.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("otp", otp.trim());
      formData.append("type", "signup");

      const result = await verifyOtpAction(formData);

      if (result?.error) {
        setError(result.error);
      } else if (result?.success && result?.redirectUrl) {
        setSuccess(true);
        // 成功時はセッション状態を更新してからダッシュボードにリダイレクト
        router.refresh(); // クライアント側のセッション状態を更新
        setTimeout(() => {
          router.push(result.redirectUrl!);
        }, 1500);
      }
    } catch {
      // console.error("OTP verification error:", _);
      setError("認証に失敗しました。再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email || resendDisabled) {
      return;
    }

    setResendLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("email", email);

      const result = await resendOtpAction(formData);

      if (result.error) {
        setError(result.error);
      } else {
        setResendDisabled(true);
        setCountdown(60);
        setError(null);
      }
    } catch {
      setError("再送信に失敗しました。");
    } finally {
      setResendLoading(false);
    }
  };

  if (!email) {
    return null; // リダイレクト中
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md space-y-6">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">認証完了</h1>
            <p className="text-gray-600">メールアドレスが確認されました</p>
            <p className="text-sm text-gray-500 mt-2">ダッシュボードに移動中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md space-y-6">
        {/* ヘッダー */}
        <header className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">確認コードを入力</h1>
          <p className="mt-2 text-gray-600">
            <span className="font-mono text-sm">{email}</span>{" "}
            に送信された6桁のコードを入力してください
          </p>
        </header>

        {/* フォーム */}
        <main>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="otp" className="sr-only">
                確認コード
              </label>
              <input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setOtp(value);
                }}
                placeholder="123456"
                maxLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-md text-center text-2xl font-mono tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoComplete="one-time-code"
                required
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-500">6桁の数字を入力してください</p>
            </div>

            {error && (
              <div className="p-3 rounded-md text-sm bg-red-50 text-red-800 border border-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className={`w-full p-3 rounded-md font-medium transition-colors ${
                loading || otp.length !== 6
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-current"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  認証中...
                </span>
              ) : (
                "確認"
              )}
            </button>
          </form>

          {/* 再送信セクション */}
          <div className="mt-6 text-center space-y-3">
            <p className="text-sm text-gray-500">コードが届かない場合は？</p>

            <button
              onClick={handleResend}
              disabled={resendDisabled || resendLoading}
              className={`text-sm ${
                resendDisabled || resendLoading
                  ? "text-gray-400 cursor-not-allowed"
                  : "text-blue-600 hover:text-blue-800 underline"
              }`}
            >
              {resendLoading
                ? "送信中..."
                : resendDisabled
                  ? `再送信まで ${countdown}秒`
                  : "コードを再送信"}
            </button>
          </div>
        </main>

        {/* フッター */}
        <footer className="text-center">
          <div className="text-xs text-gray-400">
            <Link href="/login" className="hover:text-gray-600 underline">
              ログインページに戻る
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md space-y-6">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <svg className="animate-spin w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
              <p className="text-gray-600">読み込み中...</p>
            </div>
          </div>
        </div>
      }
    >
      <VerifyOtpContent />
    </Suspense>
  );
}
