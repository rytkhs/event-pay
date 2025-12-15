"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import type { Event } from "@core/types/models";
import type {
  GetEventPaymentsResponse,
  GetParticipantsResponse,
} from "@core/validation/participant-management";

import { Tabs, TabsContent } from "@/components/ui/tabs";

import { EventDetailHeader } from "./event-detail-header";
import { EventOverviewTab } from "./event-overview-tab";
import { EventParticipantsTab } from "./event-participants-tab";

interface EventManagementPageProps {
  eventId: string;
  eventDetail: Event;
  paymentsData: GetEventPaymentsResponse | null;
  overviewStats: { attending_count: number; maybe_count: number } | null;
  participantsData: GetParticipantsResponse | null;
  searchParams: { [key: string]: string | string[] | undefined };
}

export function EventManagementPage({
  eventId,
  eventDetail,
  paymentsData,
  overviewStats,
  participantsData,
  searchParams,
}: EventManagementPageProps) {
  const router = useRouter();
  const currentTab = typeof searchParams.tab === "string" ? searchParams.tab : "overview";
  const [activeTab, setActiveTab] = useState(currentTab);

  // ステートをURLパラメータと同期
  useEffect(() => {
    setActiveTab(currentTab);
  }, [currentTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);

    // URL更新（タブ切り替え時）
    const params = new URLSearchParams(window.location.search);
    params.set("tab", value);

    // タブ切り替え時はページネーションなどをリセットした方が自然かもしれないが
    // 参加者管理に戻った時に状態を維持したい場合はそのままにする
    // ここではタブ切り替えだけを行う
    router.push(`/events/${eventId}?${params.toString()}`);
  };

  const handleParticipantsFilterUpdate = (newParams: Record<string, string | undefined>) => {
    const params = new URLSearchParams(window.location.search);

    // タブを確実にセット
    params.set("tab", "participants");

    // 新しいパラメータを適用
    Object.entries(newParams).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    // ページを1にリセット（フィルター変更が明示的なので）
    if (Object.keys(newParams).some((key) => key !== "page")) {
      params.set("page", "1");
    }

    router.push(`/events/${eventId}?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <EventDetailHeader
        eventDetail={eventDetail}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      <Tabs value={activeTab} className="w-full">
        {/* 概要タブコンテンツ */}
        <TabsContent value="overview" className="mt-0 focus-visible:outline-none">
          <EventOverviewTab
            eventId={eventId}
            eventDetail={eventDetail}
            paymentsData={paymentsData}
            stats={overviewStats}
          />
        </TabsContent>

        {/* 参加者管理タブコンテンツ */}
        <TabsContent value="participants" className="mt-0 focus-visible:outline-none">
          {participantsData ? (
            <EventParticipantsTab
              eventId={eventId}
              eventDetail={eventDetail}
              participantsData={participantsData}
              searchParams={searchParams}
              onUpdateFilters={handleParticipantsFilterUpdate}
            />
          ) : (
            <div className="p-8 text-center text-muted-foreground">読み込み中...</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
