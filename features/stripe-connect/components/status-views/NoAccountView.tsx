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
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
        <div className="flex gap-3 items-start">
          <div className="shrink-0 rounded-lg bg-primary/10 p-2 flex items-center justify-center">
            <CreditCard className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Stripeで設定を始めましょう</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              オンライン決済を有効化するために、Stripeアカウントの設定が必要です。設定は約3〜5分で完了します。
            </p>
          </div>
        </div>
      </div>

      <Button
        asChild
        className="group relative h-11 w-full rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent text-sm font-semibold text-teal-800 transition-all duration-300 hover:border-primary/40 hover:from-primary/20 hover:via-primary/10 hover:to-primary/5 hover:text-teal-900 shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.4),0_8px_16px_-12px_hsl(var(--primary)/0.6)] hover:shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.5),0_12px_24px_-12px_hsl(var(--primary)/0.8)]"
        variant="outline"
      >
        <Link href={refreshUrl} prefetch={false}>
          Stripeで設定を始める
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </Button>
    </div>
  );
}
