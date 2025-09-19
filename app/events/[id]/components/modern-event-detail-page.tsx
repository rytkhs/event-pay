"use client";

import { useRouter } from "next/navigation";

import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Banknote,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  Share2,
  Edit,
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

import { OrganizerDashboard } from "./organizer-dashboard";
import { ParticipantView } from "./participant-view";

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

  // 招待リンクのコピー処理
  const handleCopyInviteLink = async () => {
    try {
      const inviteUrl = `${window.location.origin}/invite/${eventDetail.invite_token}`;
      await navigator.clipboard.writeText(inviteUrl);
      // TODO: toast通知を追加
    } catch (error) {
      console.error("Failed to copy invite link:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヒーローヘッダー */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          {/* 上部ナビゲーション */}
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push("/events")}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              イベント一覧に戻る
            </Button>
          </div>

          {/* メインヒーローエリア */}
          <div className="space-y-4">
            {/* タイトル行とCTA */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              {/* 左側：イベント名とステータス */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                  <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
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

                {/* 基本情報を主要エリアに移動 */}
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

              {/* 右側：主要CTAボタン */}
              <div className="flex-shrink-0 w-full lg:w-auto">
                {isOrganizer ? (
                  /* 主催者向けCTA */
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={() => router.push(`/events/${eventId}/edit`)}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <Edit className="h-4 w-4" />
                      編集
                    </Button>
                    <Button
                      onClick={handleCopyInviteLink}
                      variant="default"
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                      disabled={!eventDetail.invite_token}
                    >
                      <Share2 className="h-4 w-4" />
                      招待リンク共有
                    </Button>
                  </div>
                ) : (
                  /* 参加者向けCTA */
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => router.push(`/invite/${eventDetail.invite_token}`)}
                      variant="default"
                      size="lg"
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                      disabled={!eventDetail.invite_token || eventDetail.status !== "upcoming"}
                    >
                      <UserPlus className="h-4 w-4" />
                      参加登録
                    </Button>
                    <p className="text-xs text-gray-500 text-center">
                      {eventDetail.status !== "upcoming"
                        ? "イベントが終了しています"
                        : "出欠確認・お支払い"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツエリア */}
      <div className="max-w-6xl mx-auto px-4 pb-8">
        {isOrganizer ? (
          <OrganizerDashboard
            eventId={eventId}
            eventDetail={eventDetail}
            paymentsData={paymentsData}
            participantsData={participantsData}
            stats={stats}
          />
        ) : (
          <ParticipantView eventDetail={eventDetail} />
        )}
      </div>
    </div>
  );
}
