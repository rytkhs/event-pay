"use client";

import React from "react";

import { Ticket, CreditCard, Clock, CheckCircle, AlertCircle } from "lucide-react";

import { type GuestAttendanceData } from "@core/utils/guest-token";

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
        return <CheckCircle className="h-6 w-6 text-green-600" />;
      case "not_attending":
        return <AlertCircle className="h-6 w-6 text-red-600" />;
      default:
        return <Clock className="h-6 w-6 text-yellow-600" />;
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
    const status = attendance.payment?.status;
    switch (status) {
      case "paid":
      case "completed":
      case "received":
      case "waived":
        return <CheckCircle className="h-6 w-6 text-green-600" />;
      case "pending":
        return <Clock className="h-6 w-6 text-orange-600" />;
      default:
        return <AlertCircle className="h-6 w-6 text-gray-400" />;
    }
  };

  const paymentText = () => {
    const status = attendance.payment?.status;
    if (!attendance.event.fee || attendance.event.fee <= 0) return "決済不要";
    switch (status) {
      case "paid":
      case "completed":
      case "received":
      case "waived":
        return "決済完了";
      case "pending":
        return "未決済";
      default:
        return "未決済";
    }
  };

  const shouldShowPayment =
    attendance.status === "attending" &&
    attendance.event.fee > 0 &&
    attendance.payment?.status !== "paid" &&
    attendance.payment?.status !== "completed" &&
    attendance.payment?.status !== "received" &&
    attendance.payment?.status !== "waived";

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">現在の状況</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-2">
            <Ticket className="h-5 w-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">参加状況</span>
          </div>
          <div className="flex items-center space-x-2">
            {participationIcon()}
            <span className="text-lg font-semibold text-gray-900">{participationText()}</span>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-2">
            <CreditCard className="h-5 w-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">決済状況</span>
          </div>
          <div className="flex items-center space-x-2">
            {paymentIcon()}
            <div className="flex flex-col">
              <span className="text-lg font-semibold text-gray-900">{paymentText()}</span>
              {attendance.event.fee > 0 && (
                <span className="text-sm text-gray-500">
                  ¥{(attendance.payment?.amount ?? attendance.event.fee).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">次に行うこと:</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          {shouldShowPayment && (
            <Button onClick={onPaymentClick || scrollToTarget} disabled={isProcessingPayment}>
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
          <Button variant="secondary" onClick={scrollToTarget}>
            <Ticket className="h-4 w-4 mr-2" /> 参加状況を変更
          </Button>
        </div>
      </div>
    </Card>
  );
}
