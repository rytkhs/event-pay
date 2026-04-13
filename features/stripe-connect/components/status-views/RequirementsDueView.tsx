/**
 * RequirementsDueView - 情報更新が必要な状態のビュー
 * requirements_due状態の表示
 */

"use client";

import Link from "next/link";

import { AlertCircle, ExternalLink } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import type { AccountStatusData } from "../../types/status-classification";

interface RequirementsDueViewProps {
  status: AccountStatusData;
  refreshUrl: string;
}

export function RequirementsDueView({ status, refreshUrl }: RequirementsDueViewProps) {
  const requirements = status.requirements ?? {
    currently_due: [],
    eventually_due: [],
    past_due: [],
    pending_verification: [],
  };

  const hasPastDue = (requirements.past_due?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <Alert variant={hasPastDue ? "destructive" : "warning"}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>アカウント情報の更新が必要です。</strong>{" "}
          Stripeの案内に従って、本人確認書類や入金口座などの不足情報を入力してください。
        </AlertDescription>
      </Alert>

      <Button asChild className="w-full">
        <Link href={refreshUrl} prefetch={false}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Stripeで設定を続行
        </Link>
      </Button>
    </div>
  );
}
