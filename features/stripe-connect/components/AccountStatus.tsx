/**
 * Stripe 入金設定ステータス表示コンポーネント
 * UI Statusに基づいて適切なビューを表示
 *
 * レイアウト責務:
 * ❶ ステータスヘッダー（各ビューに委譲、バッジ統合）
 * ❷ 入金パネル（一元管理）
 * ❸ Stripeダッシュボード（一元管理）
 * ❹ ヘルプ（Ready以外で表示）
 */

"use client";

import React from "react";

import Link from "next/link";

import { BookOpen, ExternalLink } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Button } from "@/components/ui/button";

import type { PayoutPanelState, RequestPayoutPayload } from "../types/payout-request";
import type { AccountStatusData } from "../types/status-classification";

import { PayoutRequestPanel } from "./PayoutRequestPanel";
import { NoAccountView } from "./status-views/NoAccountView";
import { PendingReviewView } from "./status-views/PendingReviewView";
import { ReadyView } from "./status-views/ReadyView";
import { RequirementsDueView } from "./status-views/RequirementsDueView";
import { RestrictedView } from "./status-views/RestrictedView";
import { UnverifiedView } from "./status-views/UnverifiedView";
import type { StatusConfig } from "./StatusBadge";

interface AccountStatusProps {
  refreshUrl: string;
  status: AccountStatusData;
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  payoutPanel?: PayoutPanelState;
  requestPayoutAction?: () => Promise<ActionResult<RequestPayoutPayload>>;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  no_account: {
    label: "未設定",
    dotClass: "bg-muted-foreground/40",
  },
  unverified: {
    label: "未設定",
    dotClass: "bg-amber-500",
    pulse: true,
  },
  requirements_due: {
    label: "設定中",
    dotClass: "bg-amber-500",
    pulse: true,
  },
  pending_review: {
    label: "審査中",
    dotClass: "bg-primary",
    pulse: true,
  },
  restricted: {
    label: "制限あり",
    dotClass: "bg-destructive",
  },
  ready: {
    label: "設定完了",
    dotClass: "bg-emerald-500",
  },
};

export function AccountStatus({
  refreshUrl,
  status,
  expressDashboardAction,
  payoutPanel,
  requestPayoutAction,
}: AccountStatusProps) {
  const config = STATUS_CONFIG[status.uiStatus] ?? {
    label: "不明",
    dotClass: "bg-muted-foreground/40",
  };

  // Restricted は Express Dashboard をカード内に主アクションとして内包するため除外
  const showExpressDashboard =
    status.expressDashboardAvailable && expressDashboardAction && status.uiStatus !== "restricted";

  const showHelp = status.uiStatus !== "ready";

  const renderStatusView = () => {
    switch (status.uiStatus) {
      case "no_account":
        return <NoAccountView refreshUrl={refreshUrl} />;
      case "unverified":
        return <UnverifiedView refreshUrl={refreshUrl} />;
      case "requirements_due":
        return (
          <RequirementsDueView status={status} refreshUrl={refreshUrl} statusConfig={config} />
        );
      case "pending_review":
        return <PendingReviewView statusConfig={config} />;
      case "restricted":
        return (
          <RestrictedView
            expressDashboardAction={expressDashboardAction}
            expressDashboardAvailable={status.expressDashboardAvailable}
            statusConfig={config}
          />
        );
      case "ready":
        return <ReadyView status={status} statusConfig={config} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* ❶ ステータスヘッダー */}
      {renderStatusView()}

      {/* ❷ 入金パネル */}
      {payoutPanel && requestPayoutAction && (
        <PayoutRequestPanel payoutPanel={payoutPanel} requestPayoutAction={requestPayoutAction} />
      )}

      {/* ❸ Stripeダッシュボード */}
      {showExpressDashboard && (
        <form action={expressDashboardAction}>
          <Button type="submit" variant="outline" className="group h-11 w-full text-sm font-medium">
            Stripeダッシュボード
            <ExternalLink className="ml-2 size-3.5 opacity-60 transition-opacity group-hover:opacity-100" />
          </Button>
        </form>
      )}

      {/* ❹ ヘルプ */}
      {showHelp && (
        <Link
          href="/settings/payments/guide"
          target="_blank"
          rel="noopener noreferrer"
          className="group block rounded-lg border border-border/60 bg-muted/30 p-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/40 bg-background text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary sm:size-9">
              <BookOpen className="size-4" />
            </div>
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 transition-colors group-hover:text-primary">
                設定に迷ったら
                <ExternalLink className="size-3 opacity-40 group-hover:opacity-70" />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground/70">
                どのように入力すべきか迷ったときの参考ガイドです。
              </p>
            </div>
          </div>
        </Link>
      )}
    </div>
  );
}
