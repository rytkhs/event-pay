/**
 * Stripe 入金設定ステータス表示コンポーネント
 */

"use client";

import { useState } from "react";

import Link from "next/link";

import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  CreditCard,
  ArrowUpDown,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  BookOpen,
} from "lucide-react";

import { STRIPE_ACCOUNT_STATUS_LABELS } from "@core/types/enums";

// Actions are now injected via props to avoid circular dependency
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ReviewStatus = "pending_review" | "requirements_due" | "none";

interface AccountStatusData {
  hasAccount: boolean;
  accountId?: string;
  status: "unverified" | "onboarding" | "verified" | "restricted" | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  reviewStatus?: ReviewStatus;
  requirements?: {
    currently_due: string[];
    eventually_due: string[];
    past_due: string[];
    pending_verification: string[];
  };
  capabilities?: {
    card_payments?: "active" | "inactive" | "pending";
    transfers?: "active" | "inactive" | "pending";
  };
  expressDashboardAvailable?: boolean;
}

interface AccountStatusProps {
  refreshUrl: string;
  status: AccountStatusData;
  expressDashboardAction?: (formData: FormData) => Promise<void>;
}

export function AccountStatus({ refreshUrl, status, expressDashboardAction }: AccountStatusProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const accountData = status;
  const requirements = accountData.requirements ?? {
    currently_due: [],
    eventually_due: [],
    past_due: [],
    pending_verification: [],
  };
  const hasDueRequirements = Boolean(
    (requirements.currently_due?.length ?? 0) > 0 || (requirements.past_due?.length ?? 0) > 0
  );
  const reviewStatus: ReviewStatus =
    accountData.reviewStatus ?? (hasDueRequirements ? "requirements_due" : "none");
  const isReviewPending = reviewStatus === "pending_review";
  const isRequirementsDue = reviewStatus === "requirements_due";
  const shouldShowAction =
    accountData.status !== "verified" || isRequirementsDue || !accountData.payoutsEnabled;
  const handleRefresh = async () => {
    setIsRefreshing(true);
    // サーバーコンポーネントを再評価するにはページをリロード（または router.refresh()）
    window.location.reload();
  };

  const getStatusIcon = (status: string | null, currentReviewStatus: ReviewStatus) => {
    switch (status) {
      case "verified":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "onboarding":
        if (currentReviewStatus === "pending_review") {
          return <Clock className="h-4 w-4 text-blue-500" />;
        }
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "restricted":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "unverified":
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: string | null, currentReviewStatus: ReviewStatus) => {
    if (!status) return "未設定";
    if (status === "onboarding") {
      if (currentReviewStatus === "pending_review") {
        return "審査中";
      }
      if (currentReviewStatus === "requirements_due") {
        return "設定中";
      }
    }
    return (
      STRIPE_ACCOUNT_STATUS_LABELS[status as keyof typeof STRIPE_ACCOUNT_STATUS_LABELS] || "未設定"
    );
  };

  const getStatusVariant = (
    status: string | null,
    currentReviewStatus: ReviewStatus
  ): BadgeProps["variant"] => {
    switch (status) {
      case "verified":
        return "default";
      case "onboarding":
        if (currentReviewStatus === "pending_review") {
          return "info";
        }
        return "secondary";
      case "restricted":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (!accountData?.hasAccount) {
    return null; // OnboardingFormが表示される
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Stripe 入金設定
            </CardTitle>
            <CardDescription>
              売上の入金設定の状況です。未完了の項目がある場合は「Stripeで設定を続行」から再設定してください。
            </CardDescription>
            <div className="pt-2">
              <Link
                href="/dashboard/connect/guide"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-md text-blue-600 hover:text-blue-800 hover:underline"
              >
                <BookOpen className="h-4 w-4" />
                設定回答の参考ページを見る
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={isRefreshing}>
            {isRefreshing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ステータス概要 */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            {getStatusIcon(accountData.status, reviewStatus)}
            <div>
              <div className="font-semibold">アカウントステータス</div>
            </div>
          </div>
          <Badge variant={getStatusVariant(accountData.status, reviewStatus)}>
            {getStatusText(accountData.status, reviewStatus)}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-1">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4" />
              <span className="text-sm font-medium">送金</span>
            </div>
            <Badge variant={accountData.payoutsEnabled ? "default" : "outline"}>
              {accountData.payoutsEnabled ? "有効" : "無効"}
            </Badge>
          </div>
        </div>

        {/* 要求事項がある場合の表示 */}
        {isRequirementsDue && (
          <Alert variant={accountData.requirements?.past_due?.length ? "destructive" : "warning"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>アカウント情報の更新が必要です。</strong>{" "}
              Stripeの案内に従って、本人確認書類や入金口座などの不足情報を入力してください。
            </AlertDescription>
          </Alert>
        )}

        {isReviewPending && (
          <Alert variant="info">
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <strong>Stripeが提出情報を審査中です。</strong> 審査には数日かかる場合があります。
              審査が完了すると自動で入金設定が有効になります。
            </AlertDescription>
          </Alert>
        )}

        {/* アクションボタン */}
        {shouldShowAction && (
          <div className="flex gap-2">
            {isReviewPending && accountData.expressDashboardAvailable && expressDashboardAction ? (
              <form action={expressDashboardAction} className="flex-1">
                <Button type="submit" className="w-full">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Stripeダッシュボードで状況を確認
                </Button>
              </form>
            ) : (
              <a href={refreshUrl} className="flex-1">
                <Button type="button" className="w-full">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {accountData.status === "unverified"
                    ? "Stripeで設定を始める"
                    : "Stripeで設定を続行"}
                </Button>
              </a>
            )}
          </div>
        )}

        {accountData.status === "verified" &&
          accountData.payoutsEnabled &&
          accountData.expressDashboardAvailable &&
          expressDashboardAction && (
            <form action={expressDashboardAction} className="flex">
              <Button type="submit" variant="outline" className="w-full">
                <ShieldCheck className="h-4 w-4 mr-2" />
                Stripeで売上・入金を確認
              </Button>
            </form>
          )}

        {/* 成功メッセージ */}
        {accountData.status === "verified" && accountData.payoutsEnabled && (
          <Alert variant="success">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>設定完了！</strong> Stripeでの入金設定が完了しました。
              オンライン決済が有効化されました。
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
