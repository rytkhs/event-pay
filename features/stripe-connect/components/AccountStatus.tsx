/**
 * Stripe 入金設定ステータス表示コンポーネント
 * UI Statusに基づいて適切なビューを表示
 */

"use client";

import React from "react";

import Link from "next/link";

import { BookOpen, ExternalLink } from "lucide-react";

import { cn } from "@/components/ui/_lib/cn";

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

export function AccountStatus({ refreshUrl, status, expressDashboardAction }: AccountStatusProps) {
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
        return <RequirementsDueView status={status} refreshUrl={refreshUrl} />;
      case "pending_review":
        return (
          <PendingReviewView
            expressDashboardAction={expressDashboardAction}
            expressDashboardAvailable={status.expressDashboardAvailable}
          />
        );
      case "restricted":
        return (
          <RestrictedView
            expressDashboardAction={expressDashboardAction}
            expressDashboardAvailable={status.expressDashboardAvailable}
          />
        );
      case "ready":
        return (
          <ReadyView
            status={status}
            expressDashboardAction={expressDashboardAction}
            expressDashboardAvailable={status.expressDashboardAvailable}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      {/* ステータスインジケーター */}
      <div className="flex items-center gap-2">
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
        <span className="text-xs font-medium text-foreground/70">{config.label}</span>
        <span className="text-xs text-muted-foreground/60">— 現在のStripe連携状況</span>
      </div>

      {/* UI Status別のビューを表示 */}
      {renderStatusView()}

      {/* ガイドリンク */}
      <div className="border-t border-border/40 pt-3">
        <Link
          href="/settings/payments/guide"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <BookOpen className="h-3.5 w-3.5" />
          設定回答の参考ページを見る
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
