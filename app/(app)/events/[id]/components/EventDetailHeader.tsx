import Link from "next/link";

import { Calendar, MapPin, Pencil } from "lucide-react";

import { EVENT_STATUS_LABELS } from "@core/constants/status-labels";
import type { Event } from "@core/types/event";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Button } from "@/components/ui/button";

interface EventDetailHeaderProps {
  eventDetail: Event;
}

const STATUS_CONFIG = {
  upcoming: {
    label: EVENT_STATUS_LABELS.upcoming,
    variant: "bg-primary/10 text-primary border-primary/20",
    dotColor: "bg-primary",
  },
  ongoing: {
    label: EVENT_STATUS_LABELS.ongoing,
    variant: "bg-green-500/10 text-green-700 border-green-500/20",
    dotColor: "bg-green-500",
  },
  past: {
    label: EVENT_STATUS_LABELS.past,
    variant: "bg-slate-500/10 text-slate-600 border-slate-500/20",
    dotColor: "bg-slate-500",
  },
  canceled: {
    label: EVENT_STATUS_LABELS.canceled,
    variant: "bg-destructive/10 text-destructive border-destructive/20",
    dotColor: "bg-destructive",
  },
} as const;

export function EventDetailHeader({ eventDetail }: EventDetailHeaderProps) {
  const canEdit = eventDetail.status !== "past" && eventDetail.status !== "canceled";

  const statusKey = eventDetail.status as keyof typeof STATUS_CONFIG;
  const statusCfg = STATUS_CONFIG[statusKey] ?? {
    label: EVENT_STATUS_LABELS[statusKey] ?? eventDetail.status,
    variant: "bg-muted text-muted-foreground border-border",
    dotColor: "bg-muted-foreground/30",
  };

  return (
    <div className="pt-2 pb-2 sm:py-2">
      {/* モバイルではより縦方向にコンパクトに、デスクトップではゆったりと */}
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        {/* 左側メインエリア */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-2">
          {/* ステータスバッジ: モバイルでの視認性を考慮 */}
          <div className="flex items-center">
            <div
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider shadow-sm transition-all duration-300 sm:px-2.5 sm:text-[10px] ${statusCfg.variant}`}
            >
              <span
                className={`h-1 w-1 rounded-full sm:h-1.5 sm:w-1.5 ${statusCfg.dotColor} shadow-[0_0_8px_rgba(0,0,0,0.1)]`}
                aria-hidden="true"
              />
              {statusCfg.label}
            </div>
          </div>

          {/* タイトルと編集ボタンのコンボ (モバイル用) */}
          <div className="flex items-start justify-between gap-4 sm:block">
            <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-2xl">
              {sanitizeForEventPay(eventDetail.title)}
            </h1>

            {/* モバイル用編集ボタン (デスクトップでは非表示) */}
            <div className="sm:hidden">
              {canEdit ? (
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-xl border-primary/20 bg-primary/5 text-primary shadow-sm"
                >
                  <Link href={`/events/${eventDetail.id}/edit`}>
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  disabled
                  size="icon"
                  className="h-9 w-9 rounded-xl opacity-30"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* メタ情報: アイコンとテキストのバランスをモバイル最適化 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] font-medium text-muted-foreground/80 sm:gap-x-5 sm:text-[13px]">
            <div className="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground/45 sm:h-4 sm:w-4" />
              <span>{formatUtcToJstByType(eventDetail.date, "standard")}</span>
            </div>
            {eventDetail.location && (
              <div className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/45 sm:h-4 sm:w-4" />
                <span className="truncate">{sanitizeForEventPay(eventDetail.location)}</span>
              </div>
            )}
          </div>
        </div>

        {/* 右側: デスクトップ用アクションボタン (モバイルでは非表示) */}
        <div className="hidden items-center gap-3 sm:flex">
          {canEdit ? (
            <Button
              asChild
              variant="outline"
              aria-label="イベントを編集"
              className="h-10 gap-2 rounded-xl border-primary/20 bg-primary/[0.06] px-5 text-[13px] font-semibold text-primary shadow-sm transition-all duration-200 hover:border-primary/30 hover:bg-primary/[0.09]"
            >
              <Link href={`/events/${eventDetail.id}/edit`}>
                <Pencil className="h-4 w-4" />
                <span>編集</span>
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              disabled
              className="h-10 cursor-not-allowed rounded-xl px-5 text-[13px] font-semibold opacity-40 shadow-none"
            >
              <Pencil className="mr-2 h-4 w-4" />
              <span>編集不可</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
