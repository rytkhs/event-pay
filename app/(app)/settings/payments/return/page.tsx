/**
 * Stripe Connect オンボーディング完了後のリダイレクトページ
 */

export const dynamic = "force-dynamic";

import { Suspense } from "react";

import { redirect } from "next/navigation";

import { Loader2 } from "lucide-react";
import type { Metadata } from "next";

import { handleOnboardingReturnAction } from "@features/stripe-connect/server";

export const metadata: Metadata = {
  title: "設定完了処理中",
  description: "Stripeアカウント設定の完了処理を行っています",
};

async function ReturnContent({ intent }: { intent?: string }) {
  // オンボーディング完了処理を実行
  const result = await handleOnboardingReturnAction(intent);

  if (result.success && result.data?.redirectUrl) {
    redirect(result.data.redirectUrl);
  } else if (!result.success) {
    // エラー時は指定されたURLへリダイレクト、なければデフォルトのエラーページへ
    const errorRedirectUrl = result.redirectUrl || "/settings/payments/error";
    redirect(errorRedirectUrl);
  } else {
    // 成功だがURLがない場合（フォールバック）
    redirect("/settings/payments");
  }

  return null;
}

function LoadingContent() {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-6 sm:p-8">
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="size-8 animate-spin text-primary motion-reduce:animate-none" />
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">設定を完了しています</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Stripeアカウントの設定完了処理を行っています。
            <br />
            しばらくお待ちください...
          </p>
        </div>
      </div>
    </div>
  );
}

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PaymentSettingsReturnPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const intent = typeof searchParams.intent === "string" ? searchParams.intent : undefined;

  return (
    <Suspense fallback={<LoadingContent />}>
      <ReturnContent intent={intent} />
    </Suspense>
  );
}
