import { Badge } from "@/components/ui/badge";

import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "./_lib/types";

/**
 * 決済ステータス表示プロパティの定義
 */
const PAYMENT_STATUS_PROPS: Record<PaymentStatus, { color: string; label: string }> = {
  pending: {
    color: "bg-warning/10 text-warning border-warning/20",
    label: PAYMENT_STATUS_LABELS.pending,
  },
  paid: {
    color: "bg-success/10 text-success border-success/20",
    label: PAYMENT_STATUS_LABELS.paid,
  },
  failed: {
    color: "bg-destructive/10 text-destructive border-destructive/20",
    label: PAYMENT_STATUS_LABELS.failed,
  },
  received: {
    color: "bg-success/10 text-success border-success/20",
    label: PAYMENT_STATUS_LABELS.received,
  },
  completed: {
    color: "bg-success/10 text-success border-success/20",
    label: PAYMENT_STATUS_LABELS.completed,
  },
  refunded: {
    color: "bg-info/10 text-info border-info/20",
    label: PAYMENT_STATUS_LABELS.refunded,
  },
  waived: {
    color: "bg-muted/50 text-muted-foreground border-muted",
    label: PAYMENT_STATUS_LABELS.waived,
  },
};

interface PaymentStatusBadgeProps {
  status: PaymentStatus | null;
  className?: string;
}

/**
 * 決済ステータスバッジコンポーネント
 *
 * 全画面で統一された決済ステータス表示を提供します。
 * ステータス追加・変更時はPAYMENT_STATUS_PROPSの定義のみ修正すれば
 * 全ての利用箇所に自動反映されます。
 */
export function PaymentStatusBadge({ status, className = "" }: PaymentStatusBadgeProps) {
  if (!status) {
    return (
      <Badge
        variant="outline"
        className={`bg-muted/50 text-muted-foreground border-muted ${className}`}
      >
        未登録
      </Badge>
    );
  }

  const props = PAYMENT_STATUS_PROPS[status];
  if (!props) {
    // フォールバック: 未定義ステータスの場合
    return (
      <Badge variant="outline" className={className}>
        {status}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={`${props.color} ${className}`}>
      {props.label}
    </Badge>
  );
}

/**
 * インライン用の決済ステータススパンコンポーネント
 *
 * Badgeではなくspanタグで表示したい場合に使用
 */
export function PaymentStatusSpan({ status, className = "" }: PaymentStatusBadgeProps) {
  if (!status) {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground ${className}`}
      >
        未登録
      </span>
    );
  }

  const props = PAYMENT_STATUS_PROPS[status];
  if (!props) {
    // フォールバック: 未定義ステータスの場合
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground ${className}`}
      >
        {status}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${props.color} ${className}`}
    >
      {props.label}
    </span>
  );
}
