/**
 * ReadyView - 設定完了状態のビュー
 * ready状態の表示
 */

"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, Info } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Button } from "@/components/ui/button";

import type { PayoutPanelState, RequestPayoutPayload } from "../../types/payout-request";
import type { AccountStatusData } from "../../types/status-classification";
import { PayoutRequestPanel } from "../PayoutRequestPanel";

interface ReadyViewProps {
  status: AccountStatusData;
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  expressDashboardAvailable?: boolean;
  payoutPanel?: PayoutPanelState;
  requestPayoutAction?: () => Promise<ActionResult<RequestPayoutPayload>>;
}

export function ReadyView({
  status,
  expressDashboardAction,
  expressDashboardAvailable,
  payoutPanel,
  requestPayoutAction,
}: ReadyViewProps) {
  const hasPayoutWarning = status.collectionReady && !status.payoutsEnabled;
  const eventuallyDueCount = status.requirements?.eventually_due?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 text-emerald-600">
            <CheckCircle2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">オンライン集金を利用できます</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              参加者からのオンライン決済を受け付けられます。
            </p>
          </div>
        </div>
      </div>

      {hasPayoutWarning && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3.5 sm:p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-amber-500/20 text-amber-600">
              <AlertTriangle className="size-4" />
            </span>
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
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5 sm:p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground">
              <Info className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">今後必要になる情報があります</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                案内に沿って必要な情報を更新してください。
              </p>
            </div>
          </div>
        </div>
      )}

      {payoutPanel && requestPayoutAction && (
        <PayoutRequestPanel payoutPanel={payoutPanel} requestPayoutAction={requestPayoutAction} />
      )}

      {expressDashboardAvailable && expressDashboardAction && (
        <form action={expressDashboardAction}>
          <Button
            type="submit"
            variant="outline"
            className="group h-11 w-full text-sm font-semibold"
          >
            Stripeで売上・入金を確認
            <ExternalLink className="ml-2 size-3.5 opacity-70 transition-opacity group-hover:opacity-100" />
          </Button>
        </form>
      )}
    </div>
  );
}
