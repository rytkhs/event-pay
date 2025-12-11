"use client";

import { Check, Shield, X } from "lucide-react";

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
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "bg-white/95 backdrop-blur-sm border-t shadow-lg",
        "transform transition-transform duration-300 ease-out",
        "animate-in slide-in-from-bottom-4"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* 左側: 選択状況 */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClearSelection}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              aria-label="選択解除"
            >
              <X className="h-4 w-4 text-gray-600" />
            </button>
            <div className="text-sm">
              <span className="font-semibold text-gray-900">{selectedCount}件</span>
              <span className="text-gray-500 ml-1">選択中</span>
              {totalOperableCount > selectedCount && (
                <span className="text-gray-400 ml-1">/ {totalOperableCount}件対象</span>
              )}
            </div>
          </div>

          {/* 右側: アクションボタン */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={onBulkReceive}
              disabled={isProcessing}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <Check className="h-4 w-4" />
              <span className="hidden sm:inline">一括</span>受領
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onBulkWaive}
              disabled={isProcessing}
              className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-2"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">一括</span>免除
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
