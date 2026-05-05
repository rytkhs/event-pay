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
    <div className="flex flex-col gap-4">
      <div
        className={
          hasPastDue
            ? "rounded-lg border border-destructive/25 bg-destructive/5 p-3.5 sm:p-4"
            : "rounded-lg border border-amber-500/25 bg-amber-500/5 p-3.5 sm:p-4"
        }
      >
        <div className="flex items-start gap-3">
          <span
            className={
              hasPastDue
                ? "flex size-8 shrink-0 items-center justify-center rounded-md border border-destructive/20 text-destructive"
                : "flex size-8 shrink-0 items-center justify-center rounded-md border border-amber-500/20 text-amber-600"
            }
          >
            <TriangleAlert className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>

      <Button
        asChild
        className="group h-11 w-full text-sm font-semibold"
        variant={hasPastDue ? "destructive" : "outline"}
      >
        <Link href={refreshUrl} prefetch={false}>
          Stripeで設定を続行
          <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      </Button>
    </div>
  );
}
