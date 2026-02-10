import type { PaymentStatus } from "@core/types/statuses";

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
      return 20;
    case "waived":
      return 25;
    case "canceled":
      return 35;
    case "refunded":
      return 40;
    default:
      return 0;
  }
}

export function canPromoteStatus(current: PaymentStatus, target: PaymentStatus): boolean {
  // 同じステータスへの遷移は許可（冪等性）
  if (current === target) return true;

  const currentRank = statusRank(current);
  const targetRank = statusRank(target);

  // 基本的に降格は禁止
  if (targetRank < currentRank) return false;

  // canceled は未決済系（pending/failed）からのみ遷移可能
  if (target === "canceled") {
    return current === "pending" || current === "failed";
  }

  // canceled からは他のステータスに遷移できない（終端状態）
  if (current === "canceled") return false;

  // refunded は決済完了系（paid/received/waived）からのみ遷移可能
  if (target === "refunded") {
    return current === "paid" || current === "received" || current === "waived";
  }

  // その他は昇格ルールに従う
  return targetRank >= currentRank;
}
