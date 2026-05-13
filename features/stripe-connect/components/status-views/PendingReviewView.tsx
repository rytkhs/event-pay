/**
 * PendingReviewView - 審査待ち状態のビュー
 * ステータス通知カード1つに集約。
 */

"use client";

import { Clock } from "lucide-react";

import type { StatusConfig } from "../StatusBadge";
import { StatusBadge } from "../StatusBadge";

interface PendingReviewViewProps {
  statusConfig: StatusConfig;
}

export function PendingReviewView({ statusConfig }: PendingReviewViewProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 text-primary">
            <Clock className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Stripeが確認中です</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              提出された情報をStripeが確認しています。通常1〜2営業日で完了します。
            </p>
          </div>
        </div>
        <StatusBadge config={statusConfig} />
      </div>
    </div>
  );
}
