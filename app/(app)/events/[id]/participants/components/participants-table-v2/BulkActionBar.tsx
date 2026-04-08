"use client";

import { Check, Shield, X } from "lucide-react";

import { useMobileBottomOverlay } from "@/components/layout/mobile-chrome-context";
import { cn } from "@/components/ui/_lib/cn";
import { Button } from "@/components/ui/button";

interface BulkActionBarProps {
  selectedCount: number;
  totalOperableCount: number;
  onBulkReceive: () => void;
  onBulkWaive: () => void;
  onClearSelection: () => void;
  isProcessing: boolean;
}

export function BulkActionBar({
  selectedCount,
  totalOperableCount,
  onBulkReceive,
  onBulkWaive,
  onClearSelection,
  isProcessing,
}: BulkActionBarProps) {
  useMobileBottomOverlay(selectedCount > 0);

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-lg",
        "transform transition-all duration-500 ease-out",
        "animate-in fade-in slide-in-from-bottom-8 zoom-in-95"
      )}
      role="region"
      aria-label="一括操作バー"
    >
      <div className="rounded-full border border-border/50 bg-background/80 px-2 py-2 shadow-2xl shadow-black/10 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center justify-between gap-3 pl-3 pr-1">
          {/* 左側: 選択状況 */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClearSelection}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-muted/50 hover:bg-muted transition-colors"
              aria-label="選択解除"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-foreground leading-none">
                {selectedCount}件 選択中
              </span>
              {totalOperableCount > selectedCount && (
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">
                  / {totalOperableCount}件対象
                </span>
              )}
            </div>
          </div>

          {/* 右側: アクションボタン */}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={onBulkReceive}
              disabled={isProcessing}
              className="h-9 px-4 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[13px] shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.6)]"
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              受領<span className="hidden sm:inline">する</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onBulkWaive}
              disabled={isProcessing}
              className="h-9 px-4 rounded-full border-border/60 bg-background/50 hover:bg-background text-foreground font-bold text-[13px]"
            >
              <Shield className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              免除<span className="hidden sm:inline">する</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
