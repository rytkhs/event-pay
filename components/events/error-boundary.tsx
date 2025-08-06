"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
}

interface ErrorFallbackProps {
  error?: Error;
  resetError: () => void;
}

/**
 * React Error Boundary コンポーネント
 * 予期しないエラーをキャッチして、ユーザーフレンドリーなエラー画面を表示
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // エラーログを記録

    // 本番環境では外部ログサービスに送信
    if (process.env.NODE_ENV === "production") {
      // TODO: 外部ログサービスに送信
      // logErrorToService(error, errorInfo);
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error} resetError={this.resetError} />;
    }

    return this.props.children;
  }
}

/**
 * デフォルトのエラーフォールバックコンポーネント
 */
function DefaultErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const handleGoHome = () => {
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="text-red-500 mb-4">
          <AlertTriangle className="h-16 w-16 mx-auto" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-4">エラーが発生しました</h2>

        <p className="text-gray-600 mb-6">
          申し訳ございません。予期しないエラーが発生しました。
          ページを再読み込みするか、ホームページに戻ってください。
        </p>

        {process.env.NODE_ENV === "development" && error && (
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
          <Button onClick={resetError} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
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

/**
 * 参加フォーム専用のエラーフォールバック
 */
export function ParticipationErrorFallback({ error: _error, resetError }: ErrorFallbackProps) {
  return (
    <Card className="p-6 border-red-200 bg-red-50">
      <div className="flex items-start space-x-3">
        <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-red-800 mb-2">参加申し込みでエラーが発生しました</h3>
          <p className="text-red-700 text-sm mb-4">
            申し込み処理中に問題が発生しました。しばらく時間をおいて再度お試しください。
          </p>
          <Button
            onClick={resetError}
            size="sm"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            再試行
          </Button>
        </div>
      </div>
    </Card>
  );
}
