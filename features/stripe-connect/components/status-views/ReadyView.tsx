/**
 * ReadyView - 設定完了状態のビュー
 * ready状態の表示
 */

"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, Info } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { AccountStatusData } from "../../types/status-classification";

interface ReadyViewProps {
  status: AccountStatusData;
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  expressDashboardAvailable?: boolean;
}

export function ReadyView({
  status,
  expressDashboardAction,
  expressDashboardAvailable,
}: ReadyViewProps) {
  const hasPayoutWarning = status.collectionReady && !status.payoutsEnabled;
  const eventuallyDueCount = status.requirements?.eventually_due?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
        <div className="flex gap-3 items-start">
          <div className="shrink-0 rounded-lg bg-emerald-500/15 p-2 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">オンライン集金を利用できます</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              参加者からのオンライン決済を受け付けられます。
            </p>
          </div>
        </div>
      </div>

      {hasPayoutWarning && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <div className="flex gap-3 items-start">
            <div className="shrink-0 rounded-lg bg-amber-500/15 p-2 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">出金設定を確認してください</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                出金に追加確認が必要な場合があります。
              </p>
            </div>
          </div>
        </div>
      )}

      {eventuallyDueCount > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <div className="flex gap-3 items-start">
            <div className="shrink-0 rounded-lg bg-background p-2 flex items-center justify-center">
              <Info className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">今後必要になる情報があります</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                案内に沿って必要な情報を更新してください。
              </p>
            </div>
          </div>
        </div>
      )}

      {expressDashboardAvailable && expressDashboardAction && (
        <form action={expressDashboardAction}>
          <Button
            type="submit"
            variant="outline"
            className="group relative h-11 w-full rounded-xl border border-primary/10 bg-card text-sm font-semibold text-foreground/80 transition-all duration-300 hover:border-primary/20 hover:bg-muted/50 hover:text-foreground shadow-sm hover:shadow-[0_4px_12px_-8px_hsl(var(--primary)/0.4)]"
          >
            Stripeで売上・入金を確認
            <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70 transition-opacity group-hover:opacity-100" />
          </Button>
        </form>
      )}
    </div>
  );
}
