"use client";

import React, { useMemo } from "react";

import { addDays, differenceInDays, differenceInHours } from "date-fns";
import { ja } from "date-fns/locale";
import { format } from "date-fns-tz";
import {
  Calendar,
  CreditCard,
  PartyPopper,
  Clock,
  AlertCircle,
  LucideIcon,
  AlertTriangle,
} from "lucide-react";

import { cn } from "@core/utils";

import { Card } from "@/components/ui/card";

// ============================================================================
// 型定義
// ============================================================================

interface EventFormTimelineProps {
  registrationDeadline?: string; // datetime-local形式
  paymentDeadline?: string; // datetime-local形式
  eventDate?: string; // datetime-local形式
  gracePeriodDays?: string; // 決済猶予期間（日数）
  className?: string;
}

type TimelineItemType = "registration" | "payment" | "event" | "grace";

interface ValidationError {
  type: "order" | "logic" | "range" | "warning";
  message: string;
  severity: "error" | "warning";
}

interface TimelineItem {
  id: string;
  type: TimelineItemType;
  date: Date;
  label: string;
  icon: LucideIcon;
  color: {
    bg: string;
    border: string;
    text: string;
    shadow: string;
  };
  errors: ValidationError[];
  metadata?: {
    isGracePeriod?: boolean;
    graceDays?: number;
  };
}

// ============================================================================
// ヘルパー関数
// ============================================================================

const formatDate = (date: Date) => {
  return format(date, "M月d日(E) HH:mm", { timeZone: "Asia/Tokyo", locale: ja });
};

const calculateTimeGap = (startDate: Date, endDate: Date): string => {
  const days = Math.abs(differenceInDays(endDate, startDate));
  const hours = Math.abs(differenceInHours(endDate, startDate)) % 24;

  if (days > 0) {
    return hours > 0 ? `${days}日${hours}時間` : `${days}日`;
  }
  if (hours > 0) {
    return `${hours}時間`;
  }
  return "0時間";
};

const formatRelativeTime = (targetDate: Date, eventDate: Date): string => {
  const diffMs = targetDate.getTime() - eventDate.getTime();
  if (Math.abs(diffMs) < 1000 * 60) {
    return "開催同時刻";
  }

  const gapStr = calculateTimeGap(targetDate, eventDate);
  if (targetDate < eventDate) {
    return `開催の${gapStr}前`;
  } else {
    return `開催${gapStr}後`;
  }
};

const getDiffText = (current: Date, next: Date): string => {
  const gapStr = calculateTimeGap(current, next);
  if (gapStr === "0時間") return "すぐ";
  return `${gapStr}後`;
};

// ============================================================================
// コンポーネント
// ============================================================================

export function EventFormTimeline({
  registrationDeadline,
  paymentDeadline,
  eventDate,
  gracePeriodDays,
  className,
}: EventFormTimelineProps) {
  // 1. 日付のパース
  const regDeadlineDate = useMemo(
    () => (registrationDeadline ? new Date(registrationDeadline) : undefined),
    [registrationDeadline]
  );
  const payDeadlineDate = useMemo(
    () => (paymentDeadline ? new Date(paymentDeadline) : undefined),
    [paymentDeadline]
  );
  const eventDateObj = useMemo(() => (eventDate ? new Date(eventDate) : undefined), [eventDate]);

  const gracePeriod = useMemo(
    () => (gracePeriodDays ? parseInt(gracePeriodDays, 10) : 0),
    [gracePeriodDays]
  );

  const finalPaymentDate = useMemo(
    () => (payDeadlineDate && gracePeriod > 0 ? addDays(payDeadlineDate, gracePeriod) : undefined),
    [payDeadlineDate, gracePeriod]
  );

  // 2. タイムラインアイテムの生成とソート
  const items = useMemo(() => {
    const list: TimelineItem[] = [];
    const now = new Date();

    // イベント開催日
    if (eventDateObj) {
      const errors: ValidationError[] = [];
      if (eventDateObj < now) {
        errors.push({
          type: "warning",
          message: "過去の日付が設定されています",
          severity: "warning",
        });
      }

      list.push({
        id: "event",
        type: "event",
        date: eventDateObj,
        label: "イベント開催",
        icon: PartyPopper,
        color: {
          bg: "bg-green-500",
          border: "border-green-500",
          text: "text-white",
          shadow: "shadow-green-200",
        },
        errors,
      });
    }

    // 申込締切
    if (regDeadlineDate) {
      const errors: ValidationError[] = [];

      if (eventDateObj && regDeadlineDate > eventDateObj) {
        errors.push({
          type: "order",
          message: "イベント開催日より後の日付です",
          severity: "error",
        });
      }
      if (payDeadlineDate && regDeadlineDate > payDeadlineDate) {
        errors.push({
          type: "order",
          message: "決済締切より後になっています",
          severity: "error",
        });
      }
      if (regDeadlineDate < now) {
        errors.push({
          type: "warning",
          message: "過去の日付が設定されています",
          severity: "warning",
        });
      }

      list.push({
        id: "registration",
        type: "registration",
        date: regDeadlineDate,
        label: "申込締切",
        icon: Calendar,
        color: {
          bg: "bg-blue-500",
          border: "border-blue-500",
          text: "text-white",
          shadow: "shadow-blue-200",
        },
        errors,
      });
    }

    // 決済締切
    if (payDeadlineDate) {
      const errors: ValidationError[] = [];

      if (eventDateObj && payDeadlineDate > addDays(eventDateObj, 30)) {
        errors.push({
          type: "range",
          message: "開催日から30日を超えています",
          severity: "error",
        });
      }
      if (regDeadlineDate && payDeadlineDate < regDeadlineDate) {
        errors.push({
          type: "order",
          message: "申込締切より前になっています",
          severity: "error",
        });
      }

      // 決済締切がイベント開催に非常に近い場合の警告 (例: 24時間以内)
      if (eventDateObj) {
        const hoursDiff = differenceInHours(eventDateObj, payDeadlineDate);
        if (hoursDiff > 0 && hoursDiff < 24) {
          errors.push({
            type: "warning",
            message: "開催直前の設定です（推奨: 24時間以上前)",
            severity: "warning",
          });
        }
      }

      list.push({
        id: "payment",
        type: "payment",
        date: payDeadlineDate,
        label: "オンライン決済締切",
        icon: CreditCard,
        color: {
          bg: "bg-purple-500",
          border: "border-purple-500",
          text: "text-white",
          shadow: "shadow-purple-200",
        },
        errors,
      });
    }

    // 決済猶予期間終了日
    if (finalPaymentDate && gracePeriod > 0) {
      const errors: ValidationError[] = [];

      if (eventDateObj && finalPaymentDate > addDays(eventDateObj, 30)) {
        errors.push({
          type: "range",
          message: "開催日から30日を超えています",
          severity: "error",
        });
      }

      list.push({
        id: "grace",
        type: "grace",
        date: finalPaymentDate,
        label: "最終決済期限",
        icon: Clock,
        color: {
          bg: "bg-orange-500",
          border: "border-orange-500",
          text: "text-white",
          shadow: "shadow-orange-200",
        },
        errors,
        metadata: {
          isGracePeriod: true,
          graceDays: gracePeriod,
        },
      });
    }

    // 同じタイムスタンプの場合の優先度を考慮した日付によるソート
    return list.sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();
      if (diff !== 0) return diff;

      // 同じタイムスタンプの場合の優先度: 申込 -> 決済 -> イベント -> 猶予期間
      const priority: Record<TimelineItemType, number> = {
        registration: 0,
        payment: 1,
        event: 2,
        grace: 3,
      };
      return priority[a.type] - priority[b.type];
    });
  }, [regDeadlineDate, payDeadlineDate, eventDateObj, finalPaymentDate, gracePeriod]);

  // 3. レンダリング
  if (!items.length) {
    // まだ何も提供されていない場合、空で表示するか、プレースホルダーを表示します。
    return null;
  }

  const hasCriticalErrors = items.some((item) => item.errors.some((e) => e.severity === "error"));

  return (
    <Card
      className={cn("p-6 bg-gradient-to-br from-blue-50/50 to-purple-50/50", className)}
      role="list"
      aria-label="イベントスケジュールタイムライン"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> タイムラインプレビュー
          </h3>
          {hasCriticalErrors && (
            <span className="text-xs text-destructive bg-destructive/10 px-2 py-1 rounded flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> 日時設定を確認してください
            </span>
          )}
        </div>

        <div className="relative pl-2">
          {/* タイムライン線 */}
          <div
            className={cn(
              "absolute left-5 top-2 bottom-4 w-0.5",
              hasCriticalErrors
                ? "bg-red-200"
                : "bg-gradient-to-b from-blue-400 via-purple-400 to-green-400"
            )}
          />

          <div className="space-y-8">
            {items.map((item, index) => {
              const nextItem = items[index + 1];
              const Icon = item.icon;
              const hasError = item.errors.some((e) => e.severity === "error");
              const hasWarning = item.errors.some((e) => e.severity === "warning");

              let iconBg = item.color.bg;

              if (hasError) {
                iconBg = "bg-red-500";
              } else if (hasWarning && item.type === "event") {
                // 厳密に必要な場合のみイベントの色を警告用に変更しますが、仕様に従いアンバー色を警告用として保持します。
                iconBg = "bg-amber-500";
              }

              return (
                <div key={item.id} className="relative z-10 group" role="listitem">
                  <div className="flex items-start gap-3">
                    {/* アイコン */}
                    <div
                      className={cn(
                        "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-all duration-200 group-hover:scale-110",
                        iconBg,
                        hasError ? "shadow-red-200" : item.color.shadow
                      )}
                    >
                      {hasError ? (
                        <AlertCircle className="h-5 w-5 text-white" />
                      ) : hasWarning ? (
                        <AlertTriangle className="h-5 w-5 text-white" />
                      ) : (
                        <Icon className="h-5 w-5 text-white" />
                      )}
                    </div>

                    {/* コンテンツ */}
                    <div className="flex-1 pt-1">
                      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <h4
                            className={cn(
                              "text-sm font-semibold",
                              hasError ? "text-destructive" : "text-foreground"
                            )}
                          >
                            {item.label}
                          </h4>
                          {!hasError && eventDateObj && item.type !== "event" && (
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(item.date, eventDateObj)}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-mono text-muted-foreground shrink-0 bg-white/50 px-2 py-0.5 rounded">
                          {formatDate(item.date)}
                        </span>
                      </div>

                      {/* 決済猶予期間メタデータ */}
                      {item.metadata?.isGracePeriod && !hasError && (
                        <p className="text-xs text-orange-600 mt-1">
                          ※ 決済締切後{item.metadata.graceDays}日間の猶予期間終了
                        </p>
                      )}

                      {/* エラー / 警告 */}
                      {item.errors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {item.errors.map((err, i) => (
                            <p
                              key={i}
                              className={cn(
                                "text-xs font-medium flex items-center gap-1",
                                err.severity === "error" ? "text-destructive" : "text-amber-600"
                              )}
                            >
                              {err.severity === "error" ? "⚠️" : "💡"} {err.message}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* 差分インジケーター */}
                      {!hasError && nextItem && (
                        <div className="mt-4 ml-[-34px] flex items-center gap-2 pl-9 pointer-events-none select-none">
                          <div className="hidden sm:block h-6 w-0.5 bg-slate-200/50 absolute left-[29px] top-[40px] -z-10" />
                          <span className="text-[10px] uppercase tracking-wider font-medium text-slate-500 bg-white/80 px-2 py-0.5 rounded-full border shadow-sm">
                            ⬇ 約{getDiffText(item.date, nextItem.date)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
