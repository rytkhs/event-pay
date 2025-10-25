"use client";

import * as React from "react";

import { addDays, differenceInDays, differenceInHours } from "date-fns";
import { format } from "date-fns-tz";
import { Calendar, CreditCard, PartyPopper, Clock } from "lucide-react";

import { cn } from "@core/utils";

import { Card } from "@/components/ui/card";

interface EventFormTimelineProps {
  registrationDeadline?: string; // datetime-local形式の文字列
  paymentDeadline?: string; // datetime-local形式の文字列
  eventDate?: string; // datetime-local形式の文字列
  gracePeriodDays?: string; // 決済猶予期間（日）
  className?: string;
}

export function EventFormTimeline({
  registrationDeadline,
  paymentDeadline,
  eventDate,
  gracePeriodDays,
  className,
}: EventFormTimelineProps) {
  // datetime-local文字列をDateオブジェクトに変換
  const regDeadlineDate = registrationDeadline ? new Date(registrationDeadline) : undefined;
  const payDeadlineDate = paymentDeadline ? new Date(paymentDeadline) : undefined;
  const eventDateObj = eventDate ? new Date(eventDate) : undefined;

  // 決済猶予期間を考慮した実質的な最終決済期限
  const gracePeriod = gracePeriodDays ? parseInt(gracePeriodDays, 10) : 0;
  const finalPaymentDate =
    payDeadlineDate && gracePeriod > 0 ? addDays(payDeadlineDate, gracePeriod) : undefined;

  const formatDate = (date: Date) => {
    return format(date, "M月d日(E) HH:mm", { timeZone: "Asia/Tokyo" });
  };

  const calculateTimeGap = (startDate: Date, endDate: Date): string => {
    const days = differenceInDays(endDate, startDate);
    const hours = differenceInHours(endDate, startDate) % 24;

    if (days > 0) {
      return hours > 0 ? `${days}日${hours}時間` : `${days}日`;
    }
    if (hours > 0) {
      return `${hours}時間`;
    }
    return "0時間";
  };

  // 開催前か開催後かを評価して表示を切り替え
  const formatRelativeTime = (targetDate: Date, eventDate: Date): string => {
    if (targetDate <= eventDate) {
      return `開催の${calculateTimeGap(targetDate, eventDate)}前`;
    } else {
      return `開催${calculateTimeGap(eventDate, targetDate)}後`;
    }
  };

  const hasAllRequired = regDeadlineDate && eventDateObj;
  const hasPaymentDeadline = payDeadlineDate;
  const hasGracePeriod = finalPaymentDate && gracePeriod > 0;

  if (!hasAllRequired) {
    return null;
  }

  // タイムライン検証
  const isValid =
    regDeadlineDate < eventDateObj &&
    (!hasPaymentDeadline || regDeadlineDate <= payDeadlineDate) &&
    (!hasGracePeriod || (finalPaymentDate && finalPaymentDate <= addDays(eventDateObj, 30)));

  return (
    <Card className={cn("p-6 bg-gradient-to-br from-blue-50/50 to-purple-50/50", className)}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">イベントタイムライン</h3>
          {!isValid && (
            <span className="text-xs text-destructive bg-destructive/10 px-2 py-1 rounded">
              ⚠ 日時の順序を確認してください
            </span>
          )}
        </div>

        <div className="relative">
          {/* タイムライン線 */}
          <div className="absolute left-5 top-6 bottom-6 w-0.5 bg-gradient-to-b from-blue-400 via-purple-400 to-green-400" />

          <div className="space-y-6">
            {/* 申込締切 */}
            <div className="relative flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center z-10 shadow-md">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 pt-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h4 className="text-sm font-semibold">申込締切</h4>
                  {eventDateObj && (
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(regDeadlineDate, eventDateObj)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {formatDate(regDeadlineDate)}
                </p>
              </div>
            </div>

            {/* 決済締切（開催前の場合） */}
            {hasPaymentDeadline && payDeadlineDate <= eventDateObj && (
              <div className="relative flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center z-10 shadow-md">
                  <CreditCard className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h4 className="text-sm font-semibold">オンライン決済締切</h4>
                    {eventDateObj && (
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(payDeadlineDate, eventDateObj)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatDate(payDeadlineDate)}
                  </p>
                  {hasGracePeriod && (
                    <p className="text-xs text-blue-600 mt-1">※ 猶予期間{gracePeriod}日間あり</p>
                  )}
                </div>
              </div>
            )}

            {/* 開催日時 */}
            <div className="relative flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500 flex items-center justify-center z-10 shadow-md">
                <PartyPopper className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 pt-1">
                <h4 className="text-sm font-semibold">イベント開催</h4>
                <p className="text-sm text-muted-foreground mt-0.5">{formatDate(eventDateObj)}</p>
              </div>
            </div>

            {/* 決済締切（開催後の場合） */}
            {hasPaymentDeadline && payDeadlineDate > eventDateObj && (
              <div className="relative flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center z-10 shadow-md">
                  <CreditCard className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h4 className="text-sm font-semibold">オンライン決済締切</h4>
                    {eventDateObj && (
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(payDeadlineDate, eventDateObj)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatDate(payDeadlineDate)}
                  </p>
                  {hasGracePeriod && (
                    <p className="text-xs text-blue-600 mt-1">※ 猶予期間{gracePeriod}日間あり</p>
                  )}
                </div>
              </div>
            )}

            {/* 実質的な最終決済期限（猶予期間ありの場合） */}
            {hasGracePeriod && finalPaymentDate && (
              <div className="relative flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center z-10 shadow-md">
                  <Clock className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h4 className="text-sm font-semibold">最終決済期限</h4>
                    {eventDateObj && (
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(finalPaymentDate, eventDateObj)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatDate(finalPaymentDate)}
                  </p>
                  <p className="text-xs text-orange-600 mt-1">締切後の猶予期間終了</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 期間サマリー */}
        {isValid && (
          <div className="grid grid-cols-2 gap-3 pt-3 border-t">
            <div className="text-center bg-white/60 rounded-md py-2">
              <p className="text-xs text-muted-foreground">申込受付期間</p>
              <p className="text-sm font-medium mt-0.5">
                {calculateTimeGap(new Date(), regDeadlineDate)}
              </p>
            </div>
            {hasPaymentDeadline && (
              <div className="text-center bg-white/60 rounded-md py-2">
                <p className="text-xs text-muted-foreground">
                  {payDeadlineDate <= eventDateObj
                    ? "申込から決済締切まで"
                    : "開催から決済締切まで"}
                </p>
                <p className="text-sm font-medium mt-0.5">
                  {payDeadlineDate <= eventDateObj
                    ? calculateTimeGap(regDeadlineDate, payDeadlineDate)
                    : calculateTimeGap(eventDateObj, payDeadlineDate)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 猶予期間の説明 */}
        {hasGracePeriod && isValid && finalPaymentDate && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
            <p className="text-xs text-orange-800">
              <strong>猶予期間:</strong> 決済締切後も{gracePeriod}
              日間はオンライン決済を受け付けます。最終的な決済期限は
              {formatDate(finalPaymentDate)}です。
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
