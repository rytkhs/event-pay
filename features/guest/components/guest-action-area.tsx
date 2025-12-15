import React from "react";

import { CreditCard, CalendarCheck, AlertTriangle } from "lucide-react";

import { GuestScenario } from "../types";

interface GuestActionAreaProps {
  scenario: GuestScenario;
  onPay: () => void;
  onOpenModal: () => void;
  isProcessingPayment?: boolean;
  // Validation Props
  isEligible?: boolean;
  ineligibilityReason?: string;
  isGracePeriod?: boolean;
  isPaymentInvalid?: boolean;
}

export const GuestActionArea: React.FC<GuestActionAreaProps> = ({
  scenario,
  onPay,
  onOpenModal,
  isProcessingPayment = false,
  isEligible = true,
  ineligibilityReason,
  isGracePeriod = false,
  isPaymentInvalid = false,
}) => {
  // Case 1: Needs to Pay (Highest Priority)
  if (scenario === GuestScenario.PENDING_ONLINE) {
    return (
      <div className="bg-white rounded-xl p-5 shadow-sm border border-amber-100 space-y-4">
        <h3 className="text-sm font-bold text-gray-700 flex items-center">
          <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs mr-2">
            ACTION
          </span>
          決済が完了していません
        </h3>

        {/* 1. Ineligible (Deadline passed, etc.) */}
        {!isEligible && (
          <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{ineligibilityReason || "現在、決済を受け付けていません。"}</span>
          </div>
        )}

        {/* 2. Grace Period Warning */}
        {isEligible && isGracePeriod && (
          <div className="bg-orange-50 text-orange-700 px-3 py-2 rounded-lg text-sm border border-orange-100">
            <p className="font-bold text-xs mb-1">決済期限を過ぎています</p>
            <p className="text-xs opacity-90">猶予期間中のためまだ決済が可能です。</p>
          </div>
        )}

        {/* 3. Payment Method Invalid */}
        {isPaymentInvalid && (
          <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm border border-red-100">
            <p className="font-bold text-xs mb-1">選択中の決済方法が無効です</p>
            <p className="text-xs opacity-90">
              主催者により決済設定が変更された可能性があります。「登録情報の変更」から再度選択してください。
            </p>
          </div>
        )}

        <div className="space-y-3">
          {/* Payment Button */}
          {!isPaymentInvalid && (
            <button
              onClick={onPay}
              disabled={isProcessingPayment || !isEligible}
              className="w-full bg-gradient-to-r from-gray-900 to-gray-800 text-white font-bold py-3.5 px-6 rounded-lg shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isProcessingPayment ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  決済準備中...
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  オンライン決済へ進む
                </>
              )}
            </button>
          )}

          {/* Change Payment Method (Secondary Action) */}
          <button
            onClick={onOpenModal}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            決済方法を変更する
          </button>
        </div>

        {!isPaymentInvalid && isEligible && (
          <p className="text-xs text-gray-400 text-center">Stripeの安全な決済ページへ移動します</p>
        )}
      </div>
    );
  }

  // Case 2: Undecided (Need to choose status)
  if (scenario === GuestScenario.MAYBE) {
    return (
      <div className="bg-white rounded-xl p-5 shadow-sm border border-blue-100">
        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
          <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs mr-2">ACTION</span>
          出欠が未回答です
        </h3>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-500 mb-1">参加状況と支払い方法の登録をお願いします。</p>
          <button
            onClick={onOpenModal}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <CalendarCheck className="w-5 h-5" />
            <span>出欠を回答する</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
};
