"use client";

import { calculateNetAmount, formatCurrency } from "@core/utils/fee-calculator";

import { Card } from "@/components/ui/card";

interface FeeCalculatorDisplayProps {
  fee: number;
  className?: string;
}

/**
 * 参加費の手取り額を表示するコンポーネント
 * Stripe手数料を差し引いた実際の受取額を視覚的に表示
 */
export function FeeCalculatorDisplay({ fee, className = "" }: FeeCalculatorDisplayProps) {
  // 100円未満の場合は非表示
  if (fee < 100) {
    return null;
  }

  const netAmount = calculateNetAmount(fee);

  return (
    <Card className={`p-4 bg-gradient-to-br from-blue-50/50 to-purple-50/50 ${className}`}>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-700">オンライン決済時の手取り額</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">参加費</span>
            <span className="font-medium">{formatCurrency(fee)}円</span>
          </div>
          <div className="flex justify-between items-center text-red-600">
            <span>− 各種手数料</span>
            <span>−{formatCurrency(fee - netAmount)}円</span>
          </div>
          <div className="pt-2 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-900">手取り額</span>
              <span className="text-lg font-bold text-green-600">
                {formatCurrency(netAmount)}円
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
