/**
 * Stripe Connect オンボーディングリフレッシュページ
 */

export const dynamic = "force-dynamic";

import { Suspense } from "react";

import { Loader2 } from "lucide-react";
import type { Metadata } from "next";

import { handleOnboardingRefreshAction } from "@features/stripe-connect/server";

export const metadata: Metadata = {
  title: "設定を再開",
  description: "Stripeアカウント設定を再開しています",
};

async function RefreshContent({ intent }: { intent?: string }) {
  // オンボーディングリフレッシュ処理を実行（リダイレクトが発生）
  await handleOnboardingRefreshAction(intent);

  // この部分は通常実行されない（リダイレクトが発生するため）
  return null;
}

function LoadingContent() {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-6 sm:p-8">
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="size-8 animate-spin text-primary motion-reduce:animate-none" />
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">設定を再開しています</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Stripeアカウントの設定画面に戻ります。
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

export default async function PaymentSettingsRefreshPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const intent = typeof searchParams.intent === "string" ? searchParams.intent : undefined;

  return (
    <Suspense fallback={<LoadingContent />}>
      <RefreshContent intent={intent} />
    </Suspense>
  );
}
