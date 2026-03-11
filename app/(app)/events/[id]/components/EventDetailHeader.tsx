"use client";

import { useRouter } from "next/navigation";

import { ArrowLeft, Calendar, Edit, MapPin } from "lucide-react";

import { EVENT_STATUS_LABELS } from "@core/constants/status-labels";
import type { Event } from "@core/types/event";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EventDetailHeaderProps {
  eventDetail: Event;
  activeTab: string;
  tabLabels: {
    overview: string;
    participants: string;
  };
}

export function EventDetailHeader({ eventDetail, activeTab, tabLabels }: EventDetailHeaderProps) {
  const router = useRouter();

  const handleBackToEvents = () => {
    router.push("/events");
  };

  // 編集可能かどうかの判定
  const canEdit = eventDetail.status !== "past" && eventDetail.status !== "canceled";

  const handleEditEvent = () => {
    if (!canEdit) return;
    router.push(`/events/${eventDetail.id}/edit`);
  };

  const getStatusBadge = (status: string) => {
    const statusText = EVENT_STATUS_LABELS[status as keyof typeof EVENT_STATUS_LABELS] || status;

    switch (status) {
      case "upcoming":
        return (
          <Badge variant="default" className="text-xs">
            {statusText}
          </Badge>
        );
      case "ongoing":
        return (
          <Badge variant="default" className="text-xs bg-green-100 text-green-800">
            {statusText}
          </Badge>
        );
      case "past":
        return (
          <Badge variant="secondary" className="text-xs">
            {statusText}
          </Badge>
        );
      case "canceled":
        return (
          <Badge variant="destructive" className="text-xs">
            {statusText}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            {statusText}
          </Badge>
        );
    }
  };

  return (
    <div className="sticky top-12 z-10 border-b border-border/60 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6">
        <div className="py-3 sm:py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3 sm:gap-4">
              <Button
                onClick={handleBackToEvents}
                variant="ghost"
                size="sm"
                className="mt-0.5 h-10 w-10 shrink-0 rounded-full p-0"
                aria-label="イベント一覧に戻る"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {getStatusBadge(eventDetail.status)}
                  <span className="text-xs font-medium text-muted-foreground">イベント管理</span>
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-lg font-bold leading-tight text-foreground sm:text-xl">
                    {sanitizeForEventPay(eventDetail.title)}
                  </h1>
                  <div className="flex flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatUtcToJstByType(eventDetail.date, "standard")}</span>
                    </div>
                    {eventDetail.location && (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {sanitizeForEventPay(eventDetail.location)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-start">
              <Button
                onClick={handleEditEvent}
                variant="outline"
                size="sm"
                disabled={!canEdit}
                aria-label={canEdit ? "イベント設定を編集" : "イベント設定は編集できません"}
                className={`h-10 px-3 transition-all duration-200 ${
                  canEdit
                    ? "border-orange-200 bg-orange-50/60 text-orange-700 hover:bg-orange-100 hover:border-orange-300 hover:text-orange-800"
                    : "opacity-50 cursor-not-allowed"
                }`}
              >
                <Edit className={`h-4 w-4 ${canEdit ? "text-orange-600" : "text-gray-400"}`} />
                <span className="font-medium">編集</span>
              </Button>
            </div>
          </div>

          <div className="mt-4 border-t border-border/60 pt-3">
            <TabsList
              className="h-auto w-full justify-start gap-1 rounded-none bg-transparent p-0"
              aria-label="イベント管理タブ"
            >
              <TabsTrigger
                value="overview"
                className="rounded-full border border-transparent px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary/15 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground"
              >
                {tabLabels.overview}
              </TabsTrigger>
              <TabsTrigger
                value="participants"
                className="rounded-full border border-transparent px-4 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary/15 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground"
              >
                {tabLabels.participants}
              </TabsTrigger>
            </TabsList>
            <p className="mt-2 text-xs text-muted-foreground">
              {activeTab === "overview"
                ? "イベント概要と集金状況を確認できます。"
                : "参加者の検索、絞り込み、入金管理ができます。"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
