/**
 * Stripe Connect オンボーディングリフレッシュページ
 */

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { Metadata } from "next";
import { handleOnboardingRefreshAction } from "@/app/(dashboard)/actions/stripe-connect";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export const metadata: Metadata = {
  title: "設定を再開 | EventPay",
  description: "Stripe Connect設定を再開しています",
};

async function RefreshContent() {
  // オンボーディングリフレッシュ処理を実行（リダイレクトが発生）
  await handleOnboardingRefreshAction();

  // この部分は通常実行されない（リダイレクトが発生するため）
  return null;
}

function LoadingContent() {
  return (
    <div className="container mx-auto py-16 px-4">
      <div className="max-w-md mx-auto">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold">設定を再開しています</h2>
              <p className="text-sm text-muted-foreground">
                Stripe Connectアカウントの設定画面に戻ります。
                <br />
                しばらくお待ちください...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ConnectRefreshPage() {
  return (
    <Suspense fallback={<LoadingContent />}>
      <RefreshContent />
    </Suspense>
  );
}
