"use client";

import { useEffect, useRef, useState } from "react";

import { Loader2, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface DemoEntryPageProps {
  startDemoSession: () => Promise<void>;
}

export function DemoEntryPage({ startDemoSession }: DemoEntryPageProps) {
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
  const productionUrl = process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://minnano-shukin.com";

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      try {
        await startDemoSession();
      } catch (e: any) {
        // NEXT_REDIRECT エラーは正常なリダイレクト動作なので再スローする
        if (e.message === "NEXT_REDIRECT" || e.digest?.startsWith("NEXT_REDIRECT")) {
          throw e;
        }

        setError("デモ環境の構築に失敗しました。");
        console.error(e);
      }
    };
    init();
  }, [startDemoSession]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-gray-900">
        <div className="text-center">
          <h1 className="mb-4 text-xl font-bold text-red-600">エラーが発生しました</h1>
          <p className="mb-8 text-sm text-gray-600">{error}</p>
          <div className="flex flex-col items-center gap-4">
            <Button
              onClick={() => window.location.reload()}
              variant="default"
              className="w-full sm:w-auto"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              再試行する
            </Button>
            <a
              href={productionUrl}
              className="text-sm text-gray-500 hover:text-gray-900 hover:underline transition-colors"
            >
              トップへ戻る
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 text-gray-900">
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
        <h1 className="text-xl font-bold">デモ環境をセットアップ中...</h1>
        <p className="mt-2 text-sm text-gray-500">自動的にダッシュボードへ移動します。</p>
      </div>
    </div>
  );
}
