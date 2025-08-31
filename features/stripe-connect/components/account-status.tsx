/**
 * Stripe Connect アカウントステータス表示コンポーネント
 */

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  CreditCard,
  ArrowUpDown,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import {
  getConnectAccountStatusAction,
  createConnectAccountAction,
} from "@/app/(dashboard)/actions/stripe-connect";
import { logger } from "@core/logging/app-logger";
import { STRIPE_ACCOUNT_STATUS_LABELS } from "@/types/enums";

interface AccountStatusData {
  hasAccount: boolean;
  accountId?: string;
  status: "unverified" | "onboarding" | "verified" | "restricted" | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements?: {
    currently_due: string[];
    eventually_due: string[];
    past_due: string[];
    pending_verification: string[];
  };
  capabilities?: {
    card_payments?: "active" | "inactive" | "pending";
    transfers?: "active" | "inactive" | "pending";
  };
}

interface AccountStatusProps {
  refreshUrl: string;
  returnUrl: string;
}

export function AccountStatus({ refreshUrl, returnUrl }: AccountStatusProps) {
  const [accountData, setAccountData] = useState<AccountStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccountStatus = async () => {
    try {
      const result = await getConnectAccountStatusAction();
      if (result.success && result.data) {
        // statusプロパティを適切にマッピング
        const mappedData: AccountStatusData = {
          ...result.data,
          status:
            result.data.status === "unverified" ||
            result.data.status === "onboarding" ||
            result.data.status === "verified" ||
            result.data.status === "restricted"
              ? result.data.status
              : null,
        };
        setAccountData(mappedData);
        setError(null);
      } else {
        setError(result.error || "アカウント情報の取得中にエラーが発生しました");
      }
    } catch (_err) {
      setError("アカウント情報の取得中にエラーが発生しました");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAccountStatus();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAccountStatus();
  };

  const handleUpdateAccount = async () => {
    const formData = new FormData();
    formData.append("refreshUrl", refreshUrl);
    formData.append("returnUrl", returnUrl);

    try {
      await createConnectAccountAction(formData);
    } catch (error) {
      logger.error("Account update error", {
        tag: "connectAccountUpdateError",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "verified":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "onboarding":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "restricted":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "unverified":
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: string | null) => {
    if (!status) return "未設定";
    return (
      STRIPE_ACCOUNT_STATUS_LABELS[status as keyof typeof STRIPE_ACCOUNT_STATUS_LABELS] || "未設定"
    );
  };

  const getStatusVariant = (
    status: string | null
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "verified":
        return "default";
      case "onboarding":
        return "secondary";
      case "restricted":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          アカウント情報を読み込み中...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={handleRefresh} variant="outline" className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            再試行
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!accountData?.hasAccount) {
    return null; // OnboardingFormが表示される
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Stripe Connect アカウント
            </CardTitle>
            <CardDescription>売上受取用アカウントの設定状況</CardDescription>
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
            {getStatusIcon(accountData.status)}
            <div>
              <div className="font-semibold">アカウントステータス</div>
              <div className="text-sm text-muted-foreground">
                ID: {accountData.accountId?.slice(-8)}
              </div>
            </div>
          </div>
          <Badge variant={getStatusVariant(accountData.status)}>
            {getStatusText(accountData.status)}
          </Badge>
        </div>

        {/* 機能ステータス */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="text-sm font-medium">決済受取</span>
            </div>
            <Badge variant={accountData.chargesEnabled ? "default" : "outline"}>
              {accountData.chargesEnabled ? "有効" : "無効"}
            </Badge>
          </div>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4" />
              <span className="text-sm font-medium">送金</span>
            </div>
            <Badge variant={accountData.payoutsEnabled ? "default" : "outline"}>
              {accountData.payoutsEnabled ? "有効" : "無効"}
            </Badge>
          </div>
        </div>

        {/* 要求事項がある場合の表示 */}
        {accountData.requirements && (
          <>
            {accountData.requirements.currently_due.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>追加情報が必要です：</strong>
                  <ul className="mt-2 space-y-1 text-sm">
                    {accountData.requirements.currently_due.map((requirement, index) => (
                      <li key={index}>• {requirement}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {accountData.requirements.past_due.length > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>期限切れの要求事項があります：</strong>
                  <ul className="mt-2 space-y-1 text-sm">
                    {accountData.requirements.past_due.map((requirement, index) => (
                      <li key={index}>• {requirement}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {/* アクションボタン */}
        {accountData.status !== "verified" && (
          <div className="flex gap-2">
            <Button onClick={handleUpdateAccount} className="flex-1">
              <ExternalLink className="h-4 w-4 mr-2" />
              {accountData.status === "unverified" ? "設定を完了する" : "設定を更新する"}
            </Button>
          </div>
        )}

        {/* 成功メッセージ */}
        {accountData.status === "verified" &&
          accountData.chargesEnabled &&
          accountData.payoutsEnabled && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>設定完了！</strong> Stripe Connectアカウントの設定が完了しました。
                イベントの売上を自動で受け取ることができます。
              </AlertDescription>
            </Alert>
          )}
      </CardContent>
    </Card>
  );
}
