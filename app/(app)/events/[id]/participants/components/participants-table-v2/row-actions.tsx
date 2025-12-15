"use client";

import { Check, RotateCcw, Shield } from "lucide-react";

import { cn } from "@/components/ui/_lib/cn";
import { Button } from "@/components/ui/button";

interface RowActionsProps {
  paymentId: string;
  paymentStatus: string | null;
  paymentMethod: string | null;
  attendanceStatus: string;
  isUpdating: boolean;
  onReceive: (paymentId: string) => void;
  onWaive: (paymentId: string) => void;
  onCancel: (paymentId: string) => void;
  className?: string;
}

export function RowActions({
  paymentId,
  paymentStatus,
  paymentMethod,
  attendanceStatus,
  isUpdating,
  onReceive,
  onWaive,
  onCancel,
  className,
}: RowActionsProps) {
  const isCanceledPayment = paymentStatus === "canceled";
  const isCashPayment = paymentMethod === "cash" && paymentId && !isCanceledPayment;

  // 操作可能かどうか（参加予定 + 現金 + 未払い）
  const isOperatable =
    attendanceStatus === "attending" &&
    isCashPayment &&
    (paymentStatus === "pending" || paymentStatus === "failed");

  // 取り消し可能かどうか（参加予定 + 現金 + 支払済み/免除）
  const isCancelable =
    attendanceStatus === "attending" &&
    isCashPayment &&
    (paymentStatus === "received" || paymentStatus === "waived");

  if (!isOperatable && !isCancelable) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1",
        "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
        className
      )}
    >
      {isOperatable && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onReceive(paymentId)}
            disabled={isUpdating}
            className="h-8 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
            title="受領"
          >
            <Check className="h-4 w-4" />
            <span className="sr-only">受領</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onWaive(paymentId)}
            disabled={isUpdating}
            className="h-8 px-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
            title="免除"
          >
            <Shield className="h-4 w-4" />
            <span className="sr-only">免除</span>
          </Button>
        </>
      )}
      {isCancelable && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onCancel(paymentId)}
          disabled={isUpdating}
          className="h-8 px-2 text-gray-600 hover:text-gray-700 hover:bg-gray-50"
          title="取り消し"
        >
          <RotateCcw className="h-4 w-4" />
          <span className="sr-only">取り消し</span>
        </Button>
      )}
    </div>
  );
}
