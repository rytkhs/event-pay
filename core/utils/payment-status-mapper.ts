/**
 * 決済ステータス マッピング ユーティリティ
 *
 * バックエンドの詳細な PaymentStatus を UI 表示用のシンプルな形式にマッピング
 */

import type { PaymentStatus } from "@core/types/enums";

/**
 * UI 表示用の簡略化された決済ステータス
 */
export type SimplePaymentStatus =
  | "unpaid" // pending / failed - 未決済（支払待ち + 失敗）
  | "paid" // paid / received - 決済完了（方法問わず）
  | "refunded" // refunded - 返金済み
  | "waived" // waived - 免除（無料参加など主催者判断）
  | "canceled"; // canceled - キャンセル済（申込みトランザクションの取り消し）

/**
 * バックエンドの PaymentStatus を UI 用の SimplePaymentStatus にマッピング
 */
export const toSimplePaymentStatus = (
  status: PaymentStatus | null | undefined
): SimplePaymentStatus => {
  if (!status) return "unpaid";

  switch (status) {
    case "pending":
    case "failed":
      return "unpaid";
    case "canceled":
      return "canceled";
    case "refunded":
      return "refunded";
    case "waived":
      return "waived";
    case "paid":
    case "received":
    default:
      return "paid";
  }
};

/**
 * SimplePaymentStatus の日本語ラベル
 */
export const SIMPLE_PAYMENT_STATUS_LABELS: Record<SimplePaymentStatus, string> = {
  unpaid: "未決済",
  paid: "決済済",
  refunded: "返金済",
  waived: "免除",
  canceled: "キャンセル済",
};

/**
 * SimplePaymentStatus に基づく色・スタイル設定
 */
export const getSimplePaymentStatusStyle = (status: SimplePaymentStatus) => {
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
};

/**
 * 決済完了ステータス（支払い完了とみなす）かどうかの判定
 */
export const isPaymentCompleted = (status: PaymentStatus | null | undefined): boolean => {
  const simpleStatus = toSimplePaymentStatus(status);
  return simpleStatus === "paid" || simpleStatus === "waived";
};

/**
 * 未決済ステータス（ハイライト表示対象）かどうかの判定
 * canceled/refunded は会計上の終端であり、未収金ではないため false を返す
 */
export const isPaymentUnpaid = (status: PaymentStatus | null | undefined): boolean => {
  const simpleStatus = toSimplePaymentStatus(status);
  return simpleStatus === "unpaid";
};

/**
 * SimplePaymentStatus から対応する PaymentStatus 配列へのマッピング
 * フィルター処理でDBクエリに使用
 */
export const getPaymentStatusesFromSimple = (simple: SimplePaymentStatus): PaymentStatus[] => {
  switch (simple) {
    case "unpaid":
      return ["pending", "failed"];
    case "paid":
      return ["paid", "received"];
    case "canceled":
      return ["canceled"];
    case "refunded":
      return ["refunded"];
    case "waived":
      return ["waived"];
  }
};
