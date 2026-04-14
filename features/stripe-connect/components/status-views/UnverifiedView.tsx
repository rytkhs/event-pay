/**
 * UnverifiedView - 未認証状態のビュー
 * unverified状態の表示
 */

"use client";

import Link from "next/link";

import { ArrowRight, CircleAlert, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";

import { OnboardingIntro } from "../OnboardingIntro";

interface UnverifiedViewProps {
  refreshUrl: string;
}

export function UnverifiedView({ refreshUrl }: UnverifiedViewProps) {
  return (
    <div>
      <OnboardingIntro hasExistingAccount />

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div className="flex gap-3 items-start">
          <div className="shrink-0 rounded-lg bg-amber-500/15 p-2 flex items-center justify-center">
            <CircleAlert className="h-4 w-4 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">設定を再開しましょう</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              オンライン集金設定が完了していません。
            </p>
          </div>
        </div>
      </div>

      <Button
        asChild
        className="w-full mt-6 h-12 text-base font-semibold shadow-md hover:shadow-lg transition-shadow"
        size="lg"
      >
        <Link href={refreshUrl} prefetch={false}>
          設定を再開する
          <ArrowRight className="ml-2 h-5 w-5" />
        </Link>
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-3">
        <Lock className="h-3 w-3" />
        Stripeの安全な画面で設定します・約3分で完了
      </p>
    </div>
  );
}
