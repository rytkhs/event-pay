import type { SimplePaymentStatus } from "@core/utils/payment-status-mapper";

export const SIMPLE_PAYMENT_STATUS_LABELS: Record<SimplePaymentStatus, string> = {
  unpaid: "未決済",
  paid: "決済済",
  refunded: "返金済",
  waived: "免除",
  canceled: "キャンセル済",
};

export function getSimplePaymentStatusStyle(status: SimplePaymentStatus) {
  switch (status) {
    case "unpaid":
      return {
        variant: "destructive" as const,
        className: "bg-red-100 text-red-800",
        iconColor: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-400",
      };
    case "paid":
      return {
        variant: "default" as const,
        className: "bg-green-100 text-green-800",
        iconColor: "text-green-600",
        bgColor: "bg-green-50",
        borderColor: "border-green-400",
      };
    case "canceled":
      return {
        variant: "secondary" as const,
        className: "bg-gray-100 text-gray-800",
        iconColor: "text-gray-600",
        bgColor: "bg-gray-50",
        borderColor: "border-gray-400",
      };
    case "refunded":
      return {
        variant: "secondary" as const,
        className: "bg-orange-100 text-orange-800",
        iconColor: "text-orange-600",
        bgColor: "bg-orange-50",
        borderColor: "border-orange-400",
      };
    case "waived":
      return {
        variant: "outline" as const,
        className: "bg-blue-100 text-blue-800",
        iconColor: "text-blue-600",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-400",
      };
  }
}
