/**
 * Stripe 入金設定オンボーディングフォームコンポーネント
 */

"use client";

import { useState } from "react";

import Link from "next/link";

import {
  Loader2,
  CreditCard,
  Shield,
  Zap,
  Globe,
  BookOpen,
  ExternalLink,
  FileCheck,
  Building2,
  Clock,
} from "lucide-react";

import { handleClientError } from "@core/utils/error-handler.client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface OnboardingFormProps {
  onStartOnboarding: () => Promise<void>;
}

export function OnboardingForm({ onStartOnboarding }: OnboardingFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleStartOnboarding = async () => {
    setIsLoading(true);
    try {
      await onStartOnboarding();
    } catch (error) {
      handleClientError(error, {
        category: "stripe_connect",
        action: "onboarding_start_failed",
      });
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto shadow-lg">
      <CardHeader className="space-y-4">
        <CardTitle className="flex items-center gap-2 text-xl">
          <div className="p-2 rounded-lg bg-primary/10">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          Stripe 入金設定
        </CardTitle>
        <CardDescription className="text-base leading-relaxed">
          オンライン決済の売上を受け取るため、Stripeの設定が必要です。
          <br />
          初回設定は約3〜5分で完了し、途中保存もできます。
        </CardDescription>
        <div className="pt-2">
          <Link
            href="/settings/payments/guide"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors border border-primary/20"
          >
            <BookOpen className="h-4 w-4" />
            回答に迷ったら：設定回答の参考ページを見る
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* 簡単な説明 */}
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard
            icon={<Shield className="h-8 w-8" />}
            iconColor="text-blue-500"
            iconBg="bg-blue-500/10"
            title="安全な決済"
            description="Stripeの安全な決済システム"
          />
          <FeatureCard
            icon={<Zap className="h-8 w-8" />}
            iconColor="text-green-500"
            iconBg="bg-green-500/10"
            title="自動送金"
            description="オンライン決済を自動受取"
          />
          <FeatureCard
            icon={<Globe className="h-8 w-8" />}
            iconColor="text-purple-500"
            iconBg="bg-purple-500/10"
            title="簡単管理"
            description="収支状況をダッシュボードで確認"
          />
        </div>

        {/* 注意事項 */}
        <Alert variant="default" className="border-muted bg-muted/30">
          <div className="space-y-3">
            <p className="font-semibold text-sm">ご準備いただくもの</p>
            <ul className="space-y-2">
              <PreparationItem
                icon={<FileCheck className="h-4 w-4" />}
                text="本人確認書類（運転免許証、パスポートなど）"
              />
              <PreparationItem
                icon={<Building2 className="h-4 w-4" />}
                text="銀行口座情報（Stripeのページで入力します）"
              />
              <PreparationItem
                icon={<Clock className="h-4 w-4" />}
                text="所要時間：約3〜5分（途中保存可能）"
              />
            </ul>
          </div>
        </Alert>

        {/* 送信ボタン */}
        <Button
          type="button"
          className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
          size="lg"
          disabled={isLoading}
          onClick={handleStartOnboarding}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              設定を開始しています...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-5 w-5" />
              Stripeで設定を始める
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// 特徴カードサブコンポーネント
interface FeatureCardProps {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
}

function FeatureCard({ icon, iconColor, iconBg, title, description }: FeatureCardProps) {
  return (
    <div className="group flex flex-col items-center text-center p-6 border rounded-xl bg-gradient-to-br from-card to-muted/20">
      <div className={`p-3 rounded-xl ${iconBg} ${iconColor} mb-3`}>{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

// 準備項目サブコンポーネント
interface PreparationItemProps {
  icon: React.ReactNode;
  text: string;
}

function PreparationItem({ icon, text }: PreparationItemProps) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <div className="flex-shrink-0 mt-0.5 text-primary">{icon}</div>
      <span className="text-muted-foreground">{text}</span>
    </li>
  );
}
