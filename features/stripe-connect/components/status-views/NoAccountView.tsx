/**
 * NoAccountView - アカウント未作成時のビュー
 * no_account状態の表示
 */

"use client";

import Link from "next/link";

import { ArrowRight, CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";

interface NoAccountViewProps {
  refreshUrl: string;
}

export function NoAccountView({ refreshUrl }: NoAccountViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 text-primary">
            <CreditCard className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Stripeで設定を始めましょう</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              オンライン決済を有効化するために、Stripeアカウントの設定が必要です。設定は約3〜5分で完了します。
            </p>
          </div>
        </div>
      </div>

      <Button asChild className="group h-11 w-full text-sm font-semibold">
        <Link href={refreshUrl} prefetch={false}>
          Stripeで設定を始める
          <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      </Button>
    </div>
  );
}
