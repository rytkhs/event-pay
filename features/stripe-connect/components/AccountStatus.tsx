/**
 * Stripe 入金設定ステータス表示コンポーネント
 * UI Statusに基づいて適切なビューを表示
 */

"use client";

import React from "react";

import Link from "next/link";

import { BookOpen, ExternalLink } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { cn } from "@/components/ui/_lib/cn";

import type { PayoutPanelState, RequestPayoutPayload } from "../types/payout-request";
import type { AccountStatusData } from "../types/status-classification";

import { NoAccountView } from "./status-views/NoAccountView";
import { PendingReviewView } from "./status-views/PendingReviewView";
import { ReadyView } from "./status-views/ReadyView";
import { RequirementsDueView } from "./status-views/RequirementsDueView";
import { RestrictedView } from "./status-views/RestrictedView";
import { UnverifiedView } from "./status-views/UnverifiedView";

interface AccountStatusProps {
  refreshUrl: string;
  status: AccountStatusData;
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  payoutPanel?: PayoutPanelState;
  requestPayoutAction?: () => Promise<ActionResult<RequestPayoutPayload>>;
}

type StatusConfig = {
  label: string;
  dotClass: string;
  pulse?: boolean;
};

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

  const renderStatusView = () => {
    switch (status.uiStatus) {
      case "no_account":
        return <NoAccountView refreshUrl={refreshUrl} />;
      case "unverified":
        return <UnverifiedView refreshUrl={refreshUrl} />;
      case "requirements_due":
        return (
          <RequirementsDueView
            status={status}
            refreshUrl={refreshUrl}
            payoutPanel={payoutPanel}
            requestPayoutAction={requestPayoutAction}
          />
        );
      case "pending_review":
        return (
          <PendingReviewView
            expressDashboardAction={expressDashboardAction}
            expressDashboardAvailable={status.expressDashboardAvailable}
            payoutPanel={payoutPanel}
            requestPayoutAction={requestPayoutAction}
          />
        );
      case "restricted":
        return (
          <RestrictedView
            expressDashboardAction={expressDashboardAction}
            expressDashboardAvailable={status.expressDashboardAvailable}
            payoutPanel={payoutPanel}
            requestPayoutAction={requestPayoutAction}
          />
        );
      case "ready":
        return (
          <ReadyView
            status={status}
            expressDashboardAction={expressDashboardAction}
            expressDashboardAvailable={status.expressDashboardAvailable}
            payoutPanel={payoutPanel}
            requestPayoutAction={requestPayoutAction}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/60 bg-background px-3.5 py-3 sm:px-4">
        <span className="relative flex h-2 w-2">
          {config.pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                config.dotClass
              )}
            />
          )}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", config.dotClass)} />
        </span>
        <span className="text-xs font-medium text-foreground">{config.label}</span>
        <span className="text-xs text-muted-foreground/60">現在のStripe連携状況</span>
      </div>

      {renderStatusView()}

      <div className="pt-1 sm:pt-2">
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
      </div>
    </div>
  );
}
