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
  className?: string;
}

const statusConfig = [
  {
    value: "all",
    label: "全て",
    icon: Users,
    activeClass:
      "border-foreground/8 bg-foreground/[0.9] text-background shadow-[0_6px_14px_-14px_hsl(var(--foreground)/0.34)]",
    activeCountClass: "bg-background/12 text-background/95",
  },
  {
    value: "attending",
    label: "参加",
    icon: UserCheck,
    activeClass:
      "border-emerald-500/14 bg-emerald-500/[0.045] text-foreground shadow-[0_6px_14px_-14px_rgba(5,150,105,0.16)]",
    activeCountClass: "bg-emerald-500/[0.08] text-emerald-800/85",
  },
  {
    value: "maybe",
    label: "未定",
    icon: HelpCircle,
    activeClass:
      "border-amber-500/14 bg-amber-500/[0.045] text-foreground shadow-[0_6px_14px_-14px_rgba(245,158,11,0.16)]",
    activeCountClass: "bg-amber-500/[0.08] text-amber-800/85",
  },
  {
    value: "not_attending",
    label: "不参加",
    icon: UserMinus,
    activeClass:
      "border-rose-500/14 bg-rose-500/[0.045] text-foreground shadow-[0_6px_14px_-14px_rgba(244,63,94,0.16)]",
    activeCountClass: "bg-rose-500/[0.08] text-rose-800/85",
  },
];

export function ParticipantsStatusTabs({
  counts,
  activeStatus,
  onStatusChange,
  className,
}: StatusTabsProps) {
  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto scrollbar-hide sm:overflow-visible",
        "min-w-0",
        className
      )}
    >
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
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150",
              "border flex-shrink-0 whitespace-nowrap",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/30",
              isActive
                ? status.activeClass
                : "border-border/35 bg-background/72 text-muted-foreground shadow-[0_4px_10px_-12px_hsl(var(--foreground)/0.2)] hover:border-border/55 hover:bg-muted/22 hover:text-foreground"
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", isActive ? "opacity-80" : "opacity-65")} />
            <span>{status.label}</span>
            <span
              className={cn(
                "min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[10.5px] font-semibold transition-colors duration-200",
                isActive ? status.activeCountClass : "bg-muted/45 text-muted-foreground/70"
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
