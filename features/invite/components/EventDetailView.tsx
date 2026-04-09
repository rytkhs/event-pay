import React from "react";

import { Calendar, MapPin, Users, Clock, Banknote, AlertCircle } from "lucide-react";

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
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8 pt-6 border-t border-slate-100">
          {/* Registration Deadline */}
          {event.registration_deadline && (
            <div className="flex items-start gap-3">
              <div className="bg-blue-50 p-2 rounded-full shrink-0">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5 font-medium">申込締切</p>
                <p className="text-sm font-bold text-slate-700">
                  {formatUtcToJstByType(event.registration_deadline, "japanese")}
                </p>
              </div>
            </div>
          )}

          {/* Payment Deadline */}
          {event.payment_deadline && (
            <div className="flex items-start gap-3">
              <div className="bg-emerald-50 p-2 rounded-full shrink-0">
                <Clock className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5 font-medium">オンライン決済締切</p>
                <p className="text-sm font-bold text-slate-700">
                  {formatUtcToJstByType(event.payment_deadline, "japanese")}
                </p>
              </div>
            </div>
          )}

          {/* Capacity */}
          <div className="flex items-start gap-3 sm:col-span-2">
            <div className="bg-slate-50 p-2 rounded-full shrink-0">
              <Users className="w-4 h-4 text-slate-600" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs text-slate-500 font-medium">参加状況 / 定員</p>
                <p
                  className={`text-sm font-bold ${isNearCapacity ? "text-warning" : "text-slate-700"}`}
                >
                  {event.attendances_count} / {isCapacitySet ? `${event.capacity}名` : "制限なし"}
                </p>
              </div>
              {isCapacitySet && event.capacity && (
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5">
                  <div
                    className={`h-1.5 rounded-full ${isNearCapacity ? "bg-warning" : "bg-primary"}`}
                    style={{
                      width: `${Math.min((event.attendances_count / event.capacity) * 100, 100)}%`,
                    }}
                  ></div>
                </div>
              )}
              {isNearCapacity && (
                <p className="text-[10px] text-warning mt-1.5 flex items-center font-medium">
                  <AlertCircle className="w-3 h-3 mr-1" /> 残りわずかです
                </p>
              )}
            </div>
          </div>
        </div>
        {event.description && (
          <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap pt-4 border-t border-slate-100">
            {event.description}
          </div>
        )}
      </div>
    </div>
  );
};
