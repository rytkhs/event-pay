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
              className={
                hasPastDue
                  ? "h-4 w-4 text-destructive"
                  : "h-4 w-4 text-amber-600 dark:text-amber-400"
              }
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">アカウント情報の更新が必要です</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              案内に従って、不足情報を入力してください。
            </p>
          </div>
        </div>
      </div>

      <Button asChild className="w-full">
        <Link href={refreshUrl} prefetch={false}>
          Stripeで設定を続行
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
