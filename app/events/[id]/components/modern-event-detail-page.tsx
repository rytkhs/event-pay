"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Banknote,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

import { EVENT_STATUS_LABELS } from "@core/types/enums";
import type { Event } from "@core/types/models";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";
import type {
  GetParticipantsResponse,
  GetEventPaymentsResponse,
} from "@core/validation/participant-management";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InviteLink } from "@/features/invite/components/invite-link";

import { EventOverview } from "./event-overview";
import { ResponsiveParticipantsManagement } from "./responsive-participants-management";

interface ModernEventDetailPageProps {
  eventId: string;
  eventDetail: Event;
  isOrganizer: boolean;
  paymentsData: GetEventPaymentsResponse | null;
  participantsData: GetParticipantsResponse | null;
  stats: { attending_count: number; maybe_count: number } | null;
}

export function ModernEventDetailPage({
  eventId,
  eventDetail,
  isOrganizer,
  paymentsData,
  participantsData,
  stats,
}: ModernEventDetailPageProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");

  // 統計計算
  const attendingCount = stats?.attending_count || 0;
  const maybeCount = stats?.maybe_count || 0;
  const totalRevenue = paymentsData?.summary?.paidAmount || 0;
  const expectedRevenue = eventDetail.fee * attendingCount;
  const unpaidCount = paymentsData?.summary?.unpaidCount || 0;
  const hasUnpaidPayments = unpaidCount > 0;

  // 参加率計算
  const attendanceRate = eventDetail.capacity
    ? Math.round((attendingCount / eventDetail.capacity) * 100)
    : 0;

  // 集金進捗率
  const collectionProgress =
    expectedRevenue > 0 ? Math.round((totalRevenue / expectedRevenue) * 100) : 0;

  // ステータスバッジの色
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "upcoming":
        return "default";
      case "ongoing":
        return "secondary";
      case "past":
        return "outline";
      case "canceled":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "upcoming":
        return Calendar;
      case "ongoing":
        return CheckCircle2;
      case "past":
        return Calendar;
      case "canceled":
        return AlertCircle;
      default:
        return Calendar;
    }
  };

  const StatusIcon = getStatusIcon(eventDetail.status);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              onClick={() => router.push("/events")}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              イベント一覧に戻る
            </Button>

            {isOrganizer && (
              <Button onClick={() => router.push(`/events/${eventId}/edit`)} variant="outline">
                編集
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {/* イベント名とステータス */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex-1">
                {sanitizeForEventPay(eventDetail.title)}
              </h1>
              <Badge
                variant={getStatusBadgeVariant(eventDetail.status)}
                className="flex items-center gap-1 px-3 py-1 text-sm font-medium w-fit"
              >
                <StatusIcon className="h-4 w-4" />
                {EVENT_STATUS_LABELS[eventDetail.status as keyof typeof EVENT_STATUS_LABELS] ||
                  eventDetail.status}
              </Badge>
            </div>

            {/* 基本情報 */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {formatUtcToJstByType(eventDetail.date, "japanese")}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {sanitizeForEventPay(eventDetail.location)}
              </div>
              {eventDetail.fee > 0 && (
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4" />
                  {eventDetail.fee.toLocaleString()}円
                </div>
              )}
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                定員{eventDetail.capacity}人
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* サマリーカード（主催者のみ） */}
      {isOrganizer && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* 参加状況 */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">参加状況</p>
                    <div className="mt-2">
                      <p className="text-2xl font-bold text-gray-900">
                        {attendingCount}
                        <span className="text-sm font-normal text-gray-500">
                          /{eventDetail.capacity}人
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">参加率 {attendanceRate}%</p>
                    </div>
                  </div>
                  <div
                    className={`p-3 rounded-full ${attendingCount >= (eventDetail.capacity || 0) ? "bg-orange-100" : "bg-blue-100"}`}
                  >
                    <Users
                      className={`h-6 w-6 ${attendingCount >= (eventDetail.capacity || 0) ? "text-orange-600" : "text-blue-600"}`}
                    />
                  </div>
                </div>
                {maybeCount > 0 && (
                  <p className="text-xs text-yellow-600 mt-2">未定: {maybeCount}人</p>
                )}
              </CardContent>
            </Card>

            {/* 集金状況 */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">集金状況</p>
                    <div className="mt-2">
                      <p className="text-2xl font-bold text-gray-900">
                        ¥{totalRevenue.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">進捗 {collectionProgress}%</p>
                    </div>
                  </div>
                  <div className="p-3 rounded-full bg-green-100">
                    <Banknote className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                {expectedRevenue > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    目標: ¥{expectedRevenue.toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 未決済状況 */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">未決済</p>
                    <div className="mt-2">
                      <p
                        className={`text-2xl font-bold ${hasUnpaidPayments ? "text-red-600" : "text-gray-900"}`}
                      >
                        {unpaidCount}件
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        ¥{(paymentsData?.summary?.unpaidAmount || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`p-3 rounded-full ${hasUnpaidPayments ? "bg-red-100" : "bg-gray-100"}`}
                  >
                    <AlertCircle
                      className={`h-6 w-6 ${hasUnpaidPayments ? "text-red-600" : "text-gray-400"}`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 決済方法別 */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">決済方法</p>
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>カード</span>
                        <span className="font-medium">
                          {paymentsData?.summary?.byMethod?.find((m) => m.method === "stripe")
                            ?.count || 0}
                          件
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>現金</span>
                        <span className="font-medium">
                          {paymentsData?.summary?.byMethod?.find((m) => m.method === "cash")
                            ?.count || 0}
                          件
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* タブコンテンツ */}
      <div className="max-w-6xl mx-auto px-4 pb-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-3 bg-white border border-gray-200 rounded-lg">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
            >
              概要
            </TabsTrigger>
            {isOrganizer && (
              <TabsTrigger
                value="participants"
                className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
              >
                参加者管理
              </TabsTrigger>
            )}
            {isOrganizer && (
              <TabsTrigger
                value="invite"
                className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
              >
                招待・共有
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <EventOverview event={eventDetail} />
          </TabsContent>

          {isOrganizer && (
            <TabsContent value="participants" className="space-y-6">
              {participantsData && (
                <ResponsiveParticipantsManagement
                  eventId={eventId}
                  initialParticipantsData={participantsData}
                />
              )}
            </TabsContent>
          )}

          {isOrganizer && (
            <TabsContent value="invite" className="space-y-6">
              <div className="space-y-6">
                <InviteLink
                  eventId={eventId}
                  initialInviteToken={eventDetail.invite_token || undefined}
                />

                {/* 追加のアクション */}
                <Card>
                  <CardHeader>
                    <CardTitle>その他のアクション</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Button
                        variant="outline"
                        onClick={() => window.open(`/invite/${eventDetail.invite_token}`, "_blank")}
                        disabled={!eventDetail.invite_token}
                        className="justify-start"
                      >
                        参加ページを確認
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => router.push(`/events/${eventId}/edit`)}
                        className="justify-start"
                      >
                        イベント情報を編集
                      </Button>
                    </div>

                    {/* 危険なアクション */}
                    <div className="pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-medium text-gray-900 mb-3">危険なアクション</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {attendingCount + maybeCount === 0 &&
                        !paymentsData?.summary?.totalPayments ? (
                          <Button
                            variant="destructive"
                            className="justify-start"
                            onClick={() => {
                              if (
                                confirm("本当にイベントを削除しますか？この操作は取り消せません。")
                              ) {
                                // 削除処理（既存のロジックを使用）
                              }
                            }}
                          >
                            イベントを削除
                          </Button>
                        ) : (
                          <Button
                            variant="destructive"
                            className="justify-start"
                            onClick={() => {
                              if (confirm("イベントを中止しますか？参加者に通知されます。")) {
                                // 中止処理（既存のロジックを使用）
                              }
                            }}
                          >
                            イベントを中止
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
