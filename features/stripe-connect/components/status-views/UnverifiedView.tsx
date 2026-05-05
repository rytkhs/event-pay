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

      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-amber-500/20 text-amber-600">
            <CircleAlert className="size-4" />
          </span>
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
        className="mt-5 h-11 w-full text-sm font-semibold sm:mt-6 sm:h-12 sm:text-base"
        size="lg"
      >
        <Link href={refreshUrl} prefetch={false}>
          設定を再開する
          <ArrowRight className="ml-2 size-4 sm:size-5" />
        </Link>
      </Button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="size-3" />
        Stripeの安全な画面で設定します・約3分で完了
      </p>
    </div>
  );
}
