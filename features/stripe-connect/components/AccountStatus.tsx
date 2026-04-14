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
      <div className="pt-2">
        <Link
          href="/settings/payments/guide"
          target="_blank"
          rel="noopener noreferrer"
          className="group block rounded-xl border border-border/60 bg-muted/30 p-4 transition-all hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background border border-border/40 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
              <BookOpen className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 group-hover:text-primary transition-colors">
                設定に迷ったら
                <ExternalLink className="h-3 w-3 opacity-40 group-hover:opacity-70" />
              </div>
              <p className="text-xs text-muted-foreground/70 leading-relaxed">
                どのように入力すべきか迷ったときの参考ガイドです。
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
