"use client";

import { calculateApplicationFeeEstimate } from "@core/stripe/fee-config/application-fee-estimator";
import type { PlatformFeeConfig } from "@core/stripe/fee-config/service";
import { formatCurrency } from "@core/utils/fee-calculator";

import { Card } from "@/components/ui/card";

interface FeeCalculatorDisplayProps {
  fee: number;
  platformFeeConfig?: PlatformFeeConfig | null;
  className?: string;
}

/**
 * 参加費の手取り額を表示するコンポーネント
 * オンライン集金手数料を差し引いた実際の受取額を視覚的に表示
 */
export function FeeCalculatorDisplay({
  fee,
  platformFeeConfig,
  className = "",
}: FeeCalculatorDisplayProps) {
  // 100円未満の場合は非表示
  if (!Number.isInteger(fee) || fee < 100 || !platformFeeConfig) {
    return null;
  }

  const estimate = calculateApplicationFeeEstimate(fee, platformFeeConfig);

  return (
    <Card className={`p-4 bg-gradient-to-br from-blue-50/50 to-purple-50/50 ${className}`}>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-700">オンライン集金時の予想手取り</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">参加費</span>
            <span className="font-medium">{formatCurrency(fee)}円</span>
          </div>
          <div className="flex justify-between items-center text-red-600">
            <span>− 手数料</span>
            <span>−{formatCurrency(estimate.applicationFeeAmount)}円</span>
          </div>
          <div className="pt-2 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-900">手取り額</span>
              <span className="text-lg font-bold text-green-600">
                {formatCurrency(estimate.netAmount)}円
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
