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
  requesting: "申請中",
  pending: "準備中",
  in_transit: "処理中",
  paid: "完了",
  failed: "失敗",
  canceled: "キャンセル",
  creation_unknown: "確認中",
};

const DISABLED_LABELS: Record<NonNullable<PayoutPanelState["disabledReason"]>, string> = {
  no_account: "振込先が未設定です",
  payouts_disabled: "振込設定を確認してください",
  external_account_missing: "振込先口座を確認してください",
  external_account_unavailable: "振込先口座を確認してください",
  no_available_balance: "振込可能残高がありません",
  request_in_progress: "処理中の振込があります",
};

const ACCOUNT_FAILURE_CODES = new Set([
  "account_closed",
  "account_frozen",
  "bank_account_restricted",
  "bank_account_unusable",
  "bank_ownership_changed",
  "debit_not_authorized",
  "incorrect_account_holder_address",
  "incorrect_account_holder_name",
  "incorrect_account_holder_tax_id",
  "incorrect_account_type",
  "invalid_account_number",
  "invalid_account_number_length",
  "invalid_currency",
  "no_account",
  "unsupported_card",
]);

function getPayoutFailureLabel(failureCode: string | null): string {
  if (failureCode === "insufficient_funds") {
    return "振込可能額が不足しています。";
  }
  if (failureCode === "declined" || failureCode === "could_not_process") {
    return "振込処理が銀行側で完了できませんでした。";
  }
  if (failureCode !== null && ACCOUNT_FAILURE_CODES.has(failureCode)) {
    return "振込先口座を確認してください。";
  }
  return "振込処理に失敗しました。";
}

export function PayoutRequestPanel({ payoutPanel, requestPayoutAction }: PayoutRequestPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const latestRequest = payoutPanel.latestRequest;
  const latestFailureLabel =
    latestRequest?.status === "failed" ? getPayoutFailureLabel(latestRequest.failureCode) : null;
  const latestRequestDetails = latestRequest
    ? [
        `${formatCurrency(latestRequest.amount)}円`,
        new Date(latestRequest.requestedAt).toLocaleDateString("ja-JP"),
        latestRequest.arrivalDate
          ? `予定: ${new Date(latestRequest.arrivalDate).toLocaleDateString("ja-JP")}`
          : null,
        latestFailureLabel,
      ].filter((detail): detail is string => detail !== null)
    : [];
  const canRecoverCreationUnknown =
    latestRequest?.status === "creation_unknown" &&
    payoutPanel.disabledReason === "request_in_progress";
  const buttonDisabled = (!payoutPanel.canRequestPayout && !canRecoverCreationUnknown) || isPending;
  const buttonLabel = canRecoverCreationUnknown
    ? "再試行"
    : payoutPanel.canRequestPayout
      ? `${formatCurrency(payoutPanel.availableAmount)}円を振込`
      : payoutPanel.disabledReason
        ? DISABLED_LABELS[payoutPanel.disabledReason]
        : "振込できません";

  const handleRequestPayout = () => {
    startTransition(async () => {
      try {
        const result = await requestPayoutAction();
        if (!result.success) {
          toast.error(
            canRecoverCreationUnknown
              ? "振込状況を確認できませんでした"
              : "振込リクエストに失敗しました",
            {
              description: result.error.userMessage,
            }
          );
          router.refresh();
          return;
        }

        toast.success(
          canRecoverCreationUnknown ? "振込状況を確認しました" : "振込リクエストを作成しました",
          {
            description: `${formatCurrency(result.data.amount)}円の振込処理を開始しました。`,
          }
        );
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
              <p className="text-sm font-semibold">登録口座への振込</p>
              {latestRequest && (
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  {STATUS_LABELS[latestRequest.status]}
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">振込可能</p>
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
                前回: {latestRequestDetails.join(" / ")}
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
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}
