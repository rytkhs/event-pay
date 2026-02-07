/**
 * Stripe 入金設定ステータス表示コンポーネント
 * UI Statusに基づいて適切なビューを表示
 */

"use client";

import { useState } from "react";

import Link from "next/link";

import { CreditCard, ArrowUpDown, RefreshCw, ExternalLink, BookOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { AccountStatusData } from "../types/status-classification";

import { NoAccountView } from "./status-views/NoAccountView";
import { PendingReviewView } from "./status-views/PendingReviewView";
import { ReadyView } from "./status-views/ReadyView";
import { RequirementsDueView } from "./status-views/RequirementsDueView";
import { RestrictedView } from "./status-views/RestrictedView";
import { UnverifiedView } from "./status-views/UnverifiedView";

interface AccountStatusProps {
  refreshUrl: string;
  status: AccountStatusData;
  expressDashboardAction?: (formData: FormData) => Promise<void>;
}

export function AccountStatus({ refreshUrl, status, expressDashboardAction }: AccountStatusProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // サーバーコンポーネントを再評価するにはページをリロード（または router.refresh()）
    window.location.reload();
  };

  // UI Statusに基づいてビューを切り替え
  const renderStatusView = () => {
    switch (status.uiStatus) {
      case "no_account":
        return <NoAccountView refreshUrl={refreshUrl} />;
      case "unverified":
        return <UnverifiedView refreshUrl={refreshUrl} />;
      case "requirements_due":
        return (
          <RequirementsDueView
            status={status}
            refreshUrl={refreshUrl}
            expressDashboardAction={expressDashboardAction}
            expressDashboardAvailable={status.expressDashboardAvailable}
          />
        );
      case "pending_review":
        return <PendingReviewView />;
      case "restricted":
        return <RestrictedView />;
      case "ready":
        return (
          <ReadyView
            status={status}
            expressDashboardAction={expressDashboardAction}
            expressDashboardAvailable={status.expressDashboardAvailable}
          />
        );
      default:
        return null;
    }
  };

  // UI Statusバッジの表示
  const getUIStatusBadge = () => {
    switch (status.uiStatus) {
      case "no_account":
        return <Badge variant="outline">未設定</Badge>;
      case "unverified":
        return <Badge variant="outline">未認証</Badge>;
      case "requirements_due":
        return <Badge variant="secondary">設定中</Badge>;
      case "pending_review":
        return <Badge variant="secondary">審査中</Badge>;
      case "restricted":
        return <Badge variant="destructive">制限あり</Badge>;
      case "ready":
        return <Badge variant="default">設定完了</Badge>;
      default:
        return <Badge variant="outline">不明</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Stripe 入金設定
            </CardTitle>
            <CardDescription>
              売上の入金設定の状況です。未完了の項目がある場合は「Stripeで設定を続行」から再設定してください。
            </CardDescription>
            <div className="pt-2">
              <Link
                href="/dashboard/connect/guide"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-md text-blue-600 hover:text-blue-800 hover:underline"
              >
                <BookOpen className="h-4 w-4" />
                設定回答の参考ページを見る
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={isRefreshing}>
            {isRefreshing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ステータス概要 */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div>
              <div className="font-semibold">アカウントステータス</div>
            </div>
          </div>
          {getUIStatusBadge()}
        </div>

        {/* 送金ステータス（アカウントが存在する場合のみ） */}
        {status.hasAccount && (
          <div className="grid gap-4 md:grid-cols-1">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4" />
                <span className="text-sm font-medium">送金</span>
              </div>
              <Badge variant={status.payoutsEnabled ? "default" : "outline"}>
                {status.payoutsEnabled ? "有効" : "無効"}
              </Badge>
            </div>
          </div>
        )}

        {/* UI Status別のビューを表示 */}
        {renderStatusView()}
      </CardContent>
    </Card>
  );
}
