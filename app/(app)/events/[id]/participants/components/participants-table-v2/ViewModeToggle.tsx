"use client";

import * as React from "react";

import { LayoutGrid, Table } from "lucide-react";

import { cn } from "@/components/ui/_lib/cn";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ViewModeToggleProps {
  value: "table" | "cards";
  onChange: (value: "table" | "cards") => void;
}

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <TooltipProvider delayDuration={400}>
      <div
        className="inline-flex items-center p-1 bg-muted/40 rounded-xl border border-border/40"
        role="group"
        aria-label="表示形式を選択"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onChange("table")}
              className={cn(
                "group relative flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-all duration-300 rounded-lg outline-none overflow-hidden",
                value === "table"
                  ? "bg-background text-primary shadow-sm ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
              aria-pressed={value === "table"}
            >
              <Table
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-300",
                  value === "table" ? "scale-110" : "group-hover:scale-105"
                )}
              />
              <span className="hidden sm:inline text-[13px] font-bold">テーブル</span>
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="text-xs bg-popover/95 backdrop-blur-sm border-border/60 rounded-lg shadow-xl"
          >
            テーブル形式で表示
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onChange("cards")}
              className={cn(
                "group relative flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-all duration-300 rounded-lg outline-none overflow-hidden",
                value === "cards"
                  ? "bg-background text-primary shadow-sm ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
              aria-pressed={value === "cards"}
            >
              <LayoutGrid
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-300",
                  value === "cards" ? "scale-110" : "group-hover:scale-105"
                )}
              />
              <span className="hidden sm:inline text-[13px] font-bold">カード</span>
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="text-xs bg-popover/95 backdrop-blur-sm border-border/60 rounded-lg shadow-xl"
          >
            カード形式で表示
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
