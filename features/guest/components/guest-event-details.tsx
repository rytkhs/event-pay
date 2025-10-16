"use client";

import React, { useState } from "react";

import { MapPin, DollarSign, Users, Clock, ChevronDown, ChevronUp } from "lucide-react";

import { type GuestAttendanceData } from "@core/utils/guest-token";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Card } from "@/components/ui/card";

interface GuestEventDetailsProps {
  attendance: GuestAttendanceData;
}

export function GuestEventDetails({ attendance }: GuestEventDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const event = attendance.event;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center">イベント詳細</h2>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center text-sm text-blue-600 hover:text-blue-700 transition-colors"
        >
          詳細を見る{" "}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 ml-1" />
          ) : (
            <ChevronDown className="h-4 w-4 ml-1" />
          )}
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-start space-x-3">
          <MapPin className="h-5 w-5 text-gray-500 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium text-gray-900">
              {sanitizeForEventPay(event.location || "未定")}
            </div>
          </div>
        </div>

        {event.fee > 0 && (
          <div className="flex items-center space-x-3">
            <DollarSign className="h-5 w-5 text-gray-500 flex-shrink-0" />
            <div>
              <span className="font-medium text-gray-900">¥{event.fee.toLocaleString()}</span>
            </div>
          </div>
        )}

        {event.payment_deadline && (
          <div className="flex items-center space-x-3">
            <Clock className="h-5 w-5 text-gray-500 flex-shrink-0" />
            <div className="text-gray-900">
              オンライン決済締切:{" "}
              <span className="font-medium">
                {formatUtcToJstByType(event.payment_deadline, "japanese")}
              </span>
            </div>
          </div>
        )}
      </div>

      <div
        className={`transition-all duration-300 ease-in-out ${isExpanded ? "max-h-screen opacity-100 mt-6" : "max-h-0 opacity-0 overflow-hidden"}`}
      >
        <div className="border-t border-gray-200 pt-6 space-y-6">
          {event.description && (
            <div>
              <h3 className="font-medium text-gray-900 mb-2">イベント概要</h3>
              <p className="text-gray-700 leading-relaxed">
                {sanitizeForEventPay(event.description)}
              </p>
            </div>
          )}

          {event.capacity !== null && typeof event.capacity === "number" && (
            <div>
              <h3 className="font-medium text-gray-900 mb-2 flex items-center">
                <Users className="h-4 w-4 mr-2" />
                参加者数
              </h3>
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600">
                  定員: <span className="font-medium text-gray-900">{event.capacity}名</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
