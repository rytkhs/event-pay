import Link from "next/link";
import { Event } from "@/types/event";
import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUtcToJstByType } from "@/lib/utils/timezone";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
import { EVENT_STATUS_LABELS } from "@/types/enums";

interface EventCardProps {
  event: Event;
}

// ステータスマッピングを外部で定義してメモ化
const STATUS_CONFIG = {
  upcoming: { text: EVENT_STATUS_LABELS.upcoming, styles: "bg-green-100 text-green-800" },
  ongoing: { text: EVENT_STATUS_LABELS.ongoing, styles: "bg-blue-100 text-blue-800" },
  past: { text: EVENT_STATUS_LABELS.past, styles: "bg-gray-100 text-gray-800" },
  cancelled: { text: EVENT_STATUS_LABELS.cancelled, styles: "bg-red-100 text-red-800" },
} as const;

export const EventCard = memo(function EventCard({ event }: EventCardProps) {
  // 日付フォーマットをメモ化（date-fns-tz統一）
  const formattedDate = useMemo(() => {
    return formatUtcToJstByType(event.date, "japanese");
  }, [event.date]);

  // ステータス情報をメモ化
  const statusInfo = useMemo(() => {
    return (
      STATUS_CONFIG[event.status] || { text: event.status, styles: "bg-gray-100 text-gray-800" }
    );
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
    <Card data-testid="event-card" className="hover:shadow-lg transition-shadow">
      <Link href={`/events/${event.id}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-xl" data-testid="event-title">
            {sanitizedTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground">{formattedDate}</p>
          <p className="text-muted-foreground">{sanitizedLocation}</p>
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold">{formattedFee}</span>
            <span className="text-sm text-muted-foreground">{attendanceText}</span>
          </div>
          <div className="flex justify-between items-center pt-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.styles}`}>
              {statusInfo.text}
            </span>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
});
