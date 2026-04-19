import type { DetailedAccountStatus } from "../types";

export const NO_ACCOUNT_STATUS: DetailedAccountStatus = {
  statusType: "no_account",
  title: "オンライン集金を有効にする",
  description: "参加費・会費をオンラインで受け取れます。約3分で設定完了。",
  actionText: "設定を始める",
  actionUrl: "/settings/payments",
  severity: "info",
};

export const UNVERIFIED_STATUS: DetailedAccountStatus = {
  statusType: "unverified",
  title: "オンライン集金の設定が未完了です",
  description: "設定を再開してオンライン集金を有効にしてください。",
  actionText: "設定を再開する",
  actionUrl: "/settings/payments",
  severity: "warning",
};

export const PENDING_REVIEW_STATUS: DetailedAccountStatus = {
  statusType: "pending_review",
  title: "Stripeが情報を確認中です",
  description: "通常1〜2営業日で完了します。確認が終わると自動的に有効になります。",
  actionText: "提出内容を確認",
  actionUrl: "/settings/payments",
  severity: "info",
};

export const PAYOUTS_DISABLED_STATUS: DetailedAccountStatus = {
  statusType: "ready",
  title: "オンライン集金は利用できます",
  description:
    "集金は可能ですが、出金設定または入金状況の確認が必要です。Stripeで状況を確認してください。",
  actionText: "出金設定を確認",
  actionUrl: "/settings/payments",
  severity: "warning",
};

export const RESTRICTED_STATUS: DetailedAccountStatus = {
  statusType: "restricted",
  title: "アカウントが制限されています",
  description:
    "Stripeアカウントに制限がかかっています。表示される案内に従って情報を更新してください。",
  actionText: "Stripeで状況を確認",
  actionUrl: "/settings/payments",
  severity: "error",
};

export const DASHBOARD_SETUP_INCOMPLETE_STATUS: DetailedAccountStatus = {
  statusType: "requirements_due",
  title: "オンライン集金を設定中です",
  description:
    "設定が未完了、またはStripeによる審査を待っている状態です。設定画面から状況を確認できます。",
  actionText: "状況を確認",
  actionUrl: "/settings/payments",
  severity: "warning",
};

export function buildRequirementsDueStatus(input: {
  hasPastDue: boolean;
  hasCurrentlyDue: boolean;
  hasBlockingDisabledReason?: boolean;
}): DetailedAccountStatus {
  return {
    statusType: "requirements_due",
    title: input.hasPastDue
      ? "至急：アカウント情報の更新が必要です"
      : input.hasCurrentlyDue || input.hasBlockingDisabledReason
        ? "アカウント情報の追加が必要です"
        : "Stripeの案内を確認してください",
    description: input.hasPastDue
      ? "期限超過の書類があります。早急に対応しないと決済機能が停止される可能性があります。"
      : input.hasCurrentlyDue
        ? "決済を継続するために追加の情報提供が必要です。"
        : input.hasBlockingDisabledReason
          ? "Stripeで対応が必要な確認事項があります。案内に従って状況を確認してください。"
          : "将来的に必要な情報があります。早めの対応をお勧めします。",
    actionText: "情報を更新する",
    actionUrl: "/settings/payments",
    severity: input.hasPastDue
      ? "error"
      : input.hasCurrentlyDue || input.hasBlockingDisabledReason
        ? "warning"
        : "info",
  };
}
