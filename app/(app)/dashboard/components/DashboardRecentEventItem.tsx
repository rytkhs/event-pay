import Link from "next/link";

import { ja } from "date-fns/locale";
import { Calendar, ChevronRight, CreditCard, MapPin, Users } from "lucide-react";

import type { RecentEvent } from "@features/events/server";

import { cn } from "@/components/ui/_lib/cn";
import { Badge } from "@/components/ui/badge";
import { formatUtcToJst } from "@/core/utils/timezone";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

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
} as const;

function getStatusBadge(status: RecentEvent["status"]) {
  const config = statusConfig[status];

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

export function DashboardRecentEventItem({ event }: { event: RecentEvent }) {
  const dateStr = formatUtcToJst(event.date, "M/d (E)", { locale: ja });
  const timeStr = formatUtcToJst(event.date, "HH:mm", { locale: ja });

  return (
    <Link
      prefetch={false}
      href={`/events/${event.id}`}
      className={cn(
        "group relative flex flex-col sm:flex-row sm:items-center",
        "py-4 px-4 sm:px-6",
        "hover:bg-muted/40 active:bg-muted/60",
        "transition-all duration-200",
        "outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      )}
    >
      <div className="flex-1 min-w-0 space-y-2 sm:space-y-1">
        <div className="flex items-center gap-2 sm:gap-3 flex-nowrap">
          {getStatusBadge(event.status)}
          <h3 className="font-bold text-sm sm:text-base text-foreground truncate group-hover:text-primary transition-colors flex-1 min-w-0">
            {event.title}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-muted-foreground">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="tabular-nums font-medium text-xs sm:text-sm">
              {dateStr} <span className="text-muted-foreground/60">{timeStr}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Users className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="text-xs sm:text-sm">
              <span className="font-semibold text-foreground">{event.attendances_count}</span>
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

      <div className="absolute right-4 top-1/2 -translate-y-1/2 sm:relative sm:right-0 sm:top-0 sm:translate-y-0 sm:flex sm:items-center text-muted-foreground/30 group-hover:text-primary transition-colors sm:pl-4">
        <ChevronRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  );
}
