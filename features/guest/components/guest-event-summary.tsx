import React from "react";

import { MapPin, Calendar, Users, Clock, AlignLeft } from "lucide-react";

import { type GuestAttendanceData } from "@core/utils/guest-token";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface GuestEventSummaryProps {
  attendance: GuestAttendanceData;
}

export const GuestEventSummary: React.FC<GuestEventSummaryProps> = ({ attendance }) => {
  const { event } = attendance;

  const hasDescription = !!event.description;
  const eventDate = formatUtcToJstByType(event.date, "japanese");
  const payDeadline = event.payment_deadline
    ? formatUtcToJstByType(event.payment_deadline, "japanese")
    : null;
  const regDeadline = event.registration_deadline
    ? formatUtcToJstByType(event.registration_deadline, "japanese")
    : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header / Always Visible */}
      <div className="p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-4 leading-snug">
          {sanitizeForEventPay(event.title)}
        </h3>

        <div className="space-y-3">
          {/* Main Info */}
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

        {/* Metadata Grid (Deadlines & Capacity) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 pt-5 mt-5 border-t border-gray-100">
          {/* Payment Deadline */}
          <div className="flex items-start gap-2.5">
            <div className="bg-emerald-50 p-1.5 rounded-full shrink-0">
              <Clock className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5 font-medium">支払い期限</p>
              <p className="text-sm font-bold text-gray-700">{payDeadline || "設定なし"}</p>
            </div>
          </div>

          {/* Registration Deadline */}
          <div className="flex items-start gap-2.5">
            <div className="bg-blue-50 p-1.5 rounded-full shrink-0">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5 font-medium">申込締切</p>
              <p className="text-sm font-bold text-gray-700">{regDeadline || "設定なし"}</p>
            </div>
          </div>

          {/* Capacity */}
          <div className="flex items-start gap-2.5 sm:col-span-2">
            <div className="bg-gray-100 p-1.5 rounded-full shrink-0">
              <Users className="w-4 h-4 text-gray-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5 font-medium">定員</p>
              <p className="text-sm font-bold text-gray-700">
                {event.capacity ? `${event.capacity}名` : "無制限"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Description Toggle (Only if description exists) */}
      {hasDescription && (
        <Accordion type="single" collapsible className="w-full border-t border-gray-100">
          <AccordionItem value="description" className="border-b-0">
            <AccordionTrigger className="px-5 py-3 hover:bg-gray-50 hover:no-underline text-xs font-semibold text-gray-500 [&[data-state=open]]:bg-gray-50">
              <div className="flex items-center gap-2">
                <AlignLeft className="w-3 h-3" />
                <span>イベント説明・備考</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5 bg-gray-50 text-gray-600">
              <div className="prose prose-sm max-w-none text-gray-600">
                <p className="whitespace-pre-wrap leading-relaxed">
                  {sanitizeForEventPay(event.description || "")}
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
};
