"use client";

import { ArrowLeft, Calendar, MapPin, Users, JapaneseYen, AlertTriangle } from "lucide-react";

import type { Event } from "@core/types/models";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

interface ParticipantsCompactHeaderProps {
  eventDetail: Event;
  attendingCount: number;
  totalRevenue: number;
  unpaidCount: number;
  onBackClick: () => void;
}

export function ParticipantsCompactHeader({
  eventDetail,
  attendingCount,
  totalRevenue,
  unpaidCount,
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
      <CardContent className="p-3 sm:p-4 md:p-6">
        {/* ヘッダー: 戻るボタン + イベントタイトル + 状況バッジ */}
        <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackClick}
            className="flex-shrink-0 p-2 -ml-2 min-h-[44px] min-w-[44px] sm:p-2 sm:min-h-[auto] sm:min-w-[auto]"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
              <h1 className="text-base sm:text-lg md:text-xl font-bold text-foreground truncate">
                {sanitizeForEventPay(eventDetail.title)}
              </h1>
              {!isFreeEvent && unpaidCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-orange-600 border-orange-200 bg-orange-50 text-xs self-start"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  未決済あり
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">参加者管理</p>
          </div>
        </div>

        {/* イベント基本情報 - モバイルファースト */}
        <div className="space-y-2 sm:space-y-0 mb-3 sm:mb-4">
          {/* 日付と料金（最重要情報）*/}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span className="text-xs sm:text-sm font-medium">
                {formatUtcToJstByType(eventDetail.date, "japanese")}
              </span>
            </div>

            <Separator orientation="vertical" className="h-3 hidden sm:block" />

            <Badge variant={isFreeEvent ? "secondary" : "default"} className="text-xs">
              {isFreeEvent ? "無料" : `¥${eventDetail.fee.toLocaleString()}`}
            </Badge>
          </div>

          {/* 場所と定員（セカンダリ情報）*/}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {eventDetail.location && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span className="text-xs sm:text-sm truncate max-w-[200px] sm:max-w-none">
                  {sanitizeForEventPay(eventDetail.location)}
                </span>
              </div>
            )}

            {capacity > 0 && (
              <>
                {eventDetail.location && (
                  <Separator orientation="vertical" className="h-3 hidden sm:block" />
                )}
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span className="text-xs sm:text-sm">定員{capacity}名</span>
                </div>
              </>
            )}
          </div>
        </div>

        <Separator className="mb-3 sm:mb-4" />

        {/* メトリクス - モバイルファースト */}
        <div className="space-y-3 sm:space-y-4">
          {/* 参加者数（最重要情報） */}
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-sm sm:text-base">参加者数</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl font-bold">{attendingCount}</span>
                {capacity > 0 && (
                  <span className="text-xs sm:text-sm text-muted-foreground">/{capacity}</span>
                )}
              </div>
            </div>
            {capacity > 0 && (
              <div className="space-y-1.5 sm:space-y-2">
                <Progress value={attendanceRate} className="h-1.5 sm:h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>参加率</span>
                  <span>{attendanceRate}%</span>
                </div>
              </div>
            )}
          </div>

          {/* 有料イベントの場合の収益情報 */}
          {!isFreeEvent && (
            <>
              <Separator />
              <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-4">
                {/* 集金状況 */}
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <JapaneseYen className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-sm sm:text-base">集金済み</span>
                    </div>
                    <span className="text-lg sm:text-xl font-bold">
                      ¥{totalRevenue.toLocaleString()}
                    </span>
                  </div>
                  {expectedRevenue > 0 && (
                    <div className="space-y-1.5 sm:space-y-2">
                      <Progress
                        value={Math.min((totalRevenue / expectedRevenue) * 100, 100)}
                        className="h-1.5 sm:h-2"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>予定: ¥{expectedRevenue.toLocaleString()}</span>
                        <span>{Math.round((totalRevenue / expectedRevenue) * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 未決済件数 */}
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      <span className="font-medium text-sm sm:text-base">未決済</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg sm:text-xl font-bold">{unpaidCount}</span>
                      {unpaidCount > 0 && (
                        <Badge
                          variant="outline"
                          className="text-orange-600 border-orange-200 text-xs"
                        >
                          要確認
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
