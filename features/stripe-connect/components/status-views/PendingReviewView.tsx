/**
 * PendingReviewView - 審査待ち状態のビュー
 * Stripeによる情報確認中の表示
 */

"use client";

import { Clock, ExternalLink } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Button } from "@/components/ui/button";

import type { PayoutPanelState, RequestPayoutPayload } from "../../types/payout-request";
import { PayoutRequestPanel } from "../PayoutRequestPanel";

interface PendingReviewViewProps {
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  expressDashboardAvailable?: boolean;
  payoutPanel?: PayoutPanelState;
  requestPayoutAction?: () => Promise<ActionResult<RequestPayoutPayload>>;
}

export function PendingReviewView({
  expressDashboardAction,
  expressDashboardAvailable,
  payoutPanel,
  requestPayoutAction,
}: PendingReviewViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5 sm:p-4">
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
      </div>

      {expressDashboardAvailable && expressDashboardAction && (
        <form action={expressDashboardAction}>
          <Button
            type="submit"
            variant="outline"
            className="group h-11 w-full text-sm font-semibold"
          >
            Stripeで審査状況を確認
            <ExternalLink className="ml-2 size-3.5 opacity-70 transition-opacity group-hover:opacity-100" />
          </Button>
        </form>
      )}

      {payoutPanel && requestPayoutAction && (
        <PayoutRequestPanel payoutPanel={payoutPanel} requestPayoutAction={requestPayoutAction} />
      )}
    </div>
  );
}
