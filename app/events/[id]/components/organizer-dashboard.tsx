"use client";

import { useRouter } from "next/navigation";

import {
  Users,
  CreditCard,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Clock,
} from "lucide-react";

import type { Event } from "@core/types/models";
import type { GetEventPaymentsResponse } from "@core/validation/participant-management";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import { EventOverview } from "./event-overview";
import { FloatingActionMenu } from "./floating-action-menu";

interface OrganizerDashboardProps {
  eventId: string;
  eventDetail: Event;
  paymentsData: GetEventPaymentsResponse | null;
  stats: { attending_count: number; maybe_count: number } | null;
}

export function OrganizerDashboard({
  eventId,
  eventDetail,
  paymentsData,
  stats,
}: OrganizerDashboardProps): JSX.Element {
  const router = useRouter();

  // 統計計算
  const attendingCount = stats?.attending_count ?? 0;
  const maybeCount = stats?.maybe_count ?? 0;
  const totalRevenue = paymentsData?.summary?.paidAmount ?? 0;
  const expectedRevenue = eventDetail.fee * attendingCount;
  const unpaidCount = paymentsData?.summary?.unpaidCount ?? 0;

  // 参加率・集金進捗率計算
  const capacity = eventDetail.capacity ?? 0;
  const attendanceRate = capacity > 0 ? Math.round((attendingCount / capacity) * 100) : 0;
  const collectionProgress =
    expectedRevenue > 0 ? Math.round((totalRevenue / expectedRevenue) * 100) : 0;

  const handleSendReminder = async (): Promise<void> => {
    // TODO: リマインドメール送信機能
    if (process.env.NODE_ENV === "development") {
      console.log("Send reminder not implemented yet");
    }
  };

  const handleExportData = async (): Promise<void> => {
    // TODO: データ出力機能
    if (process.env.NODE_ENV === "development") {
      console.log("Export data not implemented yet");
    }
  };

  const handleManageParticipants = (): void => {
    router.push(`/events/${eventId}/participants`);
  };

  return (
    <div className="space-y-8">
      {/* クイック統計セクション */}
      <div className="bg-white rounded-xl border border-border/50 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">概要</h2>
            <p className="text-sm text-muted-foreground">イベントの参加状況と集金進捗</p>
          </div>
          <Button
            onClick={handleManageParticipants}
            size="lg"
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 font-medium"
          >
            🎛️ 参加者を管理する
          </Button>
        </div>

        {/* プログレスバー */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 参加状況 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-foreground">参加状況</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {attendingCount} / {capacity}人
              </span>
            </div>
            <Progress value={attendanceRate} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>0人</span>
              <span className="font-medium text-foreground">{attendanceRate}% 埋まっています</span>
              <span>{capacity}人</span>
            </div>
          </div>

          {/* 集金状況 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="font-medium text-foreground">集金進捗</span>
              </div>
              <span className="text-sm text-muted-foreground">
                ¥{totalRevenue.toLocaleString()} / ¥{expectedRevenue.toLocaleString()}
              </span>
            </div>
            <Progress value={collectionProgress} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>¥0</span>
              <span className="font-medium text-foreground">{collectionProgress}% 回収済み</span>
              <span>¥{expectedRevenue.toLocaleString()}</span>
            </div>
            {unpaidCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-md">
                <AlertCircle className="h-3 w-3" />
                <span>未決済 {unpaidCount}件</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 詳細メトリクス */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 参加状況詳細カード */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-foreground">
              <Users className="h-4 w-4 text-blue-600" />
              参加状況詳細
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span className="text-sm text-muted-foreground">参加予定</span>
                </div>
                <span className="font-semibold text-green-600">{attendingCount}人</span>
              </div>
              {maybeCount > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 text-yellow-600" />
                    <span className="text-sm text-muted-foreground">未定</span>
                  </div>
                  <span className="font-semibold text-yellow-600">{maybeCount}人</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-sm font-medium text-foreground">残り定員</span>
                <span className="font-semibold text-foreground">
                  {Math.max(0, capacity - attendingCount)}人
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 集金詳細カード */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-foreground">
              <TrendingUp className="h-4 w-4 text-green-600" />
              集金状況詳細
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span className="text-sm text-muted-foreground">決済済み</span>
                </div>
                <span className="font-semibold text-green-600">
                  ¥{totalRevenue.toLocaleString()}
                </span>
              </div>
              {unpaidCount > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-3 w-3 text-orange-600" />
                    <span className="text-sm text-muted-foreground">未決済</span>
                  </div>
                  <span className="font-semibold text-orange-600">
                    {unpaidCount}件 / ¥{(paymentsData?.summary?.unpaidAmount ?? 0).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-sm font-medium text-foreground">予想売上</span>
                <span className="font-semibold text-foreground">
                  ¥{expectedRevenue.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 決済方法別カード */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-foreground">
              <CreditCard className="h-4 w-4 text-blue-600" />
              決済方法別
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-500 rounded-sm"></div>
                  <span className="text-sm text-muted-foreground">オンライン決済</span>
                </div>
                <span className="font-semibold text-foreground">
                  {paymentsData?.summary?.byMethod?.find((m) => m.method === "stripe")?.count ?? 0}
                  件
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
                  <span className="text-sm text-muted-foreground">現金</span>
                </div>
                <span className="font-semibold text-foreground">
                  {paymentsData?.summary?.byMethod?.find((m) => m.method === "cash")?.count ?? 0}件
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-sm font-medium text-foreground">合計</span>
                <span className="font-semibold text-foreground">
                  {(paymentsData?.summary?.byMethod?.find((m) => m.method === "stripe")?.count ??
                    0) +
                    (paymentsData?.summary?.byMethod?.find((m) => m.method === "cash")?.count ?? 0)}
                  件
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* イベント詳細情報 */}
      <div className="space-y-6">
        <EventOverview event={eventDetail} />
      </div>

      {/* フローティングアクションメニュー */}
      <FloatingActionMenu
        eventId={eventId}
        onSendReminder={handleSendReminder}
        onExportData={handleExportData}
      />
    </div>
  );
}
