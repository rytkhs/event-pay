import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Calendar,
  CalendarDays,
  Users,
  DollarSign,
  AlertTriangle,
  Plus,
  Clock,
  UserCheck,
  ExternalLink,
  Landmark,
} from "lucide-react";

import { createClient } from "@core/supabase/server";
import { formatUtcToJst } from "@core/utils/timezone";

import { getDashboardDataAction } from "@features/events/actions/get-dashboard-stats";
import { getDetailedAccountStatusAction } from "@features/stripe-connect/actions/account-status-check";
import {
  checkExpressDashboardAccessAction,
  createExpressDashboardLoginLinkAction,
} from "@features/stripe-connect/actions/express-dashboard";
import { getStripeBalanceAction } from "@features/stripe-connect/actions/get-balance";
import { ConnectAccountCta } from "@features/stripe-connect/components/connect-account-cta";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

function getStatusBadge(status: string) {
  const statusConfig = {
    upcoming: { label: "開催予定", variant: "default" as const },
    ongoing: { label: "開催中", variant: "secondary" as const },
    past: { label: "終了", variant: "outline" as const },
    canceled: { label: "中止", variant: "destructive" as const },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || {
    label: status,
    variant: "default" as const,
  };

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  );
}

export default async function DashboardPage() {
  // 認証状態チェック
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login?redirectTo=/dashboard");
  }

  // ダッシュボードデータとStripe Connect情報を並列取得
  const [dashboardResult, expressDashboardResult, accountStatusResult, stripeBalanceResult] =
    await Promise.all([
      getDashboardDataAction(),
      checkExpressDashboardAccessAction(),
      getDetailedAccountStatusAction(),
      getStripeBalanceAction(),
    ]);

  if (!dashboardResult.success || !dashboardResult.data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              ダッシュボード情報の読み込みに失敗しました。ページを再読み込みしてください。
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const { stats: dashboardStats, recentEvents } = dashboardResult.data;
  const canAccessExpressDashboard = expressDashboardResult.success;
  const accountStatus = accountStatusResult.success ? accountStatusResult.status : undefined;
  const stripeBalance = stripeBalanceResult.success ? stripeBalanceResult.data : 0;

  // statsにStripe残高を統合
  const stats = {
    ...dashboardStats,
    stripeAccountBalance: stripeBalance,
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="max-w-7xl mx-auto py-4 sm:py-6 lg:py-8 px-3 sm:px-4 lg:px-8">
        {/* ダッシュボードヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ダッシュボード</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              イベント管理の概要を確認できます
            </p>
          </div>
          <Button asChild size="default" className="hidden sm:flex w-fit items-center gap-2">
            <Link href="/events/create">
              <Plus className="h-4 w-4" />
              新しいイベント
            </Link>
          </Button>
        </div>
        {/* 統計カードセクション（4つのカード） */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card className="hover:shadow-md transition-shadow border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">
                開催予定イベント
              </CardTitle>
              <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl sm:text-3xl font-bold text-primary mb-1">
                {stats.upcomingEventsCount}
              </div>
              <p className="text-xs text-muted-foreground">管理中のイベント</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">
                参加予定者
              </CardTitle>
              <Users className="h-4 w-4 sm:h-5 sm:w-5 text-secondary flex-shrink-0" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl sm:text-3xl font-bold text-secondary mb-1">
                {stats.totalUpcomingParticipants}
              </div>
              <p className="text-xs text-muted-foreground">合計参加者数</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">
                未決済の参加費
              </CardTitle>
              <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-warning flex-shrink-0" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg sm:text-2xl lg:text-3xl font-bold text-warning mb-1 leading-tight">
                {formatCurrency(stats.unpaidFeesTotal)}
              </div>
              <p className="text-xs text-muted-foreground">決済待ち金額</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">
                アカウント残高
              </CardTitle>
              <Landmark className="h-4 w-4 sm:h-5 sm:w-5 text-success flex-shrink-0" />
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="text-lg sm:text-2xl lg:text-3xl font-bold text-success leading-tight">
                {formatCurrency(stats.stripeAccountBalance)}
              </div>

              {canAccessExpressDashboard && (
                <form action={createExpressDashboardLoginLinkAction} className="w-full">
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-xs"
                  >
                    <ExternalLink className="h-3 w-3 mr-2 flex-shrink-0" />
                    詳細を確認
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stripe Connect アカウント設定CTA */}
        {accountStatus && <ConnectAccountCta status={accountStatus} />}

        {/* 最近のイベント（全幅版） */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base sm:text-lg font-semibold">最近のイベント</CardTitle>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground text-xs sm:text-sm"
              >
                <Link href="/events" className="flex items-center">
                  <span className="hidden xs:inline">すべて表示</span>
                  <span className="inline xs:hidden">すべて</span>
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {recentEvents.length === 0 ? (
              <div className="text-center py-6 bg-muted rounded-lg">
                <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">まだイベントがありません</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentEvents.slice(0, 5).map((event) => (
                  <div
                    key={event.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors gap-3 sm:gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 sm:mb-1">
                        <h3 className="text-sm font-medium text-foreground truncate flex-1">
                          {event.title}
                        </h3>
                        {getStatusBadge(event.status)}
                      </div>
                      <div className="flex flex-col xs:flex-row xs:items-center text-xs text-muted-foreground gap-2 xs:gap-3">
                        <span className="flex items-center">
                          <Clock className="h-3 w-3 mr-1 flex-shrink-0" />
                          {formatUtcToJst(event.date, "MM/dd HH:mm")}
                        </span>
                        <span className="flex items-center">
                          <UserCheck className="h-3 w-3 mr-1 flex-shrink-0" />
                          {event.attendances_count}
                          {event.capacity && `/${event.capacity}`}名
                        </span>
                        {event.fee > 0 && (
                          <span className="flex items-center">
                            <DollarSign className="h-3 w-3 mr-1 flex-shrink-0" />
                            {formatCurrency(event.fee)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="self-start sm:self-center sm:ml-2 text-xs"
                    >
                      <Link href={`/events/${event.id}`}>詳細</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* フローティングアクションボタン（FAB） - モバイル専用 */}
        <div className="fixed bottom-6 right-4 z-50 sm:hidden">
          <Button
            asChild
            size="lg"
            className="rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Link href="/events/create" className="flex items-center justify-center">
              <Plus className="h-6 w-6" />
              <span className="sr-only">新規イベント作成</span>
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
