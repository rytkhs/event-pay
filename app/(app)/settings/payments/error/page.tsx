/**
 * Stripe Connect エラーページ
 */

export const dynamic = "force-dynamic";

import Link from "next/link";

import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import type { Metadata } from "next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "設定エラー",
  description: "Stripeアカウント設定中にエラーが発生しました",
};

interface ErrorPageProps {
  searchParams: Promise<ErrorSearchParams>;
}

interface ErrorContentProps {
  searchParams: ErrorSearchParams;
}

interface ErrorSearchParams {
  message?: string;
}

function ErrorContent({ searchParams }: ErrorContentProps) {
  const errorMessage = searchParams.message
    ? decodeURIComponent(searchParams.message)
    : "Stripeアカウント設定中に予期しないエラーが発生しました";

  return (
    <div className="rounded-lg border border-border/60 bg-background p-4 sm:p-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-destructive/25 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">設定エラー</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Stripeアカウントの設定中にエラーが発生しました。
            </p>
          </div>
        </div>

        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="sm:w-auto">
            <Link href="/settings/payments">
              <RefreshCw className="mr-2 size-4" />
              設定を再試行
            </Link>
          </Button>

          <Button asChild variant="outline" className="sm:w-auto">
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 size-4" />
              ホームに戻る
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 pt-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">よくある原因</p>
          <ul className="flex flex-col gap-1 text-xs">
            <li>ネットワーク接続の問題</li>
            <li>ブラウザの設定（Cookie、JavaScript）</li>
            <li>一時的なサービス障害</li>
          </ul>
          <p className="text-xs">問題が続く場合は、サポートまでお問い合わせください。</p>
        </div>
      </div>
    </div>
  );
}

export default async function PaymentSettingsErrorPage(props: ErrorPageProps) {
  const searchParams = await props.searchParams;

  return <ErrorContent searchParams={searchParams} />;
}
