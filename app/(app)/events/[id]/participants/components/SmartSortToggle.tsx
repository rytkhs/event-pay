"use client";

import { useId } from "react";

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
  const switchId = useId();

  const content = (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-2 py-1.5 transition-colors",
        isActive
          ? "border-border/45 bg-background/65 shadow-[0_4px_12px_-14px_hsl(var(--foreground)/0.22)]"
          : "border-border/35 bg-background/55 hover:bg-muted/25",
        className
      )}
    >
      <Switch
        id={switchId}
        checked={isActive}
        onCheckedChange={onToggle}
        className={cn(isActive && "data-[state=checked]:bg-primary")}
        aria-label="オートソート切り替え"
      />
      <Label
        htmlFor={switchId}
        className={cn(
          "flex items-center gap-1.5 cursor-pointer select-none text-sm transition-colors",
          isActive ? "font-medium text-foreground/90" : "text-muted-foreground"
        )}
      >
        <Sparkles
          className={cn(
            "h-3.5 w-3.5 transition-colors",
            isActive ? "fill-primary/12 text-primary/85" : "text-muted-foreground/65"
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
