"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ConfirmEmailPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const confirmEmail = async () => {
      const token = searchParams.get("token");
      const email = searchParams.get("email");

      if (!token || !email) {
        setStatus("error");
        setErrorMessage("確認リンクが不正です");
        return;
      }

      try {
        const response = await fetch(`/api/auth/confirm-email?token=${token}&email=${encodeURIComponent(email)}`, {
          redirect: 'manual'
        });

        if (response.status === 302) {
          // リダイレクトが返された場合は成功
          setStatus("success");
          setTimeout(() => {
            router.push("/dashboard");
          }, 2000);
        } else if (response.ok) {
          // 200系レスポンスも成功として扱う
          setStatus("success");
          setTimeout(() => {
            router.push("/dashboard");
          }, 2000);
        } else {
          const data = await response.json();
          setStatus("error");
          setErrorMessage(data.error || "確認に失敗しました");
        }
      } catch {
        setStatus("error");
        setErrorMessage("ネットワークエラーが発生しました");
      }
    };

    confirmEmail();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md space-y-4 text-center">
        {status === "loading" && (
          <>
            <h1 className="text-2xl font-bold">メールアドレスを確認中...</h1>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="text-2xl font-bold text-green-600">確認完了</h1>
            <p>メールアドレスの確認が完了しました。</p>
            <p className="text-sm text-gray-600">ダッシュボードにリダイレクトします...</p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-2xl font-bold text-red-600">確認に失敗しました</h1>
            <p className="text-red-600">{errorMessage}</p>
            <button
              onClick={() => router.push("/auth/confirm")}
              className="w-full p-2 bg-blue-600 text-white rounded"
            >
              確認ページに戻る
            </button>
          </>
        )}
      </div>
    </div>
  );
}
