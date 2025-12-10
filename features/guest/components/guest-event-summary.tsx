import React, { useState } from "react";

import { MapPin, Calendar, ChevronDown, ChevronUp, Users, Info } from "lucide-react";

import { type GuestAttendanceData } from "@core/utils/guest-token";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

interface GuestEventSummaryProps {
  attendance: GuestAttendanceData;
}

export const GuestEventSummary: React.FC<GuestEventSummaryProps> = ({ attendance }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { event } = attendance;

  const eventDate = formatUtcToJstByType(event.date, "japanese");

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header / Always Visible */}
      <div className="p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-4">{sanitizeForEventPay(event.title)}</h3>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-800">{eventDate}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-800">
                {sanitizeForEventPay(event.location || "未定")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-center gap-2 py-3 bg-gray-50 text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors border-t border-gray-100"
      >
        {isOpen ? "詳細を閉じる" : "詳細を見る"}
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Expandable Content */}
      {isOpen && (
        <div className="p-5 bg-gray-50 border-t border-gray-100 space-y-4 animate-fadeIn">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-gray-700">定員状況</p>
              <p className="text-sm text-gray-600">
                定員: {event.capacity ? `${event.capacity}名` : "無制限"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-gray-700">イベント詳細</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1 leading-relaxed">
                {event.description && sanitizeForEventPay(event.description)}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400">申込締切</p>
              <p className="text-sm font-medium text-gray-700">
                {event.registration_deadline
                  ? formatUtcToJstByType(event.registration_deadline, "japanese")
                  : "設定なし"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">支払い期限</p>
              <p className="text-sm font-medium text-gray-700">
                {event.payment_deadline
                  ? formatUtcToJstByType(event.payment_deadline, "japanese")
                  : "設定なし"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
