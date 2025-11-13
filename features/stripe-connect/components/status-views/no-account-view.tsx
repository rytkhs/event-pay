/**
 * NoAccountView - アカウント未作成時のビュー
 * no_account状態の表示
 */

"use client";

import { ExternalLink, CreditCard } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface NoAccountViewProps {
  refreshUrl: string;
}

export function NoAccountView({ refreshUrl }: NoAccountViewProps) {
  return (
    <div className="space-y-4">
      <Alert variant="info">
        <CreditCard className="h-4 w-4" />
        <AlertDescription>
          <strong>Stripeで設定を始めましょう</strong>
          <br />
          オンライン決済を有効化するために、Stripeアカウントの設定が必要です。設定は約3〜5分で完了します。
        </AlertDescription>
      </Alert>

      <a href={refreshUrl} className="block">
        <Button type="button" className="w-full">
          <ExternalLink className="h-4 w-4 mr-2" />
          Stripeで設定を始める
        </Button>
      </a>
    </div>
  );
}
