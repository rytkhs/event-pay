/**
 * RequirementsDueView - 情報更新が必要な状態のビュー
 * requirements_due状態の表示
 */

"use client";

import Link from "next/link";

import { ArrowRight, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { AccountStatusData } from "../../types/status-classification";

interface RequirementsDueViewProps {
  status: AccountStatusData;
  refreshUrl: string;
}

export function RequirementsDueView({ status, refreshUrl }: RequirementsDueViewProps) {
  const requirements = status.requirements ?? {
    currently_due: [],
    eventually_due: [],
    past_due: [],
    pending_verification: [],
  };

  const hasPastDue = (requirements.past_due?.length ?? 0) > 0;
  const hasCurrentDue = (requirements.currently_due?.length ?? 0) > 0;
  const title = hasPastDue
    ? "至急、追加情報が必要です"
    : hasCurrentDue
      ? "追加情報が必要です"
      : "Stripeの案内を確認してください";
  const description = hasPastDue
    ? "期限を過ぎた確認事項があります。Stripeで状況を確認し、必要な情報を更新してください。"
    : hasCurrentDue
      ? "オンライン集金を利用するために、Stripeで不足情報を入力してください。"
      : "Stripeで対応が必要な確認事項があります。案内に従って状況を確認してください。";

  return (
    <div className="space-y-4">
      <div
        className={
          hasPastDue
            ? "rounded-xl border border-destructive/25 bg-destructive/5 p-4"
            : "rounded-xl border border-amber-500/25 bg-amber-500/5 p-4"
        }
      >
        <div className="flex gap-3 items-start">
          <div
            className={
              hasPastDue
                ? "shrink-0 rounded-lg bg-destructive/15 p-2 flex items-center justify-center"
                : "shrink-0 rounded-lg bg-amber-500/15 p-2 flex items-center justify-center"
            }
          >
            <TriangleAlert
              className={hasPastDue ? "h-4 w-4 text-destructive" : "h-4 w-4 text-amber-600"}
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>

      <Button
        asChild
        className={
          hasPastDue
            ? "group relative h-11 w-full rounded-xl border border-destructive/25 bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent text-sm font-semibold text-red-700 dark:text-red-400 transition-all duration-300 hover:border-destructive/40 hover:from-destructive/20 hover:via-destructive/10 hover:to-destructive/5 hover:text-red-800 dark:hover:text-red-300 shadow-[inset_0_1px_0_hsl(var(--destructive-foreground)/0.4),0_8px_16px_-12px_hsl(var(--destructive)/0.4)] hover:shadow-[inset_0_1px_0_hsl(var(--destructive-foreground)/0.5),0_12px_24px_-12px_hsl(var(--destructive)/0.6)]"
            : "group relative h-11 w-full rounded-xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent text-sm font-semibold text-amber-800 dark:text-amber-400 transition-all duration-300 hover:border-amber-500/40 hover:from-amber-500/20 hover:via-amber-500/10 hover:to-amber-500/5 hover:text-amber-900 dark:hover:text-amber-300 shadow-[inset_0_1px_0_hsl(var(--background)/0.4),0_8px_16px_-12px_rgba(245,158,11,0.2)] hover:shadow-[inset_0_1px_0_hsl(var(--background)/0.5),0_12px_24px_-12px_rgba(245,158,11,0.4)]"
        }
        variant="outline"
      >
        <Link href={refreshUrl} prefetch={false}>
          Stripeで設定を続行
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </Button>
    </div>
  );
}
