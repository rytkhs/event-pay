"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface InviteErrorProps {
  errorMessage: string;
  showRetry?: boolean;
}

export function InviteError({ errorMessage, showRetry = false }: InviteErrorProps) {
  const handleRetry = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    window.location.href = "/";
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto">
        <Card className="p-8 text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">アクセスできません</h2>
          <p className="text-gray-600 mb-6">{errorMessage}</p>

          <div className="space-y-3">
            {showRetry && (
              <Button
                onClick={handleRetry}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                再試行
              </Button>
            )}
            <Button onClick={handleGoHome} variant="outline" className="w-full">
              ホームに戻る
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
