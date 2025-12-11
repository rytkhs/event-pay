"use client";

import { useState } from "react";

import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

import { cn } from "@/components/ui/_lib/cn";
import { Button } from "@/components/ui/button";

interface ParticipantsSummaryAlertProps {
  unpaidCount: number;
  unpaidAmount: number;
  onViewUnpaid: () => void;
}

export function ParticipantsSummaryAlert({
  unpaidCount,
  unpaidAmount,
  onViewUnpaid,
}: ParticipantsSummaryAlertProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (unpaidCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border transition-all duration-200",
        "bg-gradient-to-r from-amber-50 to-orange-50",
        "border-amber-200"
      )}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-50/50 transition-colors rounded-t-lg"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <span className="font-medium text-amber-900">未払い {unpaidCount}件</span>
            <span className="text-amber-700 ml-2">合計 ¥{unpaidAmount.toLocaleString()}</span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-amber-600" />
        ) : (
          <ChevronRight className="h-4 w-4 text-amber-600" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-amber-100">
          <p className="text-sm text-amber-800 mb-3">
            参加予定で決済が完了していない参加者がいます。
            未払いの参加者を確認して、現金回収または支払いリマインドを行ってください。
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onViewUnpaid}
            className="border-amber-300 text-amber-700 hover:bg-amber-100"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            未払いの参加者を表示
          </Button>
        </div>
      )}
    </div>
  );
}
