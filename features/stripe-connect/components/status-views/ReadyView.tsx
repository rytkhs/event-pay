/**
 * ReadyView - 設定完了状態のビュー
 * ステータス通知カード1つに集約。警告はカード内サブテキストとして表示。
 */

"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import type { AccountStatusData } from "../../types/status-classification";
import type { StatusConfig } from "../StatusBadge";
import { StatusBadge } from "../StatusBadge";

interface ReadyViewProps {
  status: AccountStatusData;
  statusConfig: StatusConfig;
}

export function ReadyView({ status, statusConfig }: ReadyViewProps) {
  const hasPayoutWarning = status.collectionReady && !status.payoutsEnabled;
  const eventuallyDueCount = status.requirements?.eventually_due?.length ?? 0;
  const hasSubNotes = hasPayoutWarning || eventuallyDueCount > 0;

  return (
    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 text-emerald-600">
            <CheckCircle2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">オンライン集金を利用できます</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              参加者からのオンライン決済を受け付けられます。
            </p>
          </div>
        </div>
        <StatusBadge config={statusConfig} />
      </div>

      {hasSubNotes && (
        <div className="mt-3 flex flex-col gap-2 border-t border-emerald-500/10 pt-3">
          {hasPayoutWarning && (
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>出金設定の確認が必要です</span>
            </div>
          )}
          {eventuallyDueCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0" />
              <span>今後必要になる情報があります</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
