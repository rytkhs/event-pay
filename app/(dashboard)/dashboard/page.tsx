import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Calendar,
  CalendarDays,
  Users,
  DollarSign,
  AlertTriangle,
  Plus,
  List,
  FileText,
  Settings,
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
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* 統計カードセクション（4つのカード） */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="hover:shadow-md transition-shadow border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                開催予定イベント
              </CardTitle>
              <CalendarDays className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold text-primary mb-1">
                {stats.upcomingEventsCount}
              </div>
              <p className="text-xs text-muted-foreground">管理中のイベント</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                参加予定者
              </CardTitle>
              <Users className="h-5 w-5 text-secondary" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold text-secondary mb-1">
                {stats.totalUpcomingParticipants}
              </div>
              <p className="text-xs text-muted-foreground">合計参加者数</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                未決済の参加費
              </CardTitle>
              <DollarSign className="h-5 w-5 text-warning" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold text-warning mb-1">
                {formatCurrency(stats.unpaidFeesTotal)}
              </div>
              <p className="text-xs text-muted-foreground">決済待ち金額</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                アカウント残高
              </CardTitle>
              <Landmark className="h-5 w-5 text-success" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold text-success mb-1">
                {formatCurrency(stats.stripeAccountBalance)}
              </div>
              <p className="text-xs text-muted-foreground">振込み待ち金額</p>
            </CardContent>
          </Card>
        </div>

        {/* Stripe Connect アカウント設定CTA */}
        {accountStatus && <ConnectAccountCta status={accountStatus} />}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 最近のイベント（コンパクト版） */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold">最近のイベント</CardTitle>
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/events">
                      すべて表示
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
                    {recentEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-medium text-foreground truncate">
                              {event.title}
                            </h3>
                            {getStatusBadge(event.status)}
                          </div>
                          <div className="flex items-center text-xs text-muted-foreground space-x-3">
                            <span className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {formatUtcToJst(event.date, "MM/dd HH:mm")}
                            </span>
                            <span className="flex items-center">
                              <UserCheck className="h-3 w-3 mr-1" />
                              {event.attendances_count}
                              {event.capacity && `/${event.capacity}`}名
                            </span>
                            {event.fee > 0 && (
                              <span className="flex items-center">
                                <DollarSign className="h-3 w-3 mr-1" />
                                {formatCurrency(event.fee)}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button asChild variant="ghost" size="sm" className="ml-2">
                          <Link href={`/events/${event.id}`}>詳細</Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* クイックアクション */}
          <div>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold">クイックアクション</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button asChild variant="outline" className="w-full justify-start" size="sm">
                    <Link href="/events">
                      <List className="h-4 w-4 mr-2" />
                      イベント一覧
                    </Link>
                  </Button>

                  <Button asChild variant="outline" className="w-full justify-start" size="sm">
                    <Link href="/settlement-reports">
                      <FileText className="h-4 w-4 mr-2" />
                      精算レポート
                    </Link>
                  </Button>

                  <Button asChild variant="outline" className="w-full justify-start" size="sm">
                    <Link href="/settings/profile">
                      <Settings className="h-4 w-4 mr-2" />
                      アカウント設定
                    </Link>
                  </Button>

                  {canAccessExpressDashboard && (
                    <form action={createExpressDashboardLoginLinkAction}>
                      <Button
                        type="submit"
                        variant="outline"
                        className="w-full justify-start"
                        size="sm"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        売上ダッシュボード
                      </Button>
                    </form>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* フローティングアクションボタン（FAB） - 新規イベント作成 */}
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            asChild
            size="lg"
            className="rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-shadow"
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
