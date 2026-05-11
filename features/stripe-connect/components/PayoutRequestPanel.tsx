"use client";

import { useTransition } from "react";

import { useRouter } from "next/navigation";

import { Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import { formatCurrency } from "@core/utils/fee-calculator";

import { Button } from "@/components/ui/button";

import type {
  PayoutPanelState,
  PayoutRequestStatus,
  RequestPayoutPayload,
} from "../types/payout-request";

type PayoutRequestPanelProps = {
  payoutPanel: PayoutPanelState;
  requestPayoutAction: () => Promise<ActionResult<RequestPayoutPayload>>;
};

const STATUS_LABELS: Record<PayoutRequestStatus, string> = {
  requesting: "作成中",
  created: "処理中",
  paid: "入金完了",
  failed: "失敗",
  canceled: "キャンセル",
  creation_unknown: "確認中",
};

const DISABLED_LABELS: Record<NonNullable<PayoutPanelState["disabledReason"]>, string> = {
  no_account: "入金先が未設定です",
  payouts_disabled: "入金設定を確認してください",
  no_available_balance: "入金可能残高がありません",
  request_in_progress: "処理中の入金があります",
};

export function PayoutRequestPanel({ payoutPanel, requestPayoutAction }: PayoutRequestPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const latestRequest = payoutPanel.latestRequest;
  const buttonDisabled = !payoutPanel.canRequestPayout || isPending;

  const handleRequestPayout = () => {
    startTransition(async () => {
      try {
        const result = await requestPayoutAction();
        if (!result.success) {
          toast.error("入金リクエストに失敗しました", {
            description: result.error.userMessage,
          });
          router.refresh();
          return;
        }

        toast.success("入金リクエストを作成しました", {
          description: `${formatCurrency(result.data.amount)}円の入金処理を開始しました。`,
        });
        router.refresh();
      } catch {
        toast.error("通信に失敗しました");
      }
    });
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background p-3.5 sm:p-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground">
            <Landmark className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-semibold">登録口座への入金</p>
              {latestRequest && (
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  {STATUS_LABELS[latestRequest.status]}
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">入金可能</p>
                <p className="mt-1 font-semibold">
                  {formatCurrency(payoutPanel.availableAmount)}円
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">反映待ち</p>
                <p className="mt-1 font-semibold">{formatCurrency(payoutPanel.pendingAmount)}円</p>
              </div>
            </div>
            {latestRequest && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                前回: {formatCurrency(latestRequest.amount)}円 /{" "}
                {new Date(latestRequest.requestedAt).toLocaleDateString("ja-JP")}
                {latestRequest.failureMessage ? ` / ${latestRequest.failureMessage}` : ""}
              </p>
            )}
          </div>
        </div>

        <Button
          type="button"
          className="h-11 w-full text-sm font-semibold"
          disabled={buttonDisabled}
          onClick={handleRequestPayout}
        >
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {payoutPanel.canRequestPayout
            ? `${formatCurrency(payoutPanel.availableAmount)}円を入金`
            : payoutPanel.disabledReason
              ? DISABLED_LABELS[payoutPanel.disabledReason]
              : "入金できません"}
        </Button>
      </div>
    </div>
  );
}
