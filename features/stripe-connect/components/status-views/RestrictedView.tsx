/**
 * RestrictedView - アカウント制限状態のビュー
 * restricted状態の表示
 */

"use client";

import { XCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

export function RestrictedView() {
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
    </div>
  );
}
