/**
 * ReadyView - 設定完了状態のビュー
 * ready状態の表示
 */

"use client";

import { CheckCircle, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import type { AccountStatusData } from "../../types/status-classification";

interface ReadyViewProps {
  status: AccountStatusData;
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  expressDashboardAvailable?: boolean;
}

export function ReadyView({ expressDashboardAction, expressDashboardAvailable }: ReadyViewProps) {
  return (
    <div className="space-y-4">
      <Alert variant="success">
        <CheckCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>設定完了！</strong> Stripeでの入金設定が完了しました。
          オンライン決済が有効化されました。
        </AlertDescription>
      </Alert>

      {expressDashboardAvailable && expressDashboardAction && (
        <form action={expressDashboardAction}>
          <Button type="submit" variant="outline" className="w-full">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Stripeで売上・入金を確認
          </Button>
        </form>
      )}
    </div>
  );
}
