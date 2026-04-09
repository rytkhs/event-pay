import React from "react";

import { Calendar, MapPin, Users, Clock, Info, Banknote, AlertCircle } from "lucide-react";

import type { InviteEventDetail } from "@core/types/invite";
import { formatUtcToJst, formatUtcToJstByType } from "@core/utils/timezone";

interface EventDetailViewProps {
  event: InviteEventDetail;
}

export const EventDetailView: React.FC<EventDetailViewProps> = ({ event }) => {
  const isCapacitySet = event.capacity !== null && event.capacity > 0;
  const isNearCapacity =
    isCapacitySet && event.capacity
      ? event.capacity - event.attendances_count <= 5 &&
        event.capacity - event.attendances_count > 0
      : false;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "upcoming":
        return "募集中";
      case "ongoing":
        return "開催中";
      case "canceled":
        return "中止";
      case "past":
        return "終了";
      default:
        return "受付終了";
    }
  };

  const statusLabel = getStatusLabel(event.status);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
      <div className="px-6 py-7 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary uppercase tracking-wider">
            {statusLabel}
          </span>
          <span className="text-slate-400 text-xs font-medium">{event.community.name}</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 leading-tight tracking-tight">
          {event.title}
        </h1>
      </div>

      <div className="p-6 space-y-5">
        {/* Date & Time */}
        <div className="flex items-start space-x-3">
          <Calendar className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
          <div>
            <p className="font-semibold text-slate-900">
              {formatUtcToJst(event.date, "yyyy年MM月dd日")}
            </p>
            <p className="text-slate-600 text-sm flex items-center">
              <Clock className="w-3 h-3 mr-1" />
              {formatUtcToJstByType(event.date, "time-only")} 〜
            </p>
          </div>
        </div>

        {/* Location */}
        {event.location && (
          <div className="flex items-start space-x-3">
            <MapPin className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div>
              <p className="font-semibold text-slate-900">{event.location}</p>
            </div>
          </div>
        )}

        {/* Fee */}
        <div className="flex items-start space-x-3">
          <Banknote className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
          <div>
            <p className="font-semibold text-slate-900">
              {event.fee > 0 ? `${event.fee.toLocaleString()}円` : "無料"}
            </p>
            {/* {event.fee > 0 && (
              <p className="text-xs text-slate-500">オンライン決済 / 現金払い 対応</p>
            )} */}
          </div>
        </div>

        {/* Capacity */}
        <div className="flex items-start space-x-3">
          <Users className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
          <div className="w-full">
            <div className="flex justify-between items-end mb-1">
              <span className="font-semibold text-slate-900">参加状況</span>
              <span
                className={`text-sm font-medium ${isNearCapacity ? "text-warning" : "text-slate-600"}`}
              >
                {event.attendances_count} / {isCapacitySet ? `${event.capacity}名` : "制限なし"}
              </span>
            </div>
            {isCapacitySet && event.capacity && (
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${isNearCapacity ? "bg-warning" : "bg-primary"}`}
                  style={{
                    width: `${Math.min((event.attendances_count / event.capacity) * 100, 100)}%`,
                  }}
                ></div>
              </div>
            )}
            {isNearCapacity && (
              <p className="text-xs text-warning mt-1 flex items-center">
                <AlertCircle className="w-3 h-3 mr-1" /> 残りわずかです
              </p>
            )}
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Deadlines & Info */}
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-slate-600 space-y-1">
              {event.registration_deadline && (
                <p>
                  申込締切:{" "}
                  <span className="font-medium text-slate-800">
                    {formatUtcToJstByType(event.registration_deadline, "japanese")}
                  </span>
                </p>
              )}
              {event.payment_deadline && (
                <p>
                  オンライン決済締切:{" "}
                  <span className="font-medium text-slate-800">
                    {formatUtcToJstByType(event.payment_deadline, "japanese")}
                  </span>
                </p>
              )}
            </div>
          </div>
          {event.description && (
            <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap pt-4 border-t border-slate-100">
              {event.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
