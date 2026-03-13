import Link from "next/link";

import { ArrowLeft, Calendar, MapPin, Pencil } from "lucide-react";

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
    label: "開催予定",
    barColor: "bg-primary",
    textColor: "text-primary",
    dotColor: "bg-primary",
  },
  ongoing: {
    label: "開催中",
    barColor: "bg-success",
    textColor: "text-success",
    dotColor: "bg-success",
  },
  past: {
    label: "終了",
    barColor: "bg-secondary",
    textColor: "text-secondary",
    dotColor: "bg-secondary",
  },
  canceled: {
    label: "キャンセル",
    barColor: "bg-destructive",
    textColor: "text-destructive",
    dotColor: "bg-destructive",
  },
} as const;

export function EventDetailHeader({ eventDetail }: EventDetailHeaderProps) {
  const canEdit = eventDetail.status !== "past" && eventDetail.status !== "canceled";

  const statusKey = eventDetail.status as keyof typeof STATUS_CONFIG;
  const statusCfg = STATUS_CONFIG[statusKey] ?? {
    label: EVENT_STATUS_LABELS[statusKey] ?? eventDetail.status,
    barColor: "bg-muted-foreground/30",
    textColor: "text-muted-foreground",
    dotColor: "bg-muted-foreground/30",
  };

  return (
    <div className="py-2 sm:py-4">
      {/* 戻るボタン（設定画面のようなスタイル） */}
      <div className="mb-2 sm:mb-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 h-auto py-1 text-muted-foreground hover:text-foreground"
        >
          <Link href="/events" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="font-medium">イベント一覧に戻る</span>
          </Link>
        </Button>
      </div>

      <div className="flex items-start gap-3 sm:gap-4">
        {/* ステータスバー + コンテンツ */}
        <div className="flex min-w-0 flex-1 items-stretch gap-3">
          {/* 左縦ライン（ステータスカラー） */}
          <div
            className={`w-0.5 shrink-0 self-stretch rounded-full ${statusCfg.barColor}`}
            aria-hidden="true"
          />

          {/* メインコンテンツ */}
          <div className="min-w-0 flex-1">
            {/* ステータス表示 */}
            <div className={`mb-1 flex items-center gap-1.5 ${statusCfg.textColor}`}>
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${statusCfg.dotColor}`}
                aria-hidden="true"
              />
              <span className="text-[10px] font-bold tracking-wider">{statusCfg.label}</span>
            </div>

            {/* タイトル */}
            <h1 className="truncate text-base font-bold leading-snug text-foreground sm:text-lg">
              {sanitizeForEventPay(eventDetail.title)}
            </h1>

            {/* メタ情報 */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 shrink-0" />
                {formatUtcToJstByType(eventDetail.date, "standard")}
              </span>
              {eventDetail.location && (
                <span className="flex min-w-0 items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{sanitizeForEventPay(eventDetail.location)}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 編集ボタン */}
        <div className="shrink-0 self-center">
          {canEdit ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              aria-label="イベント設定を編集"
              className="h-8 w-8 rounded-full p-0 transition-all duration-200 border-orange-200 bg-orange-50/60 text-orange-700 hover:bg-orange-100 hover:border-orange-300 hover:text-orange-800"
            >
              <Link href={`/events/${eventDetail.id}/edit`}>
                <Pencil className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled
              aria-label="イベント設定は編集できません"
              className="h-8 w-8 cursor-not-allowed rounded-full p-0 opacity-35"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
