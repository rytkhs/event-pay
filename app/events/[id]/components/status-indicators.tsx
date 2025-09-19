"use client";

import { CreditCard, Banknote, Clock, CheckCircle } from "lucide-react";

import {
  toSimplePaymentStatus,
  SIMPLE_PAYMENT_STATUS_LABELS,
  getSimplePaymentStatusStyle,
} from "@core/utils/payment-status-mapper";

import { Badge } from "@/components/ui/badge";

// 出欠状況の統一ピル表示
interface AttendanceStatusPillProps {
  status: string;
  size?: "sm" | "md" | "lg";
}

export function AttendanceStatusPill({ status, size = "md" }: AttendanceStatusPillProps) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case "attending":
        return {
          emoji: "◯",
          label: "参加",
          bgColor: "bg-green-100",
          textColor: "text-green-800",
          borderColor: "border-green-300",
        };
      case "not_attending":
        return {
          emoji: "✕",
          label: "不参加",
          bgColor: "bg-red-100",
          textColor: "text-red-800",
          borderColor: "border-red-300",
        };
      case "maybe":
        return {
          emoji: "△",
          label: "未定",
          bgColor: "bg-yellow-100",
          textColor: "text-yellow-800",
          borderColor: "border-yellow-300",
        };
      default:
        return {
          emoji: "⚪",
          label: "未回答",
          bgColor: "bg-gray-100",
          textColor: "text-gray-800",
          borderColor: "border-gray-300",
        };
    }
  };

  const config = getStatusConfig(status);
  const sizeClasses = {
    sm: "text-xs px-2 py-1",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-2",
  };

  return (
    <Badge
      variant="outline"
      className={`
        flex items-center gap-1 font-medium border
        ${config.bgColor} ${config.textColor} ${config.borderColor}
        ${sizeClasses[size]}
      `}
    >
      <span className="text-base leading-none">{config.emoji}</span>
      <span>{config.label}</span>
    </Badge>
  );
}

// 決済方法の統一アイコン表示
interface PaymentMethodIconProps {
  method: string | null;
  size?: "sm" | "md" | "lg";
}

export function PaymentMethodIcon({ method, size = "md" }: PaymentMethodIconProps) {
  if (!method) return null;

  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  switch (method) {
    case "stripe":
      return (
        <div className="flex items-center gap-1">
          <CreditCard className={`${sizeClasses[size]} text-purple-600`} />
          <span className="text-xs text-purple-700 font-medium">カード</span>
        </div>
      );
    case "cash":
      return (
        <div className="flex items-center gap-1">
          <Banknote className={`${sizeClasses[size]} text-orange-600`} />
          <span className="text-xs text-orange-700 font-medium">現金</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-1">
          <Clock className={`${sizeClasses[size]} text-gray-400`} />
          <span className="text-xs text-gray-500 font-medium">未設定</span>
        </div>
      );
  }
}

// 決済ステータスの統一表示
interface PaymentStatusIndicatorProps {
  status: string;
  amount?: number | null;
  size?: "sm" | "md" | "lg";
}

export function PaymentStatusIndicator({
  status,
  amount,
  size = "md",
}: PaymentStatusIndicatorProps) {
  // 新しいマッピングユーティリティを使用
  const simpleStatus = toSimplePaymentStatus(status as any);
  const statusStyle = getSimplePaymentStatusStyle(simpleStatus);
  const label = SIMPLE_PAYMENT_STATUS_LABELS[simpleStatus];

  const getIconComponent = () => {
    switch (simpleStatus) {
      case "paid":
      case "waived":
        return CheckCircle;
      case "unpaid":
      case "refunded":
      default:
        return Clock;
    }
  };

  const Icon = getIconComponent();

  const sizeClasses = {
    sm: "text-xs px-2 py-1",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-2",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <Badge
      variant={statusStyle.variant}
      className={`
        flex items-center gap-1 font-medium
        ${statusStyle.className}
        ${sizeClasses[size]}
      `}
    >
      <Icon className={`${iconSizes[size]} ${statusStyle.iconColor}`} />
      <span>{label}</span>
      {amount !== null && amount !== undefined && (
        <span className="ml-1 font-bold">¥{amount.toLocaleString()}</span>
      )}
    </Badge>
  );
}
