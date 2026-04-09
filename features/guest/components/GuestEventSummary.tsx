import React from "react";

import { MapPin, Calendar, Users, Clock, AlignLeft } from "lucide-react";

import type { GuestAttendanceData } from "@core/types/guest";
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
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header / Always Visible */}
      <div className="px-6 py-7 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-slate-400 text-xs font-medium">
            {sanitizeForEventPay(event.community.name)}
          </span>
        </div>
        <h1 className="text-lg font-bold text-slate-900 leading-tight tracking-tight">
          {sanitizeForEventPay(event.title)}
        </h1>
      </div>

      <div className="p-6">
        <div className="space-y-5">
          {/* Main Info */}
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">{eventDate}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">
                {sanitizeForEventPay(event.location || "未定")}
              </p>
            </div>
          </div>
        </div>

        {/* Metadata Grid (Deadlines & Capacity) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8 pt-6 mt-6 border-t border-slate-100">
          {/* Registration Deadline */}
          <div className="flex items-start gap-3">
            <div className="bg-blue-50 p-2 rounded-full shrink-0">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5 font-medium">申込締切</p>
              <p className="text-sm font-bold text-gray-700">{regDeadline || "設定なし"}</p>
            </div>
          </div>

          {/* Payment Deadline */}
          <div className="flex items-start gap-3">
            <div className="bg-emerald-50 p-2 rounded-full shrink-0">
              <Clock className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5 font-medium">オンライン決済締切</p>
              <p className="text-sm font-bold text-gray-700">{payDeadline || "設定なし"}</p>
            </div>
          </div>

          {/* Capacity */}
          <div className="flex items-start gap-3 sm:col-span-2">
            <div className="bg-slate-50 p-2 rounded-full shrink-0">
              <Users className="w-4 h-4 text-slate-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-500 mb-0.5 font-medium">定員</p>
              <p className="text-sm font-bold text-slate-700">
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
                <span>説明・備考</span>
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
