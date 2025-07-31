"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * アプリケーション全体のエラーページ
 * Next.js App Routerの error.tsx ファイル
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // エラーをログに記録
    console.error("Application error:", error);

    // 本番環境では外部ログサービスに送信
    if (process.env.NODE_ENV === "production") {
      // TODO: 外部ログサービスに送信
      // logErrorToService(error);
    }
  }, [error]);

  const handleGoHome = () => {
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="text-red-500 mb-4">
          <AlertTriangle className="h-16 w-16 mx-auto" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-4">エラーが発生しました</h1>

        <p className="text-gray-600 mb-6">
          申し訳ございません。予期しないエラーが発生しました。
          ページを再読み込みするか、ホームページに戻ってください。
        </p>

        {process.env.NODE_ENV === "development" && (
          <details className="mb-6 text-left">
            <summary className="cursor-pointer text-sm text-gray-500 mb-2">
              エラー詳細（開発環境のみ）
            </summary>
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <div className="space-y-3">
          <Button onClick={reset} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            <RefreshCw className="h-4 w-4 mr-2" />
            再試行
          </Button>

          <Button onClick={handleGoHome} variant="outline" className="w-full">
            <Home className="h-4 w-4 mr-2" />
            ホームに戻る
          </Button>
        </div>
      </Card>
    </div>
  );
}
