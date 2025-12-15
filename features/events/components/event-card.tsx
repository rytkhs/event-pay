"use client";

import { memo, useMemo } from "react";

import Link from "next/link";

import { MapPinIcon, UsersIcon, ArrowRight } from "lucide-react";

import { EVENT_STATUS_LABELS } from "@core/types/enums";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJst } from "@core/utils/timezone";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { Event } from "../types";

interface EventCardProps {
  event: Event;
}

// ステータス設定：色とラベル
const STATUS_CONFIG = {
  upcoming: {
    text: EVENT_STATUS_LABELS.upcoming,
    variant: "default" as const,
    activeColor: "bg-primary",
    borderColor: "border-primary",
  },
  ongoing: {
    text: EVENT_STATUS_LABELS.ongoing,
    variant: "default" as const,
    activeColor: "bg-green-600",
    borderColor: "border-green-600",
  },
  past: {
    text: EVENT_STATUS_LABELS.past,
    variant: "secondary" as const,
    activeColor: "bg-muted",
    borderColor: "border-muted",
  },
  canceled: {
    text: EVENT_STATUS_LABELS.canceled,
    variant: "destructive" as const,
    activeColor: "bg-destructive",
    borderColor: "border-destructive",
  },
} as const;

export const EventCard = memo(function EventCard({ event }: EventCardProps) {
  // 日付情報の抽出（JST考慮）
  const dateInfo = useMemo(() => {
    try {
      return {
        month: formatUtcToJst(event.date, "MMM"), // "Oct", "Jan" etc.
        day: formatUtcToJst(event.date, "d"), // "24", "1" etc.
        full: formatUtcToJst(event.date, "yyyy/MM/dd"),
      };
    } catch (e) {
      return { month: "--", day: "--", full: "----/--/--" };
    }
  }, [event.date]);

  // ステータス情報の解決
  const statusInfo = useMemo(() => {
    const key = event.status as keyof typeof STATUS_CONFIG;
    return (
      STATUS_CONFIG[key] ?? {
        text: event.status,
        variant: "secondary" as const,
        activeColor: "bg-gray-500",
        borderColor: "border-gray-500",
      }
    );
  }, [event.status]);

  const formattedFee = useMemo(() => {
    return event.fee === 0 ? "無料" : `¥${event.fee.toLocaleString()}`;
  }, [event.fee]);

  const attendanceText = useMemo(() => {
    const count = event.attendances_count || 0;
    return event.capacity === null ? `${count}名` : `${count}/${event.capacity}`;
  }, [event.attendances_count, event.capacity]);

  const sanitizedTitle = useMemo(() => {
    return sanitizeForEventPay(event.title);
  }, [event.title]);

  const sanitizedLocation = useMemo(() => {
    return sanitizeForEventPay(event.location || "");
  }, [event.location]);

  return (
    <Link href={`/events/${event.id}`} className="block group h-full">
      <Card
        data-testid="event-card"
        className={`
          flex flex-row h-full overflow-hidden border-l-4 transition-all duration-300
          hover:-translate-y-1 hover:shadow-lg
          ${statusInfo.borderColor}
        `}
      >
        {/* Date Block (Ticket Stub Style) */}
        <div className="flex w-20 flex-col items-center justify-center bg-muted/30 p-2 text-center border-r border-dashed border-border/60">
          <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
            {dateInfo.month}
          </span>
          <span className="text-2xl font-black tracking-tighter text-foreground">
            {dateInfo.day}
          </span>
        </div>

        {/* Main Content */}
        <CardContent className="flex-1 p-4 flex flex-col justify-between gap-3">
          <div className="space-y-2">
            {/* Header: Status Badge & Fee */}
            <div className="flex items-center justify-between">
              <Badge variant={statusInfo.variant} className="text-[10px] px-1.5 h-5">
                {statusInfo.text}
              </Badge>
              <span className="text-xs font-bold text-primary/80">{formattedFee}</span>
            </div>

            {/* Title */}
            <h3
              className="text-lg font-bold leading-snug line-clamp-2 group-hover:text-primary transition-colors"
              data-testid="event-title"
              title={sanitizedTitle}
            >
              {sanitizedTitle}
            </h3>
          </div>

          {/* Footer Info */}
          <div className="space-y-2 pt-2">
            {/* Location */}
            {sanitizedLocation && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[180px]">{sanitizedLocation}</span>
              </div>
            )}

            {/* Attendees & Arrow */}
            <div className="flex items-center justify-between border-t border-border/40 pt-2 mt-auto">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UsersIcon className="h-3.5 w-3.5" />
                <span>{attendanceText}</span>
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground/50 opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});
