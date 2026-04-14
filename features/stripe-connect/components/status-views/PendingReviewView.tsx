/**
 * PendingReviewView - 審査待ち状態のビュー
 * Stripeによる情報確認中の表示
 */

"use client";

import { Clock, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PendingReviewViewProps {
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  expressDashboardAvailable?: boolean;
}

export function PendingReviewView({
  expressDashboardAction,
  expressDashboardAvailable,
}: PendingReviewViewProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
        <div className="flex gap-3 items-start">
          <div className="shrink-0 rounded-lg bg-primary/10 p-2 flex items-center justify-center">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Stripeが審査中です</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              提出いただいた情報をStripeが確認しています。通常1〜2営業日で完了します。
            </p>
          </div>
        </div>
      </div>

      {expressDashboardAvailable && expressDashboardAction && (
        <form action={expressDashboardAction}>
          <Button type="submit" variant="outline" className="w-full">
            Stripeで審査状況を確認
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Button>
        </form>
      )}
    </div>
  );
}
