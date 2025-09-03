import type { Database } from "@/types/database";

export type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];

// アプリ側の簡易ランク（DBの status_rank と一致させる）
export function statusRank(status: PaymentStatus): number {
  switch (status) {
    case "pending":
      return 10;
    case "failed":
      return 15;
    case "paid":
      return 20;
    case "received":
      return 25;
    case "waived":
      return 28;
    case "completed":
      return 30;
    case "refunded":
      return 40;
    default:
      return 0;
  }
}

export function canPromoteStatus(current: PaymentStatus, target: PaymentStatus): boolean {
  return statusRank(target) > statusRank(current);
}
