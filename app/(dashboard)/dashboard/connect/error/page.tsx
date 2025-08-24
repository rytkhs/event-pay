/**
 * Stripe Connect エラーページ
 */

import { Suspense } from "react";
import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

export const metadata: Metadata = {
  title: "設定エラー | EventPay",
  description: "Stripe Connect設定中にエラーが発生しました",
};

interface ErrorPageProps {
  searchParams: {
    message?: string;
  };
}

function ErrorContent({ searchParams }: ErrorPageProps) {
  const errorMessage = searchParams.message
    ? decodeURIComponent(searchParams.message)
    : "Stripe Connect設定中に予期しないエラーが発生しました";

  return (
    <div className="container mx-auto py-16 px-4">
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-xl">設定エラー</CardTitle>
            <CardDescription>
              Stripe Connectアカウントの設定中にエラーが発生しました
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Button asChild className="w-full">
                <Link href="/dashboard/connect">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  設定を再試行
                </Link>
              </Button>

              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  ダッシュボードに戻る
                </Link>
              </Button>
            </div>

            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>よくある原因：</strong>
              </p>
              <ul className="space-y-1 text-xs">
                <li>• ネットワーク接続の問題</li>
                <li>• ブラウザの設定（Cookie、JavaScript）</li>
                <li>• 一時的なサービス障害</li>
              </ul>
              <p className="text-xs">問題が続く場合は、サポートまでお問い合わせください。</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ConnectErrorPage(props: ErrorPageProps) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ErrorContent {...props} />
    </Suspense>
  );
}
