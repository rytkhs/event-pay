"use client";

import { AlertTriangle, Clock, CreditCard, Users, DollarSign } from "lucide-react";

import type { Event } from "@core/types/models";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface AttentionAlertsProps {
  event: Event;
  unpaidCount: number;
  unpaidAmount: number;
  attendingCount: number;
  isFreeEvent: boolean;
}

export function AttentionAlerts({
  event,
  unpaidCount,
  unpaidAmount,
  attendingCount,
  isFreeEvent,
}: AttentionAlertsProps) {
  const currentDate = new Date();
  const alerts = [];

  // 申込締切のチェック
  if (event.registration_deadline) {
    const deadline = new Date(event.registration_deadline);
    const timeDiff = deadline.getTime() - currentDate.getTime();
    const daysLeft = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    if (daysLeft <= 3 && daysLeft > 0) {
      alerts.push({
        type: "warning" as const,
        icon: Clock,
        title: "申込締切が近づいています",
        description: `締切: ${formatUtcToJstByType(event.registration_deadline, "japanese")} (あと${daysLeft}日)`,
        badge: `${daysLeft}日後`,
      });
    } else if (daysLeft <= 0) {
      alerts.push({
        type: "destructive" as const,
        icon: AlertTriangle,
        title: "申込締切を過ぎています",
        description: `締切: ${formatUtcToJstByType(event.registration_deadline, "japanese")}`,
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
        type: "warning" as const,
        icon: CreditCard,
        title: "決済締切が近づいています",
        description: `締切: ${formatUtcToJstByType(event.payment_deadline, "japanese")} (あと${daysLeft}日)`,
        badge: `${daysLeft}日後`,
      });
    } else if (daysLeft <= 0 && unpaidCount > 0) {
      alerts.push({
        type: "destructive" as const,
        icon: AlertTriangle,
        title: "決済締切を過ぎています",
        description: `締切: ${formatUtcToJstByType(event.payment_deadline, "japanese")}`,
        badge: "期限切れ",
      });
    }
  }

  // 未決済の注意（有料イベントのみ）
  if (!isFreeEvent && unpaidCount > 0) {
    const severity = unpaidCount >= attendingCount * 0.3 ? "destructive" : "default";

    alerts.push({
      type: severity,
      icon: DollarSign,
      title: `${unpaidCount}件の未決済があります`,
      description: `未収金額: ¥${unpaidAmount.toLocaleString()} | 参加予定者への連絡をおすすめします`,
      badge: `${unpaidCount}件`,
    });
  }

  // 定員間近の警告
  if (event.capacity && event.capacity > 0) {
    const attendanceRate = (attendingCount / event.capacity) * 100;
    if (attendanceRate >= 90) {
      alerts.push({
        type: "default" as const,
        icon: Users,
        title: "定員間近です",
        description: `現在${attendingCount}/${event.capacity}人 (${Math.round(attendanceRate)}%) | 新規参加の受付を検討してください`,
        badge: `${Math.round(attendanceRate)}%`,
      });
    }
  }

  // アラートがない場合は何も表示しない
  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-5 w-5 text-orange-600" />
        <h3 className="font-bold text-lg">注意事項</h3>
      </div>

      {alerts.map((alert, index) => {
        const Icon = alert.icon;
        return (
          <Alert
            key={index}
            variant={alert.type as "destructive" | "default"}
            className="border-l-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <AlertTitle className="text-sm font-medium mb-1">{alert.title}</AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed">
                    {alert.description}
                  </AlertDescription>
                </div>
              </div>
              <Badge
                variant={alert.type === "destructive" ? "destructive" : "secondary"}
                className="text-xs ml-2 flex-shrink-0"
              >
                {alert.badge}
              </Badge>
            </div>
          </Alert>
        );
      })}
    </div>
  );
}
