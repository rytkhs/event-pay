/**
 * PendingReviewView - 審査待ち状態のビュー
 * Stripeによる情報確認中の表示
 */

"use client";

import { Clock, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface PendingReviewViewProps {
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  expressDashboardAvailable?: boolean;
}

export function PendingReviewView({
  expressDashboardAction,
  expressDashboardAvailable,
}: PendingReviewViewProps) {
  return (
    <div className="space-y-4">
      <Alert className="bg-blue-50 border-blue-200">
        <Clock className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          <strong>Stripeが審査中です。</strong>
          <br />
          提出いただいた情報をStripeが確認しています。審査完了までしばらくお待ちください。通常1〜2営業日で完了します。
        </AlertDescription>
      </Alert>

      {expressDashboardAvailable && expressDashboardAction && (
        <form action={expressDashboardAction}>
          <Button type="submit" variant="outline" className="w-full">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Stripeで審査状況を確認
          </Button>
        </form>
      )}
    </div>
  );
}
