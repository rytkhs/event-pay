/**
 * UnverifiedView - 未認証状態のビュー
 * unverified状態の表示
 */

"use client";

import Link from "next/link";

import { ArrowRight, CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

interface UnverifiedViewProps {
  refreshUrl: string;
}

export function UnverifiedView({ refreshUrl }: UnverifiedViewProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div className="flex gap-3 items-start">
          <div className="shrink-0 rounded-lg bg-amber-500/15 p-2 flex items-center justify-center">
            <CircleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">設定を開始してください</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              オンライン集金設定が完了していません。
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
