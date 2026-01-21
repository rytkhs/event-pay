"use client";

import { AlertTriangle, Clock, CreditCard, Users, DollarSign, ChevronRight } from "lucide-react";

import type { Event } from "@core/types/models";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface AttentionAlertsCompactProps {
  event: Event;
  unpaidCount: number;
  unpaidAmount: number;
  attendingCount: number;
  isFreeEvent: boolean;
}

type AlertType = {
  type: "destructive" | "warning" | "default";
  icon: typeof Clock;
  title: string;
  description: string;
  badge: string;
};

export function AttentionAlertsCompact({
  event,
  unpaidCount,
  unpaidAmount,
  attendingCount,
  isFreeEvent,
}: AttentionAlertsCompactProps) {
  const currentDate = new Date();
  const alerts: AlertType[] = [];

  // 申込締切のチェック
  if (event.registration_deadline) {
    const deadline = new Date(event.registration_deadline);
    const timeDiff = deadline.getTime() - currentDate.getTime();
    const daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    if (daysLeft <= 3 && daysLeft > 0) {
      alerts.push({
        type: "warning",
        icon: Clock,
        title: "申込締切が近づいています",
        description: formatUtcToJstByType(event.registration_deadline, "japanese"),
        badge: `${daysLeft}日後`,
      });
    } else if (daysLeft <= 0) {
      alerts.push({
        type: "destructive",
        icon: AlertTriangle,
        title: "申込締切を過ぎています",
        description: formatUtcToJstByType(event.registration_deadline, "japanese"),
        badge: "期限切れ",
      });
    }
  }

  // オンライン決済締切のチェック（有料イベントのみ）
  if (!isFreeEvent && event.payment_deadline) {
    const deadline = new Date(event.payment_deadline);
    const timeDiff = deadline.getTime() - currentDate.getTime();
    const daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    if (daysLeft <= 3 && daysLeft > 0 && unpaidCount > 0) {
      alerts.push({
        type: "warning",
        icon: CreditCard,
        title: "決済締切が近づいています",
        description: formatUtcToJstByType(event.payment_deadline, "japanese"),
        badge: `${daysLeft}日後`,
      });
    } else if (daysLeft <= 0 && unpaidCount > 0) {
      alerts.push({
        type: "destructive",
        icon: AlertTriangle,
        title: "決済締切を過ぎています",
        description: formatUtcToJstByType(event.payment_deadline, "japanese"),
        badge: "期限切れ",
      });
    }
  }

  // 未決済の注意（有料イベントのみ）- KPIカードで表示するため、ここでは警告レベルが高い場合のみ
  if (!isFreeEvent && unpaidCount > 0 && unpaidCount >= attendingCount * 0.3) {
    alerts.push({
      type: "destructive",
      icon: DollarSign,
      title: `${unpaidCount}件の未決済（30%以上）`,
      description: `未収金額: ¥${unpaidAmount.toLocaleString()}`,
      badge: `${unpaidCount}件`,
    });
  }

  // 定員間近の警告（定員が設定されている場合のみ）
  if (event.capacity !== null && event.capacity > 0) {
    const attendanceRate = (attendingCount / event.capacity) * 100;
    if (attendanceRate >= 95) {
      alerts.push({
        type: "warning",
        icon: Users,
        title: "定員到達間近",
        description: `${attendingCount}/${event.capacity}人`,
        badge: `${Math.round(attendanceRate)}%`,
      });
    }
  }

  // アラートがない場合は何も表示しない
  if (alerts.length === 0) {
    return null;
  }

  // 重要度でソート（destructive > warning > default）
  const sortedAlerts = alerts.sort((a, b) => {
    const priority = { destructive: 0, warning: 1, default: 2 };
    return priority[a.type] - priority[b.type];
  });

  const getAlertStyles = (type: AlertType["type"]) => {
    switch (type) {
      case "destructive":
        return {
          bg: "bg-red-50",
          border: "border-red-200",
          iconBg: "bg-red-100",
          iconColor: "text-red-600",
          textColor: "text-red-800",
          badgeVariant: "destructive" as const,
        };
      case "warning":
        return {
          bg: "bg-orange-50",
          border: "border-orange-200",
          iconBg: "bg-orange-100",
          iconColor: "text-orange-600",
          textColor: "text-orange-800",
          badgeVariant: "secondary" as const,
        };
      default:
        return {
          bg: "bg-gray-50",
          border: "border-gray-200",
          iconBg: "bg-gray-100",
          iconColor: "text-gray-600",
          textColor: "text-gray-800",
          badgeVariant: "outline" as const,
        };
    }
  };

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-50 to-red-50 border-b border-orange-100">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <span className="text-sm font-bold text-orange-800">要注意</span>
          <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
            {alerts.length}件
          </Badge>
        </div>

        <div className="divide-y divide-gray-100">
          {sortedAlerts.map((alert, index) => {
            const styles = getAlertStyles(alert.type);
            const Icon = alert.icon;

            return (
              <div
                key={index}
                className={`flex items-center gap-3 px-4 py-3 ${styles.bg} hover:brightness-95 transition-all cursor-default`}
              >
                <div className={`p-1.5 rounded-lg ${styles.iconBg}`}>
                  <Icon className={`h-4 w-4 ${styles.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${styles.textColor}`}>{alert.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{alert.description}</div>
                </div>
                <Badge variant={styles.badgeVariant} className="text-xs flex-shrink-0">
                  {alert.badge}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
