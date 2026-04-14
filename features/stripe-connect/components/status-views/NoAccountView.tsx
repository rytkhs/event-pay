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

      <Button asChild className="w-full">
        <Link href={refreshUrl} prefetch={false}>
          Stripeで設定を始める
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
