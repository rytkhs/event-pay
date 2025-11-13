/**
 * RequirementsDueView - 情報更新が必要な状態のビュー
 * requirements_due状態の表示
 */

"use client";

import { AlertCircle, ExternalLink, Clock } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import type { AccountStatusData } from "../../types/status-classification";

interface RequirementsDueViewProps {
  status: AccountStatusData;
  refreshUrl: string;
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  expressDashboardAvailable?: boolean;
}

export function RequirementsDueView({
  status,
  refreshUrl,
  expressDashboardAction,
  expressDashboardAvailable,
}: RequirementsDueViewProps) {
  const requirements = status.requirements ?? {
    currently_due: [],
    eventually_due: [],
    past_due: [],
    pending_verification: [],
  };

  const hasPastDue = (requirements.past_due?.length ?? 0) > 0;
  const hasPendingVerification = (requirements.pending_verification?.length ?? 0) > 0;
  const hasPendingCapabilities = Boolean(
    status.capabilities &&
      (status.capabilities.card_payments === "pending" ||
        status.capabilities.transfers === "pending")
  );

  const isReviewPending =
    status.dbStatus === "onboarding" && (hasPendingVerification || hasPendingCapabilities);

  return (
    <div className="space-y-4">
      {isReviewPending ? (
        <Alert variant="info">
          <Clock className="h-4 w-4" />
          <AlertDescription>
            <strong>Stripeが提出情報を審査中です。</strong> 審査には数日かかる場合があります。
            審査が完了すると自動で入金設定が有効になります。
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant={hasPastDue ? "destructive" : "warning"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>アカウント情報の更新が必要です。</strong>{" "}
            Stripeの案内に従って、本人確認書類や入金口座などの不足情報を入力してください。
          </AlertDescription>
        </Alert>
      )}

      {isReviewPending && expressDashboardAvailable && expressDashboardAction ? (
        <form action={expressDashboardAction}>
          <Button type="submit" className="w-full">
            <ExternalLink className="h-4 w-4 mr-2" />
            Stripeダッシュボードで状況を確認
          </Button>
        </form>
      ) : (
        <a href={refreshUrl} className="block">
          <Button type="button" className="w-full">
            <ExternalLink className="h-4 w-4 mr-2" />
            Stripeで設定を続行
          </Button>
        </a>
      )}
    </div>
  );
}
