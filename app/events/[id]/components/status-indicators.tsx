"use client";

import { CreditCard, Banknote, Clock, CheckCircle } from "lucide-react";

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
  const getStatusConfig = (status: string) => {
    switch (status) {
      case "succeeded":
      case "received":
        return {
          icon: CheckCircle,
          label: "決済済み",
          bgColor: "bg-green-100",
          textColor: "text-green-800",
          iconColor: "text-green-600",
        };
      case "pending":
        return {
          icon: Clock,
          label: "決済待ち",
          bgColor: "bg-yellow-100",
          textColor: "text-yellow-800",
          iconColor: "text-yellow-600",
        };
      case "failed":
        return {
          icon: Clock,
          label: "決済失敗",
          bgColor: "bg-red-100",
          textColor: "text-red-800",
          iconColor: "text-red-600",
        };
      case "waived":
        return {
          icon: CheckCircle,
          label: "免除",
          bgColor: "bg-blue-100",
          textColor: "text-blue-800",
          iconColor: "text-blue-600",
        };
      default:
        return {
          icon: Clock,
          label: "未決済",
          bgColor: "bg-gray-100",
          textColor: "text-gray-800",
          iconColor: "text-gray-600",
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

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
      variant="outline"
      className={`
        flex items-center gap-1 font-medium
        ${config.bgColor} ${config.textColor}
        ${sizeClasses[size]}
      `}
    >
      <Icon className={`${iconSizes[size]} ${config.iconColor}`} />
      <span>{config.label}</span>
      {amount !== null && amount !== undefined && (
        <span className="ml-1 font-bold">¥{amount.toLocaleString()}</span>
      )}
    </Badge>
  );
}
