"use client";

import { Sparkles } from "lucide-react";

import { cn } from "@/components/ui/_lib/cn";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SmartSortToggleProps {
  isActive: boolean;
  onToggle: (checked: boolean) => void;
  className?: string;
  showLabel?: boolean;
}

export function SmartSortToggle({
  isActive,
  onToggle,
  className,
  showLabel = true,
}: SmartSortToggleProps) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-full transition-colors border",
        isActive
          ? "bg-indigo-50/50 border-indigo-200"
          : "bg-transparent border-transparent hover:bg-gray-100",
        className
      )}
    >
      <Switch
        id="smart-sort-toggle"
        checked={isActive}
        onCheckedChange={onToggle}
        className={cn(isActive && "data-[state=checked]:bg-indigo-600")}
        aria-label="オートソート切り替え"
      />
      <Label
        htmlFor="smart-sort-toggle"
        className={cn(
          "flex items-center gap-1.5 cursor-pointer select-none text-sm transition-colors",
          isActive ? "text-indigo-700 font-medium" : "text-muted-foreground"
        )}
      >
        <Sparkles
          className={cn(
            "h-3.5 w-3.5 transition-colors",
            isActive ? "fill-indigo-100 text-indigo-600" : "text-gray-400"
          )}
        />
        {showLabel && <span className="opacity-90">オートソート</span>}
      </Label>
    </div>
  );

  if (showLabel) {
    return content;
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent>
        <p>オートソート (重要度順)</p>
      </TooltipContent>
    </Tooltip>
  );
}
