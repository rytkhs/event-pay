"use client";

import { Search, X } from "lucide-react";

import { SIMPLE_PAYMENT_STATUS_LABELS } from "@features/events";

import { cn } from "@/components/ui/_lib/cn";
import { Button } from "@/components/ui/button";

import type { EventManagementQuery, EventManagementQueryPatch } from "../../query-params";

interface ParticipantsActiveFiltersProps {
  query: EventManagementQuery;
  onFiltersChange: (patch: EventManagementQueryPatch) => void;
  isFreeEvent: boolean;
  className?: string;
}

type ActiveFilterChip = {
  key: string;
  label: string;
  clearPatch: EventManagementQueryPatch;
};

export function ParticipantsActiveFilters({
  query,
  onFiltersChange,
  isFreeEvent,
  className,
}: ParticipantsActiveFiltersProps) {
  const chips: ActiveFilterChip[] = [];

  if (query.search) {
    chips.push({
      key: "search",
      label: `検索: ${query.search}`,
      clearPatch: { search: "" },
    });
  }

  if (!isFreeEvent && query.paymentMethod) {
    chips.push({
      key: "paymentMethod",
      label: query.paymentMethod === "cash" ? "現金" : "オンライン",
      clearPatch: { paymentMethod: undefined },
    });
  }

  if (!isFreeEvent && query.paymentStatus) {
    chips.push({
      key: "paymentStatus",
      label: SIMPLE_PAYMENT_STATUS_LABELS[query.paymentStatus],
      clearPatch: { paymentStatus: undefined },
    });
  }

  if (!query.smart && query.sort && query.order) {
    const sortLabels: Record<NonNullable<EventManagementQuery["sort"]>, string> = {
      created_at: "登録日時",
      nickname: "ニックネーム",
      status: "参加状況",
      updated_at: "更新日時",
    };
    chips.push({
      key: "sort",
      label: `${sortLabels[query.sort]}: ${query.order === "asc" ? "昇順" : "降順"}`,
      clearPatch: {
        smart: false,
        sort: undefined,
        order: undefined,
      },
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <div className="inline-flex items-center gap-1.5 rounded-full border border-border/25 bg-transparent px-2 py-1 text-[10px] font-medium text-muted-foreground/75">
        <Search className="h-3.5 w-3.5" />
        現在の条件
      </div>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onFiltersChange(chip.clearPatch)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/35 bg-background/55 px-2.5 py-1 text-[11px] font-medium text-foreground/75 transition-colors hover:bg-muted/20"
          aria-label={`${chip.label}を解除`}
        >
          <span>{chip.label}</span>
          <X className="h-3.5 w-3.5 text-muted-foreground/65" />
        </button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() =>
          onFiltersChange({
            search: "",
            paymentMethod: undefined,
            paymentStatus: undefined,
            smart: false,
            sort: undefined,
            order: undefined,
          })
        }
        className="h-7 rounded-full px-1.5 text-[11px] font-medium text-muted-foreground/80 hover:bg-transparent hover:text-foreground"
      >
        すべて解除
      </Button>
    </div>
  );
}
