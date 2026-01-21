"use client";

import { Users, UserCheck, UserMinus, HelpCircle } from "lucide-react";

import { cn } from "@/components/ui/_lib/cn";

interface StatusTabsProps {
  counts: {
    all: number;
    attending: number;
    maybe: number;
    not_attending: number;
  };
  activeStatus: string;
  onStatusChange: (status: string) => void;
}

const statusConfig = [
  {
    value: "all",
    label: "全て",
    icon: Users,
    activeClass: "bg-gray-900 text-white border-gray-900",
  },
  {
    value: "attending",
    label: "参加",
    icon: UserCheck,
    activeClass: "bg-green-600 text-white border-green-600",
  },
  {
    value: "maybe",
    label: "未定",
    icon: HelpCircle,
    activeClass: "bg-yellow-500 text-white border-yellow-500",
  },
  {
    value: "not_attending",
    label: "不参加",
    icon: UserMinus,
    activeClass: "bg-red-500 text-white border-red-500",
  },
];

export function ParticipantsStatusTabs({ counts, activeStatus, onStatusChange }: StatusTabsProps) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible scrollbar-hide"
      role="tablist"
      aria-label="参加状況でフィルター"
    >
      {statusConfig.map((status) => {
        const isActive = activeStatus === status.value;
        const count = counts[status.value as keyof typeof counts];
        const Icon = status.icon;

        return (
          <button
            key={status.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onStatusChange(status.value)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium",
              "border transition-all duration-200 flex-shrink-0 whitespace-nowrap",
              "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary",
              "hover:shadow-sm",
              isActive
                ? status.activeClass
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{status.label}</span>
            <span
              className={cn(
                "ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold min-w-[1.5rem] text-center",
                isActive ? "bg-white/20 text-current" : "bg-gray-100 text-gray-600"
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
