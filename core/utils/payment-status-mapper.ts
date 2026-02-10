/**
 * 決済ステータス マッピング ユーティリティ
 *
 * バックエンドの詳細な PaymentStatus を UI 表示用のシンプルな形式にマッピング
 */

import type { PaymentStatus } from "@core/types/statuses";

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

/**
 * Payment IDを持つオブジェクトの型ガード
 */
export function hasPaymentId(item: unknown): item is { payment_id: string } {
  if (typeof item !== "object" || item === null) return false;

  const payment_id = (item as { payment_id?: unknown }).payment_id;
  return typeof payment_id === "string" && payment_id.length > 0;
}
