import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Calendar,
  Users,
  DollarSign,
  AlertCircle,
  Plus,
  List,
  FileText,
  Settings,
  Clock,
  UserCheck,
  ExternalLink,
} from "lucide-react";

import { logoutAction } from "@core/actions/auth";
import { createClient } from "@core/supabase/server";
import { formatUtcToJst } from "@core/utils/timezone";

import { getDashboardDataAction } from "@features/events/actions/get-dashboard-stats";
import {
  checkExpressDashboardAccessAction,
  createExpressDashboardLoginLinkAction,
} from "@features/stripe-connect/actions/express-dashboard";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function handleLogout() {
  "use server";
  const result = await logoutAction();
  if (result.success && result.redirectUrl) {
    redirect(result.redirectUrl);
  }
}

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
    cancelled: { label: "中止", variant: "destructive" as const },
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

  // ダッシュボードデータとExpress Dashboard アクセス情報を並列取得
  const [dashboardResult, expressDashboardResult] = await Promise.all([
    getDashboardDataAction(),
    checkExpressDashboardAccessAction(),
  ]);

  if (!dashboardResult.success || !dashboardResult.data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              ダッシュボード情報の読み込みに失敗しました。ページを再読み込みしてください。
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const { stats, recentEvents } = dashboardResult.data;
  const canAccessExpressDashboard = expressDashboardResult.success;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
            </div>
            <div className="flex items-center space-x-4" data-testid="user-menu">
              <span className="text-sm text-gray-700">ようこそ、{user.email}さん</span>
              <form action={handleLogout}>
                <Button type="submit" variant="outline" size="sm">
                  ログアウト
                </Button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* 統計カードセクション */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">今月の収支額</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.monthlyRevenue)}
              </div>
              <p className="text-xs text-gray-500 mt-1">決済完了分のみ</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">今月のイベント数</CardTitle>
              <Calendar className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.monthlyEventsCount}</div>
              <p className="text-xs text-gray-500 mt-1">開催・予定含む</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">今月の参加者数</CardTitle>
              <Users className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats.monthlyParticipants}</div>
              <p className="text-xs text-gray-500 mt-1">参加確定者のみ</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">要対応項目</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.pendingActionsCount}</div>
              <p className="text-xs text-gray-500 mt-1">締切・定員近し</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 最近のイベント */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">最近のイベント</CardTitle>
              </CardHeader>
              <CardContent>
                {recentEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">まだイベントがありません</p>
                    <Button asChild>
                      <Link href="/events/create">
                        <Plus className="h-4 w-4 mr-2" />
                        最初のイベントを作成
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-sm font-medium text-gray-900 truncate">
                              {event.title}
                            </h3>
                            {getStatusBadge(event.status)}
                          </div>
                          <div className="flex items-center text-xs text-gray-500 space-x-4">
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
                        <Button asChild variant="outline" size="sm">
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
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">クイックアクション</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button asChild className="w-full justify-start" size="sm">
                    <Link href="/events/create">
                      <Plus className="h-4 w-4 mr-2" />
                      新規イベント作成
                    </Link>
                  </Button>

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
                    <Link href="/dashboard/connect">
                      <Settings className="h-4 w-4 mr-2" />
                      Stripe設定
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
                        Express ダッシュボード
                      </Button>
                    </form>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* お知らせ・ヒント */}
            {stats.pendingActionsCount > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-orange-600">
                    <AlertCircle className="h-5 w-5 inline mr-2" />
                    要対応項目があります
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-3">
                    締切が近いイベントや定員に近づいているイベントがあります。
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/events">確認する</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
