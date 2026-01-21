"use client";

import { memo } from "react";

import Link from "next/link";

import { ja } from "date-fns/locale";
import { format, toZonedTime } from "date-fns-tz";
import { Calendar, ChevronRight, CreditCard, MapPin, Users } from "lucide-react";

import { cn } from "@/components/ui/_lib/cn";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface EventCardProps {
  event: {
    id: string;
    title: string;
    date: string;
    status: string;
    attendances_count?: number;
    capacity?: number | null;
    location?: string | null;
    fee: number;
  };
  mode?: "compact" | "full";
}

// 日本語通貨フォーマット
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

// ステータスごとの設定
const statusConfig = {
  upcoming: {
    label: "予定",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  ongoing: {
    label: "開催中",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
  },
  past: {
    label: "終了",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    dotClass: "bg-slate-400",
  },
  canceled: {
    label: "中止",
    badgeClass: "bg-red-50 text-red-600 border-red-200",
    dotClass: "bg-red-500",
  },
};

// 整理されたステータスバッジ
function getStatusBadge(status: string) {
  const config = statusConfig[status as keyof typeof statusConfig] || {
    label: status,
    badgeClass: "bg-slate-100 text-slate-600 border-slate-200",
    dotClass: "bg-slate-400",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] sm:text-xs px-1.5 sm:px-2 py-0 sm:py-0.5 font-medium border rounded-md flex items-center gap-1",
        config.badgeClass
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dotClass)} />
      {config.label}
    </Badge>
  );
}

export const EventCard = memo(function EventCard({ event, mode = "compact" }: EventCardProps) {
  // 日付フォーマット処理 (例: 12/15(金) 14:00)
  const dateStr = format(toZonedTime(new Date(event.date), "Asia/Tokyo"), "M/d (E)", {
    locale: ja,
  });
  const timeStr = format(toZonedTime(new Date(event.date), "Asia/Tokyo"), "HH:mm", { locale: ja });

  // 参加率計算
  const capacity = event.capacity || 0;
  const attendanceCount = event.attendances_count || 0;
  const occupancy =
    capacity > 0 ? Math.min(Math.round((attendanceCount / capacity) * 100), 100) : 0;

  const isFull = mode === "full";

  return (
    <Link
      href={`/events/${event.id}`}
      className={cn(
        "group relative flex flex-col sm:flex-row sm:items-center",
        "py-4 px-4 sm:px-6",
        "hover:bg-muted/40 active:bg-muted/60",
        "transition-all duration-200",
        "outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
        isFull ? "lg:grid lg:grid-cols-[1fr_120px_160px_140px_auto] lg:gap-6" : ""
      )}
    >
      {/* 1. メイン情報 (Title & Status) */}
      <div className="flex-1 min-w-0 space-y-2 sm:space-y-1">
        <div className="flex items-center gap-2 sm:gap-3 flex-nowrap">
          {getStatusBadge(event.status)}
          <h3 className="font-bold text-sm sm:text-base text-foreground truncate group-hover:text-primary transition-colors flex-1 min-w-0">
            {event.title}
          </h3>
        </div>

        {/* モバイル or コンパクトモード時のサブ情報 */}
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1.5 text-muted-foreground",
            isFull ? "lg:hidden" : ""
          )}
        >
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="tabular-nums font-medium text-xs sm:text-sm">
              {dateStr} <span className="text-muted-foreground/60">{timeStr}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Users className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="text-xs sm:text-sm">
              <span className="font-semibold text-foreground">{attendanceCount}</span>
              {event.capacity && (
                <span className="text-muted-foreground/60">/{event.capacity}</span>
              )}
              <span className="ml-0.5">名</span>
            </span>
          </div>

          {event.location && (
            <div className="flex items-center gap-1.5 min-w-0 max-w-[150px] sm:max-w-[200px]">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground/70 flex-shrink-0" />
              <span className="text-xs sm:text-sm truncate">{event.location}</span>
            </div>
          )}

          {event.fee > 0 ? (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <CreditCard className="h-3.5 w-3.5 text-muted-foreground/70" />
              <span className="tabular-nums text-xs sm:text-sm font-medium">
                {formatCurrency(event.fee)}
              </span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground/60">無料</div>
          )}
        </div>
      </div>

      {/* フルモード時のみ表示される専用列 (デスクトップ) */}
      {isFull && (
        <>
          {/* 2. 日時列 */}
          <div className="hidden lg:flex flex-col justify-center">
            <div className="text-sm font-bold tabular-nums">{dateStr}</div>
            <div className="text-xs text-muted-foreground tabular-nums">{timeStr}</div>
          </div>

          {/* 3. 参加人数列 */}
          <div className="hidden lg:flex flex-col justify-center gap-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>参加状況</span>
              <span>
                <span className="text-foreground">{attendanceCount}</span>
                {event.capacity && (
                  <span className="text-muted-foreground/60">/{event.capacity}</span>
                )}
                <span className="text-muted-foreground/60 ml-0.5">名</span>
              </span>
            </div>
            {event.capacity && <Progress value={occupancy} className="h-1.5 w-full bg-muted" />}
          </div>

          {/* 4. 場所・金額列 */}
          <div className="hidden lg:flex flex-col justify-center gap-1">
            {event.location ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{event.location}</span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground/40 italic">場所未設定</div>
            )}
            {event.fee > 0 ? (
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <CreditCard className="h-3 w-3" />
                <span>{formatCurrency(event.fee)}</span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground/60">無料</div>
            )}
          </div>
        </>
      )}

      {/* 5. アクションインジケーター */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 sm:relative sm:right-0 sm:top-0 sm:translate-y-0 sm:flex sm:items-center text-muted-foreground/30 group-hover:text-primary transition-colors sm:pl-4">
        <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  );
});
