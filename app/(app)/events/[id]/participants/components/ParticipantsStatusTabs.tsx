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
    activeClass:
      "bg-primary border-primary text-primary-foreground shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.25),0_4px_10px_-4px_hsl(var(--primary)/0.6)] font-bold",
    activeCountClass: "bg-primary-foreground/20 text-primary-foreground",
  },
  {
    value: "attending",
    label: "参加",
    icon: UserCheck,
    activeClass:
      "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 font-bold shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] ring-1 ring-emerald-500/10",
    activeCountClass: "bg-emerald-500/20 text-emerald-800",
  },
  {
    value: "maybe",
    label: "未定",
    icon: HelpCircle,
    activeClass:
      "bg-amber-500/15 border-amber-500/30 text-amber-700 font-bold shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] ring-1 ring-amber-500/10",
    activeCountClass: "bg-amber-500/20 text-amber-800",
  },
  {
    value: "not_attending",
    label: "不参加",
    icon: UserMinus,
    activeClass:
      "bg-rose-500/10 border-rose-500/20 text-rose-700 font-bold shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] ring-1 ring-rose-500/10",
    activeCountClass: "bg-rose-500/20 text-rose-800",
  },
];

export function ParticipantsStatusTabs({ counts, activeStatus, onStatusChange }: StatusTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible scrollbar-hide">
      {statusConfig.map((status) => {
        const isActive = activeStatus === status.value;
        const count = counts[status.value as keyof typeof counts];
        const Icon = status.icon;

        return (
          <button
            key={status.value}
            type="button"
            aria-pressed={isActive}
            aria-label={`${status.label}で絞り込み`}
            onClick={() => onStatusChange(status.value)}
            className={cn(
              "inline-flex items-center gap-1.25 px-3 py-1 rounded-full text-[13px] font-medium transition-all duration-300",
              "border flex-shrink-0 whitespace-nowrap",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/40",
              isActive
                ? status.activeClass
                : "bg-background text-muted-foreground border-border/50 hover:bg-muted/40 hover:border-border/80 shadow-[0_2px_8px_-4px_hsl(var(--foreground)/0.05)] hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{status.label}</span>
            <span
              className={cn(
                "ml-0.5 px-1 py-0.25 rounded-full text-[11px] font-semibold min-w-[1.5rem] text-center transition-colors duration-300",
                isActive ? status.activeCountClass : "bg-muted text-muted-foreground/80"
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
