/**
 * UnverifiedView - 未認証状態のビュー
 * unverified状態の表示
 */

"use client";

import Link from "next/link";

import { AlertCircle, ExternalLink } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface UnverifiedViewProps {
  refreshUrl: string;
}

export function UnverifiedView({ refreshUrl }: UnverifiedViewProps) {
  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>オンボーディングを開始してください</strong>
          <br />
          Stripeアカウントの認証が完了していません。認証を完了することで決済を受け取れるようになります。
        </AlertDescription>
      </Alert>

      <Button asChild className="w-full">
        <Link href={refreshUrl} prefetch={false}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Stripeで設定を始める
        </Link>
      </Button>
    </div>
  );
}
