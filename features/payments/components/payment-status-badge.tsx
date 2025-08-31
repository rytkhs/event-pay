import { Badge } from "@/components/ui/badge";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/types/enums";

/**
 * 決済ステータス表示プロパティの定義
 */
const PAYMENT_STATUS_PROPS: Record<PaymentStatus, { color: string; label: string }> = {
  pending: {
    color: "bg-yellow-100 text-yellow-800",
    label: PAYMENT_STATUS_LABELS.pending,
  },
  paid: {
    color: "bg-green-100 text-green-800",
    label: PAYMENT_STATUS_LABELS.paid,
  },
  failed: {
    color: "bg-red-100 text-red-800",
    label: PAYMENT_STATUS_LABELS.failed,
  },
  received: {
    color: "bg-green-100 text-green-800",
    label: PAYMENT_STATUS_LABELS.received,
  },
  completed: {
    color: "bg-green-100 text-green-800",
    label: PAYMENT_STATUS_LABELS.completed,
  },
  refunded: {
    color: "bg-blue-100 text-blue-800",
    label: PAYMENT_STATUS_LABELS.refunded,
  },
  waived: {
    color: "bg-gray-100 text-gray-800",
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
      <Badge variant="outline" className={`bg-gray-100 text-gray-600 ${className}`}>
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
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 ${className}`}
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
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 ${className}`}
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
