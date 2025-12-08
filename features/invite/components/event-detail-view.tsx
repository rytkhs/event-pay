import React from "react";

import { Calendar, MapPin, Users, Clock, Info, Banknote, AlertCircle } from "lucide-react";

import { EventDetail } from "@core/utils/invite-token";
import { formatUtcToJst, formatUtcToJstByType } from "@core/utils/timezone";

interface EventDetailViewProps {
  event: EventDetail;
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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-6">
      <div className="bg-indigo-600 px-6 py-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <span className="bg-indigo-500 bg-opacity-50 text-xs font-semibold px-2.5 py-1 rounded-full border border-indigo-400">
            {statusLabel}
          </span>
          <span className="text-primary-foreground/70 text-sm">作成者: {event.organizer_name}</span>
        </div>
        <h1 className="text-2xl font-bold leading-tight">{event.title}</h1>
      </div>

      <div className="p-6 space-y-5">
        {/* Date & Time */}
        <div className="flex items-start space-x-3">
          <Calendar className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
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
            <MapPin className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
            <div>
              <p className="font-semibold text-slate-900">{event.location}</p>
            </div>
          </div>
        )}

        {/* Fee */}
        <div className="flex items-start space-x-3">
          <Banknote className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
          <div>
            <p className="font-semibold text-slate-900">
              {event.fee > 0 ? `${event.fee.toLocaleString()}円` : "無料"}
            </p>
            {event.fee > 0 && (
              <p className="text-xs text-slate-500">オンライン決済 / 現金払い 対応</p>
            )}
          </div>
        </div>

        {/* Capacity */}
        <div className="flex items-start space-x-3">
          <Users className="w-5 h-5 text-indigo-600 mt-1 flex-shrink-0" />
          <div className="w-full">
            <div className="flex justify-between items-end mb-1">
              <span className="font-semibold text-slate-900">参加状況</span>
              <span
                className={`text-sm font-medium ${isNearCapacity ? "text-orange-500" : "text-slate-600"}`}
              >
                {event.attendances_count} / {isCapacitySet ? `${event.capacity}名` : "無制限"}
              </span>
            </div>
            {isCapacitySet && event.capacity && (
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${isNearCapacity ? "bg-orange-400" : "bg-indigo-500"}`}
                  style={{
                    width: `${Math.min((event.attendances_count / event.capacity) * 100, 100)}%`,
                  }}
                ></div>
              </div>
            )}
            {isNearCapacity && (
              <p className="text-xs text-orange-500 mt-1 flex items-center">
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
                  決済締切:{" "}
                  <span className="font-medium text-slate-800">
                    {formatUtcToJstByType(event.payment_deadline, "japanese")}
                  </span>
                </p>
              )}
            </div>
          </div>
          {event.description && (
            <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600 leading-relaxed border border-slate-100 whitespace-pre-wrap">
              {event.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
