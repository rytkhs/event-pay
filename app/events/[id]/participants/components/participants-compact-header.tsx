"use client";

import { ArrowLeft, Calendar, MapPin, Users, JapaneseYen } from "lucide-react";

import type { Event } from "@core/types/models";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ParticipantsCompactHeaderProps {
  eventDetail: Event;
  attendingCount: number;
  totalRevenue: number;
  unpaidCount: number;
  completionRate: number;
  onBackClick: () => void;
}

export function ParticipantsCompactHeader({
  eventDetail,
  attendingCount,
  totalRevenue,
  unpaidCount,
  completionRate,
  onBackClick,
}: ParticipantsCompactHeaderProps) {
  // 参加率の計算
  const capacity = eventDetail.capacity ?? 0;
  const attendanceRate = capacity > 0 ? Math.round((attendingCount / capacity) * 100) : 0;

  // 期待収益の計算
  const expectedRevenue = eventDetail.fee * attendingCount;

  // 無料イベントの判定
  const isFreeEvent = eventDetail.fee === 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 sm:p-6">
        {/* 戻るボタン + イベントタイトル */}
        <div className="flex items-start gap-3 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackClick}
            className="flex-shrink-0 p-2 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate mb-1">
              {sanitizeForEventPay(eventDetail.title)}
            </h1>
            <p className="text-sm text-muted-foreground">参加者管理</p>
          </div>
        </div>

        {/* イベント基本情報 */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{formatUtcToJstByType(eventDetail.date, "japanese")}</span>
          </div>

          {eventDetail.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{sanitizeForEventPay(eventDetail.location)}</span>
            </div>
          )}

          <div className="flex items-center gap-1">
            <JapaneseYen className="h-4 w-4" />
            <span>{isFreeEvent ? "無料" : `¥${eventDetail.fee.toLocaleString()}`}</span>
          </div>

          {capacity > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>定員 {capacity}名</span>
            </div>
          )}
        </div>

        {/* メトリクス */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 参加状況 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-muted-foreground">参加者数</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-foreground">{attendingCount}</span>
                {capacity > 0 && (
                  <span className="text-sm text-muted-foreground">/ {capacity}</span>
                )}
              </div>
              {capacity > 0 && (
                <>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-blue-500 transition-all"
                      style={{ width: `${Math.min(attendanceRate, 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">{attendanceRate}%</div>
                </>
              )}
            </div>
          </div>

          {/* 収益状況（有料イベントのみ） */}
          {!isFreeEvent && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <JapaneseYen className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-muted-foreground">収益</span>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-foreground">
                  ¥{totalRevenue.toLocaleString()}
                </div>
                {expectedRevenue > 0 && (
                  <>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-green-500 transition-all"
                        style={{
                          width: `${Math.min((totalRevenue / expectedRevenue) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      / ¥{expectedRevenue.toLocaleString()}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 未決済件数（有料イベントのみ） */}
          {!isFreeEvent && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-orange-100 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-orange-600" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">未決済</span>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-foreground">{unpaidCount}</div>
                <div className="text-xs text-muted-foreground">件</div>
              </div>
            </div>
          )}

          {/* 決済完了率（有料イベントのみ） */}
          {!isFreeEvent && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-purple-100 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-purple-600" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">完了率</span>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-foreground">{completionRate}%</div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-purple-500 transition-all"
                    style={{ width: `${Math.min(completionRate, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 無料イベントの場合は参加者数を強調 */}
        {isFreeEvent && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">参加予定者数</div>
              <div className="text-3xl font-bold text-foreground mt-1">{attendingCount}名</div>
              {capacity > 0 && (
                <div className="text-sm text-muted-foreground mt-1">
                  定員 {capacity}名中 {attendanceRate}%
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
