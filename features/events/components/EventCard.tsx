"use client";

import { memo } from "react";

import Link from "next/link";

import { ja } from "date-fns/locale";
import { ChevronRight } from "lucide-react";

import { cn } from "@/components/ui/_lib/cn";
import { Badge } from "@/components/ui/badge";
import { formatUtcToJst } from "@/core/utils/timezone";

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
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

const statusConfig = {
  upcoming: {
    label: "予定",
    badgeClass: "text-primary border-primary/20 bg-primary/5",
  },
  ongoing: {
    label: "開催中",
    badgeClass: "text-blue-600 border-blue-500/30 bg-blue-500/5",
  },
  past: {
    label: "終了",
    badgeClass: "text-muted-foreground border-border/60 bg-muted/30",
  },
  canceled: {
    label: "中止",
    badgeClass: "text-red-500 border-red-500/30 bg-red-500/5",
  },
};

function getStatusBadge(status: string) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.past;
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-1.5 py-0 font-bold tracking-[0.1em] text-[9px] leading-[1.3rem] rounded-[6px] shadow-none",
        config.badgeClass
      )}
    >
      {config.label}
    </Badge>
  );
}

export const EventCard = memo(function EventCard({ event }: EventCardProps) {
  const monthStr = formatUtcToJst(event.date, "M月", { locale: ja });
  const dayStr = formatUtcToJst(event.date, "d", { locale: ja });
  const dayOfWeekStr = formatUtcToJst(event.date, "E", { locale: ja });
  const timeStr = formatUtcToJst(event.date, "HH:mm", { locale: ja });

  const capacity = event.capacity || 0;
  const attendanceCount = event.attendances_count || 0;

  const statusGradient = (() => {
    switch (event.status) {
      case "upcoming":
        return "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_8px_16px_-6px_hsl(var(--primary)/0.4)] ring-1 ring-inset ring-white/20";
      case "ongoing":
        return "bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-[0_4px_10px_-4px_rgba(59,130,246,0.6)] ring-1 ring-inset ring-white/20";
      case "past":
        return "bg-transparent text-muted-foreground/70 ring-1 ring-inset ring-border/80";
      case "canceled":
        return "bg-muted/50 text-muted-foreground/50 mix-blend-luminosity outline outline-1 outline-border";
      default:
        return "bg-muted text-muted-foreground";
    }
  })();

  return (
    <Link
      href={`/events/${event.id}`}
      prefetch={false}
      className={cn(
        "group flex items-center justify-between",
        "py-3.5 px-4 sm:py-4 sm:px-5",
        "transition-colors duration-200",
        "hover:bg-sidebar-accent/50",
        "outline-none focus-visible:bg-sidebar-accent/50"
      )}
    >
      <div className="flex items-center gap-3.5 sm:gap-5 min-w-0 flex-1">
        {/* Date Anchor */}
        <div
          className={cn(
            "flex-shrink-0 flex flex-col items-center justify-center rounded-[10px] w-12 h-12 sm:w-[52px] sm:h-[52px]",
            statusGradient
          )}
        >
          <span className="text-[10px] sm:text-[11px] font-bold tracking-widest leading-none opacity-90">
            {monthStr}
          </span>
          <span className="text-[18px] sm:text-[20px] font-black leading-none mt-[2px]">
            {dayStr}
          </span>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[14px] sm:text-[15px] leading-snug text-foreground truncate group-hover:text-primary transition-colors">
              {event.title}
            </h3>
            {getStatusBadge(event.status)}
          </div>

          <div className="flex flex-wrap items-center gap-y-1 text-muted-foreground/80">
            <span className="text-[12px] font-semibold tracking-wide tabular-nums">{timeStr}</span>
            <span className="text-muted-foreground/40 text-[10px] mx-1.5">•</span>
            <span className="text-[12px] font-semibold">{dayOfWeekStr}曜日</span>

            {event.location && (
              <>
                <span className="text-muted-foreground/40 text-[10px] mx-1.5">•</span>
                <span className="text-[12px] font-medium truncate max-w-[120px] sm:max-w-[200px]">
                  {event.location}
                </span>
              </>
            )}

            {/* Mobile metrics */}
            <div className="flex sm:hidden items-center overflow-hidden w-full mt-1.5 gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                  参加
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-foreground/80">
                  {attendanceCount}
                  {capacity > 0 && (
                    <span className="text-muted-foreground/50 font-medium">/{capacity}</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                  参加費
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-foreground/80">
                  {event.fee > 0 ? formatCurrency(event.fee) : "無料"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Metrics */}
      <div className="hidden sm:flex items-center gap-6 ml-4 lg:gap-10 lg:ml-8">
        <div className="flex flex-col items-end justify-center w-[70px]">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-[3px]">
            参加者
          </span>
          <span className="text-[14px] font-bold tabular-nums leading-none">
            <span className="text-foreground/80">{attendanceCount}</span>
            {capacity > 0 && (
              <span className="text-muted-foreground/50 font-semibold text-[11px] ml-[1px]">
                /{capacity}
              </span>
            )}
          </span>
        </div>

        <div className="flex flex-col items-end justify-center w-[80px]">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-[3px]">
            参加費
          </span>
          <span className="text-[13px] font-bold text-foreground/80 tabular-nums leading-none">
            {event.fee > 0 ? formatCurrency(event.fee) : "無料"}
          </span>
        </div>

        <div className="flex items-center justify-center text-muted-foreground/30 group-hover:text-primary transition-colors pl-2">
          <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>

      {/* Mobile Chevron */}
      <div className="flex sm:hidden items-center justify-center text-muted-foreground/30 group-hover:text-primary transition-colors pl-3 border-l border-transparent ml-auto h-full">
        <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Link>
  );
});
