/**
 * Stripe 入金設定オンボーディングフォームコンポーネント
 */

"use client";

import { useState } from "react";

import { Loader2, CreditCard, Shield, Zap, Globe } from "lucide-react";

import { logger } from "@core/logging/app-logger";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface OnboardingFormProps {
  refreshUrl: string;
  returnUrl: string;
  onStartOnboarding: () => Promise<void>;
}

export function OnboardingForm({ onStartOnboarding }: OnboardingFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleStartOnboarding = async () => {
    setIsLoading(true);
    try {
      await onStartOnboarding();
    } catch (error) {
      logger.error("Simple onboarding start error", {
        tag: "simpleOnboardingStartError",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Stripe 入金設定
        </CardTitle>
        <CardDescription>
          オンライン決済の売上を受け取るため、Stripeの設定が必要です。
          <br />
          初回設定は約3〜5分で完了し、途中保存もできます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* 簡単な説明 */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col items-center text-center p-4 border rounded-lg">
            <Shield className="h-8 w-8 text-blue-500 mb-2" />
            <h3 className="font-semibold mb-1">安全な決済</h3>
            <p className="text-sm text-muted-foreground">Stripeの安全な決済システム</p>
          </div>
          <div className="flex flex-col items-center text-center p-4 border rounded-lg">
            <Zap className="h-8 w-8 text-green-500 mb-2" />
            <h3 className="font-semibold mb-1">自動送金</h3>
            <p className="text-sm text-muted-foreground">オンライン決済を自動受取</p>
          </div>
          <div className="flex flex-col items-center text-center p-4 border rounded-lg">
            <Globe className="h-8 w-8 text-purple-500 mb-2" />
            <h3 className="font-semibold mb-1">簡単管理</h3>
            <p className="text-sm text-muted-foreground">収支状況をダッシュボードで確認</p>
          </div>
        </div>

        {/* 注意事項 */}
        <Alert>
          <AlertDescription>
            <strong>ご準備いただくもの：</strong>
            <ul className="mt-2 space-y-1 text-sm">
              <li>• 本人確認書類（運転免許証、パスポートなど）</li>
              <li>• 銀行口座情報（Stripeのページで入力します）</li>
              <li>• 所要時間：約3〜5分（途中保存可能）</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* 送信ボタン */}
        <Button
          type="button"
          className="w-full"
          size="lg"
          disabled={isLoading}
          onClick={handleStartOnboarding}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              設定を開始しています...
            </>
          ) : (
            "Stripeで設定を始める"
          )}
        </Button>

        {/* 補足説明 */}
        <div className="text-sm text-muted-foreground space-y-2 border-t pt-6">
          <p>
            <strong>プライバシーについて：</strong>
            お客様の個人情報は、Stripeの厳格なセキュリティ基準に従って保護されます。
          </p>
          <p>
            <strong>手数料について：</strong>
            プラットフォーム手数料（1.3%）とStripe決済手数料（3.6%）がオンライン決済の売上から差し引かれます。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
