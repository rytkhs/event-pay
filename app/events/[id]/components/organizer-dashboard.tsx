"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import type { Event } from "@core/types/models";
import type { GetEventPaymentsResponse } from "@core/validation/participant-management";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { EventOverview } from "./event-overview";
import { FloatingActionMenu } from "./floating-action-menu";
import { StatusBar } from "./status-bar";

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
}: OrganizerDashboardProps) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const router = useRouter();

  // 統計計算
  const attendingCount = stats?.attending_count || 0;
  const maybeCount = stats?.maybe_count || 0;
  const totalRevenue = paymentsData?.summary?.paidAmount || 0;
  const expectedRevenue = eventDetail.fee * attendingCount;
  const unpaidCount = paymentsData?.summary?.unpaidCount || 0;

  const handleSendReminder = async () => {
    // TODO: リマインドメール送信機能
    console.log("Send reminder not implemented yet");
  };

  const handleExportData = async () => {
    // TODO: データ出力機能
    console.log("Export data not implemented yet");
  };

  const handleManageParticipants = () => {
    router.push(`/events/${eventId}/participants`);
  };

  return (
    <div className="space-y-6">
      {/* ステータスバー */}
      <StatusBar
        eventId={eventId}
        attendingCount={attendingCount}
        capacity={eventDetail.capacity || 0}
        totalRevenue={totalRevenue}
        expectedRevenue={expectedRevenue}
        unpaidCount={unpaidCount}
      />

      {/* 主催者向けタブと参加者管理リンク */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:grid-cols-2 bg-white border border-border rounded-lg">
            <TabsTrigger
              value="dashboard"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              ダッシュボード
            </TabsTrigger>
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
            >
              イベント詳細
            </TabsTrigger>
          </TabsList>

          {/* 参加者管理リンクボタン */}
        </Tabs>

        <Button
          onClick={handleManageParticipants}
          size="lg"
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
        >
          🎛️ 参加者を管理する
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* ダッシュボード */}
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 参加状況詳細カード */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">参加状況</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">参加予定</span>
                  <span className="font-medium text-primary">{attendingCount}人</span>
                </div>
                {maybeCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">未定</span>
                    <span className="font-medium text-warning">{maybeCount}人</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="text-sm font-medium">定員</span>
                  <span className="font-medium">{eventDetail.capacity}人</span>
                </div>
              </CardContent>
            </Card>

            {/* 集金詳細カード */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">集金状況</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">決済済み</span>
                  <span className="font-medium text-success">¥{totalRevenue.toLocaleString()}</span>
                </div>
                {unpaidCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">未決済</span>
                    <span className="font-medium text-destructive">
                      {unpaidCount}件 / ¥
                      {(paymentsData?.summary?.unpaidAmount || 0).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="text-sm font-medium">目標</span>
                  <span className="font-medium">¥{expectedRevenue.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            {/* 決済方法別カード */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">決済方法</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">オンライン決済</span>
                  <span className="font-medium">
                    {paymentsData?.summary?.byMethod?.find((m) => m.method === "stripe")?.count ||
                      0}
                    件
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">現金</span>
                  <span className="font-medium">
                    {paymentsData?.summary?.byMethod?.find((m) => m.method === "cash")?.count || 0}
                    件
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* イベント詳細 */}
        <TabsContent value="overview" className="space-y-6">
          <EventOverview event={eventDetail} />
        </TabsContent>
      </Tabs>

      {/* フローティングアクションメニュー */}
      <FloatingActionMenu
        eventId={eventId}
        onSendReminder={handleSendReminder}
        onExportData={handleExportData}
      />
    </div>
  );
}
