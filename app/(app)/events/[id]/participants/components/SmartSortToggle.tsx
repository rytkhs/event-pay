"use client";

import { useId } from "react";

import { AlertCircle, CheckCircle2, CircleDashed, Info, Sparkles, UserMinus } from "lucide-react";

import { cn } from "@/components/ui/_lib/cn";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
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

  const control = (
    <div className="flex items-center gap-1.5">
      <Switch
        id={switchId}
        checked={isActive}
        onCheckedChange={onToggle}
        className={cn(isActive && "data-[state=checked]:bg-primary")}
        aria-label="オートソート切り替え"
      />
      <div className="flex items-center gap-2">
        <Label
          htmlFor={switchId}
          className={cn(
            "flex cursor-pointer select-none items-center gap-1.5 text-sm transition-colors",
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
        <SmartSortDescription />
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-1.5 py-1 transition-colors",
        isActive
          ? "border-primary/20 bg-primary/[0.03] shadow-[0_2px_8px_-4px_hsl(var(--primary)/0.12)]"
          : "border-border/40 bg-background/50 hover:bg-muted/30",
        className
      )}
    >
      {showLabel ? (
        control
      ) : (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>{control}</TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            <p>オートソート (要対応順)</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function SmartSortDescription() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/45 ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
          <span className="sr-only">オートソートの並び順を表示</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)] rounded-xl p-4 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.12)]"
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <p className="text-sm font-semibold text-foreground">オートソートの並び順</p>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              「今、誰を確認すべきか」を基準に自動で並べ替えます。
            </p>
          </div>

          <Separator className="opacity-50" />

          {/* 有料イベント */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                有料イベント
              </p>
              <Badge variant="outline" className="h-4 px-1 text-[9px] font-medium opacity-60">
                要対応を優先
              </Badge>
            </div>

            <div className="grid gap-3 pl-1">
              <div className="flex gap-2.5">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">要対応（未決済）</p>
                  <p className="text-[10px] text-muted-foreground">
                    「参加」で未払いの方を最上位に。手渡しが必要な現金を優先表示します。
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">完了（決済済・免除）</p>
                  <p className="text-[10px] text-muted-foreground">
                    支払いが終わった方や、集金が不要な方は下位にまとめます。
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 opacity-60">
                <UserMinus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="space-y-0.5">
                  <p className="text-xs font-medium">その他</p>
                  <p className="text-[10px]">不参加・未定の方などは一番下に表示されます。</p>
                </div>
              </div>
            </div>
          </div>

          <Separator className="opacity-30" />

          {/* 無料イベント */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
              無料イベント
            </p>
            <div className="flex items-center gap-3 pl-1">
              <CircleDashed className="h-3.5 w-3.5 text-primary/60" />
              <p className="text-[11px] text-foreground/80">
                <span className="font-medium text-foreground">参加 ➔ 未定 ➔ 不参加</span>{" "}
                の順で、直近に更新された人を優先します。
              </p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
