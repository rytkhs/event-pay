import React from "react";

import { CheckCircle2, AlertTriangle, HelpCircle, XCircle, Wallet } from "lucide-react";

import { type GuestAttendanceData } from "@core/utils/guest-token";
import { maskEmail } from "@core/utils/mask";

import { GuestScenario } from "../types";

interface GuestStatusCardProps {
  scenario: GuestScenario;
  attendance: GuestAttendanceData;
  isPaymentInvalid?: boolean;
}

export const GuestStatusCard: React.FC<GuestStatusCardProps> = ({
  scenario,
  attendance,
  isPaymentInvalid = false,
}) => {
  const getStatusConfig = () => {
    switch (scenario) {
      case GuestScenario.PAID:
        return {
          bgColor: "bg-emerald-600",
          textColor: "text-white",
          subColor: "bg-emerald-700",
          icon: <CheckCircle2 className="w-12 h-12 mb-2" />,
          title: "参加予定・決済済み",
          message: "",
          priceLabel: "参加費",
        };
      case GuestScenario.PENDING_CASH:
        return {
          bgColor: "bg-blue-600",
          textColor: "text-white",
          subColor: "bg-blue-700",
          icon: <Wallet className="w-12 h-12 mb-2" />,
          title: "参加予定・現金決済",
          message: "現金で直接お支払いください。",
          priceLabel: "参加費",
        };
      case GuestScenario.PENDING_ONLINE:
        if (isPaymentInvalid) {
          return {
            bgColor: "bg-red-500",
            textColor: "text-white",
            subColor: "bg-red-600",
            icon: <AlertTriangle className="w-12 h-12 mb-2" />,
            title: "登録内容の確認が必要です",
            message: "選択された決済方法が現在利用できません。",
            priceLabel: "参加費",
          };
        }
        return {
          bgColor: "bg-amber-500",
          textColor: "text-white",
          subColor: "bg-amber-600",
          icon: <AlertTriangle className="w-12 h-12 mb-2" />,
          title: "参加予定・決済待ち",
          message: "決済を完了してください。",
          priceLabel: "参加費",
        };
      case GuestScenario.MAYBE:
        return {
          bgColor: "bg-gray-100",
          textColor: "text-gray-600",
          subColor: "bg-gray-200",
          icon: <HelpCircle className="w-12 h-12 mb-2 text-gray-400" />,
          title: "未定",
          message: "期限までに参加可否をお知らせください。",
          priceLabel: "参加費",
        };
      case GuestScenario.NOT_ATTENDING:
        return {
          bgColor: "bg-gray-100",
          textColor: "text-gray-500",
          subColor: "bg-gray-200",
          icon: <XCircle className="w-12 h-12 mb-2 text-gray-400" />,
          title: "不参加",
          message: "",
          priceLabel: "参加費",
        };
    }
  };

  const config = getStatusConfig();
  const isTicketStyle = scenario === GuestScenario.PAID;
  const eventFee = attendance.event.fee ?? 0;

  return (
    <div
      className={`rounded-3xl overflow-hidden shadow-lg ${isTicketStyle ? "ring-4 ring-emerald-100" : ""}`}
    >
      {/* Upper Status Area */}
      <div
        className={`${config.bgColor} ${config.textColor} p-8 flex flex-col items-center text-center transition-colors duration-300`}
      >
        {config.icon}
        <h2 className="text-xl font-bold tracking-tight mb-1">{config.title}</h2>
        <p className="text-sm opacity-90 mb-4">{config.message}</p>

        {/* Price Tag */}
        <div className="bg-white/20 backdrop-blur-sm rounded-lg px-6 py-3 min-w-[200px]">
          <p className="text-xs opacity-80 mb-1">{config.priceLabel}</p>
          <p className="text-3xl font-bold font-mono">¥{eventFee.toLocaleString()}</p>
        </div>
      </div>

      {/* Ticket Perforation / Divider */}
      <div className={`h-4 w-full relative ${config.bgColor}`}>
        <div className="absolute top-0 left-0 w-full h-full bg-white rounded-t-2xl"></div>
      </div>

      {/* Lower User Info Area */}
      <div className="bg-white p-6 pt-2">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400 text-xs uppercase mb-1">Guest Name</p>
            <p className="font-semibold text-gray-800 truncate">{attendance.nickname}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs uppercase mb-1">Email</p>
            <p className="font-semibold text-gray-800 truncate">{maskEmail(attendance.email)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
