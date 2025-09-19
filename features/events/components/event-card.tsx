import { memo, useMemo } from "react";

import Link from "next/link";

import { CalendarIcon, MapPinIcon, UsersIcon } from "lucide-react";

import { EVENT_STATUS_LABELS } from "@core/types/enums";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Event } from "../types";

interface EventCardProps {
  event: Event;
}

// ステータスマッピングを外部で定義してメモ化
const STATUS_CONFIG = {
  upcoming: { text: EVENT_STATUS_LABELS.upcoming, variant: "default" as const },
  ongoing: { text: EVENT_STATUS_LABELS.ongoing, variant: "default" as const },
  past: { text: EVENT_STATUS_LABELS.past, variant: "secondary" as const },
  canceled: { text: EVENT_STATUS_LABELS.canceled, variant: "destructive" as const },
} as const;

export const EventCard = memo(function EventCard({ event }: EventCardProps) {
  // 日付フォーマットをメモ化（date-fns-tz統一）
  const formattedDate = useMemo(() => {
    return formatUtcToJstByType(event.date, "japanese");
  }, [event.date]);

  // ステータス情報をメモ化（型安全にキーを解決）
  const statusInfo = useMemo(() => {
    const key = event.status as keyof typeof STATUS_CONFIG;
    return STATUS_CONFIG[key] ?? { text: event.status, variant: "secondary" as const };
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
        className="border border-border/50 hover:border-border hover:shadow-md transition-all duration-200 h-full overflow-hidden"
      >
        <CardHeader className="pb-4">
          {/* ステータスバッジ - 上部に移動 */}
          <div className="flex items-center justify-between mb-2">
            <Badge variant={statusInfo.variant} className="text-xs">
              {statusInfo.text}
            </Badge>
            <span className="text-xs text-muted-foreground font-medium">{formattedFee}</span>
          </div>

          {/* タイトル */}
          <CardTitle
            className="text-lg font-semibold leading-tight line-clamp-2 mb-0"
            data-testid="event-title"
          >
            {sanitizedTitle}
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-0 space-y-4">
          {/* 日時・場所（アイコン統一） */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{formattedDate}</span>
            </div>
            {sanitizedLocation && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPinIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{sanitizedLocation}</span>
              </div>
            )}
          </div>

          {/* 参加者数 */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-2 text-sm">
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">参加者</span>
            </div>
            <span className="text-sm font-medium">{attendanceText}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});
