import { memo, useMemo } from "react";

import Link from "next/link";

import { EVENT_STATUS_LABELS } from "@core/types/enums";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Event } from "../types";

interface EventCardProps {
  event: Event;
}

// ステータスマッピングを外部で定義してメモ化
const STATUS_CONFIG = {
  upcoming: { text: EVENT_STATUS_LABELS.upcoming, styles: "bg-green-100 text-green-800" },
  ongoing: { text: EVENT_STATUS_LABELS.ongoing, styles: "bg-blue-100 text-blue-800" },
  past: { text: EVENT_STATUS_LABELS.past, styles: "bg-gray-100 text-gray-800" },
  canceled: { text: EVENT_STATUS_LABELS.canceled, styles: "bg-red-100 text-red-800" },
} as const;

export const EventCard = memo(function EventCard({ event }: EventCardProps) {
  // 日付フォーマットをメモ化（date-fns-tz統一）
  const formattedDate = useMemo(() => {
    return formatUtcToJstByType(event.date, "japanese");
  }, [event.date]);

  // ステータス情報をメモ化（型安全にキーを解決）
  const statusInfo = useMemo(() => {
    const key = event.status as keyof typeof STATUS_CONFIG;
    return STATUS_CONFIG[key] ?? { text: event.status, styles: "bg-gray-100 text-gray-800" };
  }, [event.status]);

  // 料金表示をメモ化
  const formattedFee = useMemo(() => {
    return event.fee === 0 ? "無料" : `${event.fee.toLocaleString()}円`;
  }, [event.fee]);

  // 参加者数表示をメモ化
  const attendanceText = useMemo(() => {
    return `${event.attendances_count || 0}/${event.capacity}名`;
  }, [event.attendances_count, event.capacity]);

  // XSS対策: タイトルと場所をサニタイズ
  const sanitizedTitle = useMemo(() => {
    return sanitizeForEventPay(event.title);
  }, [event.title]);

  const sanitizedLocation = useMemo(() => {
    return sanitizeForEventPay(event.location || "");
  }, [event.location]);

  return (
    <Link href={`/events/${event.id}`} className="block">
      <Card
        data-testid="event-card"
        className="border border-border/50 hover:border-border hover:shadow-sm transition-all duration-200 h-full"
      >
        <CardHeader className="pb-3">
          <CardTitle
            className="text-lg font-semibold leading-tight line-clamp-2"
            data-testid="event-title"
          >
            {sanitizedTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* 日時・場所 */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground flex items-center">📅 {formattedDate}</p>
            {sanitizedLocation && (
              <p className="text-sm text-muted-foreground flex items-center line-clamp-1">
                📍 {sanitizedLocation}
              </p>
            )}
          </div>

          {/* 料金・参加者数 */}
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">料金</span>
              <span className="text-base font-semibold">{formattedFee}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-muted-foreground">参加者</span>
              <span className="text-sm">{attendanceText}</span>
            </div>
          </div>

          {/* ステータス */}
          <div className="pt-1">
            <span
              className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${statusInfo.styles}`}
            >
              {statusInfo.text}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});
