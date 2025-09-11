"use client";

import React from "react";

import Link from "next/link";

import { Calendar, Home } from "lucide-react";

import { ATTENDANCE_STATUS_LABELS } from "@core/types/enums";
import { type GuestAttendanceData } from "@core/utils/guest-token";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

interface GuestHeaderProps {
  attendance: GuestAttendanceData;
}

function StatusBadge({ status }: { status: string }) {
  const badge = () => {
    switch (status) {
      case "attending":
        return "bg-green-100 text-green-800 border-green-200";
      case "not_attending":
        return "bg-red-100 text-red-800 border-red-200";
      case "maybe":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const text = ATTENDANCE_STATUS_LABELS[status as keyof typeof ATTENDANCE_STATUS_LABELS] || status;

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${badge()}`}
    >
      <div className="w-2 h-2 rounded-full bg-current mr-2 opacity-60"></div>
      {text}
    </span>
  );
}

export function GuestHeader({ attendance }: GuestHeaderProps) {
  const title = sanitizeForEventPay(attendance.event.title);
  const dateJst = formatUtcToJstByType(attendance.event.date, "japanese");

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="text-2xl">🎪</div>
            <span className="text-xl font-bold text-gray-900">EventPay</span>
          </div>
          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="ホームに戻る"
            >
              <Home className="h-5 w-5" />
            </Link>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-3 mb-2">
              <Calendar className="h-6 w-6 text-blue-600 flex-shrink-0" />
              <h1 className="text-2xl font-bold text-gray-900 truncate">{title}</h1>
            </div>
            <p className="text-gray-600">{dateJst}</p>
          </div>
          <div className="mt-3 lg:mt-0 lg:ml-4">
            <StatusBadge status={attendance.status} />
          </div>
        </div>
      </div>
    </header>
  );
}
