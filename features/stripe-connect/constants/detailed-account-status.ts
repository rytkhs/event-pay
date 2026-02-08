import type { DetailedAccountStatus } from "../types";

export const NO_ACCOUNT_STATUS: DetailedAccountStatus = {
  statusType: "no_account",
  title: "決済機能を有効にしましょう",
  description:
    "オンライン決済を有効化するために、Stripeアカウントの設定が必要です。設定は約3〜5分で完了します。",
  actionText: "アカウント設定を開始",
  actionUrl: "/dashboard/connect",
  severity: "info",
};

export const UNVERIFIED_STATUS: DetailedAccountStatus = {
  statusType: "unverified",
  title: "アカウント認証を完了してください",
  description:
    "Stripeアカウントの認証が完了していません。認証を完了することで決済を受け取れるようになります。",
  actionText: "認証を完了する",
  actionUrl: "/dashboard/connect?action=complete",
  severity: "warning",
};

export const PENDING_REVIEW_STATUS: DetailedAccountStatus = {
  statusType: "pending_review",
  title: "Stripeが審査中です",
  description: "提出いただいた情報をStripeが確認しています。審査完了までしばらくお待ちください。",
  actionText: "提出内容を確認",
  actionUrl: "/settings/payments",
  severity: "info",
};

export const RESTRICTED_STATUS: DetailedAccountStatus = {
  statusType: "restricted",
  title: "アカウントが制限されています",
  description:
    "Stripeアカウントに制限がかかっています。表示される案内に従って情報を更新してください。",
  actionText: "Stripeで状況を確認",
  actionUrl: "/dashboard/connect?action=update",
  severity: "error",
};

export function buildRequirementsDueStatus(input: {
  hasPastDue: boolean;
  hasCurrentlyDue: boolean;
}): DetailedAccountStatus {
  return {
    statusType: "requirements_due",
    title: input.hasPastDue
      ? "⚠️ 至急：アカウント情報の更新が必要です"
      : "アカウント情報の更新をお願いします",
    description: input.hasPastDue
      ? "期限を過ぎた必要書類があります。決済機能が制限される場合があります。"
      : input.hasCurrentlyDue
        ? "決済を継続するために追加の情報提供が必要です。"
        : "将来的に必要となる情報があります。早めの対応をお勧めします。",
    actionText: "情報を更新する",
    actionUrl: "/dashboard/connect?action=update",
    severity: input.hasPastDue ? "error" : input.hasCurrentlyDue ? "warning" : "info",
  };
}
