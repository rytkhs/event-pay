/**
 * Stripe Connect オンボーディング完了後のリダイレクトページ
 */

export const dynamic = "force-dynamic";

import { Suspense } from "react";

import { redirect } from "next/navigation";

import { Loader2 } from "lucide-react";
import type { Metadata } from "next";

import { handleOnboardingReturnAction } from "@features/stripe-connect/server";

import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "設定完了処理中",
  description: "Stripeアカウント設定の完了処理を行っています",
};

async function ReturnContent() {
  // オンボーディング完了処理を実行
  const result = await handleOnboardingReturnAction();

  if (result.success && result.data?.redirectUrl) {
    redirect(result.data.redirectUrl);
  } else if (!result.success) {
    // エラー時は指定されたURLへリダイレクト、なければデフォルトのエラーページへ
    const errorRedirectUrl = (result.error as any).redirectUrl || "/dashboard/connect/error";
    redirect(errorRedirectUrl);
  } else {
    // 成功だがURLがない場合（フォールバック）
    redirect("/dashboard");
  }

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
              <h2 className="text-lg font-semibold">設定を完了しています</h2>
              <p className="text-sm text-muted-foreground">
                Stripeアカウントの設定完了処理を行っています。
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

export default function ConnectReturnPage() {
  return (
    <Suspense fallback={<LoadingContent />}>
      <ReturnContent />
    </Suspense>
  );
}
