"use client";

import { ArrowDownToLine, ExternalLink, Landmark, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { AccountStatusData } from "../types/status-classification";

interface PayoutPreviewPanelProps {
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  expressDashboardAvailable?: boolean;
  status: AccountStatusData;
}

export function PayoutPreviewPanel({
  expressDashboardAction,
  expressDashboardAvailable,
  status,
}: PayoutPreviewPanelProps) {
  const canRequestPayout = status.uiStatus === "ready" && status.payoutsEnabled;
  const statusLabel = canRequestPayout ? "入金可能" : "確認が必要";
  const statusClass = canRequestPayout
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
    : "border-amber-500/20 bg-amber-500/10 text-amber-700";

  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-background shadow-sm">
      <div className="border-b border-border/60 bg-muted/30 px-3.5 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground">
              <WalletCards className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold leading-none">売上・入金</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                オンライン集金の売上と登録口座への入金を扱います。
              </p>
            </div>
          </div>
          <Badge className={statusClass} variant="outline">
            {statusLabel}
          </Badge>
        </div>
      </div>

      <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid grid-cols-2 divide-x divide-border/60 border-b border-border/60 sm:border-b-0 sm:border-r">
          <div className="px-3.5 py-4 sm:px-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Landmark className="size-3.5" />
              Stripe残高
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">-</div>
            <p className="mt-1 text-xs text-muted-foreground">取得処理は未接続</p>
          </div>
          <div className="px-3.5 py-4 sm:px-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ArrowDownToLine className="size-3.5" />
              入金可能額
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">-</div>
            <p className="mt-1 text-xs text-muted-foreground">実装時に算出</p>
          </div>
        </div>

        <div className="flex min-w-56 flex-col justify-center gap-2 px-3.5 py-4 sm:px-4">
          <Button
            type="button"
            aria-disabled="true"
            className="h-11 w-full justify-center text-sm font-semibold"
          >
            <ArrowDownToLine className="size-4" />
            登録口座へ入金
          </Button>

          {expressDashboardAvailable && expressDashboardAction && (
            <form action={expressDashboardAction}>
              <Button
                type="submit"
                variant="outline"
                className="group h-10 w-full text-sm font-semibold"
              >
                Stripeで詳細を確認
                <ExternalLink className="size-3.5 opacity-70 transition-opacity group-hover:opacity-100" />
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
