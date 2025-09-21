"use client";

import { ArrowLeft, Calendar, MapPin, Users, JapaneseYen } from "lucide-react";

import type { Event } from "@core/types/models";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Button } from "@/components/ui/button";

interface ParticipantsHeaderProps {
  eventDetail: Event;
  onBackClick: () => void;
}

export function ParticipantsHeader({ eventDetail, onBackClick }: ParticipantsHeaderProps) {
  return (
    <div className="bg-white rounded-lg border shadow-sm">
      <div className="p-6">
        {/* パンくずリストとタイトル */}
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackClick}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 px-2"
          >
            <ArrowLeft className="h-4 w-4" />
            イベント詳細に戻る
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* イベント基本情報 */}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {sanitizeForEventPay(eventDetail.title)}
            </h1>
            <p className="text-lg text-gray-600 mb-4">参加者管理</p>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
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

              {eventDetail.capacity && (
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>定員 {eventDetail.capacity}名</span>
                </div>
              )}

              <div className="flex items-center gap-1">
                <JapaneseYen className="h-4 w-4" />
                <span>
                  {eventDetail.fee === 0 ? "無料" : `¥${eventDetail.fee.toLocaleString()}`}
                </span>
              </div>
            </div>
          </div>

          {/* モバイルでは縦積み、デスクトップでは横並びのレイアウト */}
          <div className="flex-shrink-0">
            <div className="text-right">
              <div className="text-sm text-gray-500">最終更新</div>
              <div className="text-sm font-medium text-gray-700">
                {formatUtcToJstByType(eventDetail.updated_at, "japanese")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
