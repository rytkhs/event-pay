/**
 * Stripe Connect オンボーディングフォームコンポーネント
 */

"use client";

import { useState } from "react";

import { Loader2, CreditCard, Shield, Zap } from "lucide-react";

import { logger } from "@core/logging/app-logger";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface OnboardingFormProps {
  refreshUrl: string;
  returnUrl: string;
  onCreateAccount: (formData: FormData) => Promise<void>;
}

export function OnboardingForm({ refreshUrl, returnUrl, onCreateAccount }: OnboardingFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    setIsLoading(true);
    try {
      // Server Actionを呼び出し（リダイレクトが発生する）
      await onCreateAccount(formData);
    } catch (error) {
      logger.error("Onboarding start error", {
        tag: "connectOnboardingStartError",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Stripe Connect アカウント設定
        </CardTitle>
        <CardDescription>
          イベントの売上を受け取るために、Stripe Connectアカウントの設定が必要です。
          <br />
          初回設定は約3〜5分で完了します。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 機能説明 */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col items-center text-center p-4 border rounded-lg">
            <Shield className="h-8 w-8 text-blue-500 mb-2" />
            <h3 className="font-semibold mb-1">安全な決済</h3>
            <p className="text-sm text-muted-foreground">Stripeの安全な決済システムを利用</p>
          </div>
          <div className="flex flex-col items-center text-center p-4 border rounded-lg">
            <Zap className="h-8 w-8 text-green-500 mb-2" />
            <h3 className="font-semibold mb-1">自動送金</h3>
            <p className="text-sm text-muted-foreground">イベント終了後に自動で売上を送金</p>
          </div>
          <div className="flex flex-col items-center text-center p-4 border rounded-lg">
            <CreditCard className="h-8 w-8 text-purple-500 mb-2" />
            <h3 className="font-semibold mb-1">簡単管理</h3>
            <p className="text-sm text-muted-foreground">収支状況をダッシュボードで確認</p>
          </div>
        </div>

        {/* 注意事項 */}
        <Alert>
          <AlertDescription>
            <strong>設定について：</strong>
            <ul className="mt-2 space-y-1 text-sm">
              <li>• 本人確認書類（運転免許証など）と銀行口座情報をご用意ください</li>
              <li>• 所要時間の目安は3〜5分です。途中で中断しても、このページから再開できます</li>
              <li>• 一度設定すると一部の情報変更に制限があります</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* オンボーディング開始フォーム */}
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="refreshUrl" value={refreshUrl} />
          <input type="hidden" name="returnUrl" value={returnUrl} />

          <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                設定を開始しています...
              </>
            ) : (
              "Stripe Connect アカウントを設定する"
            )}
          </Button>
        </form>

        {/* 補足説明 */}
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>プライバシーについて：</strong>
            お客様の個人情報は、Stripeの厳格なセキュリティ基準に従って保護されます。
          </p>
          <p>
            <strong>手数料について：</strong>
            Stripe決済手数料（3.6%）が売上から差し引かれます。プラットフォーム手数料は現在無料です。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
