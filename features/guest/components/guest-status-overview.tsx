"use client";

import React from "react";

import { Ticket, CreditCard, Clock, CheckCircle, AlertCircle } from "lucide-react";

import { type GuestAttendanceData } from "@core/utils/guest-token";
import { toSimplePaymentStatus, isPaymentCompleted } from "@core/utils/payment-status-mapper";
import { canCreateStripeSession } from "@core/validation/payment-eligibility";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface GuestStatusOverviewProps {
  attendance: GuestAttendanceData;
  scrollTargetId?: string;
  onPaymentClick?: () => Promise<void>;
  isProcessingPayment?: boolean;
}

export function GuestStatusOverview({
  attendance,
  scrollTargetId = "guest-form-section",
  onPaymentClick,
  isProcessingPayment = false,
}: GuestStatusOverviewProps) {
  const scrollToTarget = () => {
    const el = document.getElementById(scrollTargetId);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };
  const participationIcon = () => {
    switch (attendance.status) {
      case "attending":
        return <CheckCircle className="h-6 w-6 text-success" />;
      case "not_attending":
        return <AlertCircle className="h-6 w-6 text-destructive" />;
      default:
        return <Clock className="h-6 w-6 text-warning" />;
    }
  };

  const participationText = () => {
    switch (attendance.status) {
      case "attending":
        return "参加予定";
      case "not_attending":
        return "不参加";
      default:
        return "未定";
    }
  };

  const paymentIcon = () => {
    const simpleStatus = toSimplePaymentStatus(attendance.payment?.status as any);
    switch (simpleStatus) {
      case "paid":
      case "waived":
        return <CheckCircle className="h-6 w-6 text-success" />;
      case "unpaid":
        return <Clock className="h-6 w-6 text-warning" />;
      case "refunded":
        return <AlertCircle className="h-6 w-6 text-info" />;
      default:
        return <AlertCircle className="h-6 w-6 text-muted-foreground" />;
    }
  };

  const paymentText = () => {
    if (!attendance.event.fee || attendance.event.fee <= 0) return "決済不要";
    const simpleStatus = toSimplePaymentStatus(attendance.payment?.status as any);
    switch (simpleStatus) {
      case "paid":
        return "決済完了";
      case "waived":
        return "免除";
      case "refunded":
        return "返金済み";
      case "unpaid":
      default:
        return "未決済";
    }
  };

  const shouldShowPayment =
    attendance.status === "attending" &&
    attendance.event.fee > 0 &&
    !isPaymentCompleted(attendance.payment?.status as any);

  // 決済セッション作成の可否（期限/猶予/最終上限を考慮）
  const eligibility = canCreateStripeSession(attendance as any, attendance.event as any);
  const paymentDisabled = isProcessingPayment || !eligibility.isEligible;

  return (
    <Card className="p-4 sm:p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-card-foreground mb-4">現在の状況</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-muted/50 rounded-lg p-4 transition-colors hover:bg-muted/70">
          <div className="flex items-center space-x-3 mb-2">
            <Ticket className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">参加状況</span>
          </div>
          <div className="flex items-center space-x-2">
            {participationIcon()}
            <span className="text-lg font-semibold text-card-foreground">
              {participationText()}
            </span>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 transition-colors hover:bg-muted/70">
          <div className="flex items-center space-x-3 mb-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">決済状況</span>
          </div>
          <div className="flex items-center space-x-2">
            {paymentIcon()}
            <div className="flex flex-col">
              <span className="text-lg font-semibold text-card-foreground">{paymentText()}</span>
              {attendance.event.fee > 0 && (
                <span className="text-sm text-muted-foreground font-mono">
                  ¥{(attendance.payment?.amount ?? attendance.event.fee).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">次に行うこと:</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          {shouldShowPayment && (
            <Button onClick={onPaymentClick || scrollToTarget} disabled={paymentDisabled}>
              {isProcessingPayment ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  決済準備中...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" /> 決済を完了する
                </>
              )}
            </Button>
          )}
          {/* 期限超過などで決済不可の場合の案内 */}
          {shouldShowPayment && !isProcessingPayment && !eligibility.isEligible && (
            <div className="text-sm text-red-600" aria-live="polite">
              決済期限を過ぎているため、現在このイベントでは決済できません。
            </div>
          )}
          <Button variant="secondary" onClick={scrollToTarget}>
            <Ticket className="h-4 w-4 mr-2" /> 参加状況を変更
          </Button>
        </div>
      </div>
    </Card>
  );
}
