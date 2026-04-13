/**
 * RestrictedView - アカウント制限状態のビュー
 * restricted状態の表示
 */

"use client";

import { ShieldAlert, XCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface RestrictedViewProps {
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  expressDashboardAvailable?: boolean;
}

export function RestrictedView({
  expressDashboardAction,
  expressDashboardAvailable,
}: RestrictedViewProps) {
  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>アカウントが制限されています。</strong>
          <br />
          Stripeによってアカウントが制限されています。詳細については、Stripeサポートにお問い合わせください。
        </AlertDescription>
      </Alert>

      {expressDashboardAvailable && expressDashboardAction && (
        <form action={expressDashboardAction}>
          <Button type="submit" variant="outline" className="w-full">
            <ShieldAlert className="h-4 w-4 mr-2" />
            Stripeで制限内容を確認
          </Button>
        </form>
      )}
    </div>
  );
}
