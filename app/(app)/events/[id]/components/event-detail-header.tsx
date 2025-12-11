"use client";

import { useRouter } from "next/navigation";

import { ArrowLeft, Calendar, Edit, Eye, MapPin } from "lucide-react";

import { EVENT_STATUS_LABELS } from "@core/types/enums";
import type { Event } from "@core/types/models";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EventDetailHeaderProps {
  eventDetail: Event;
  activeTab: string;
  onTabChange: (value: string) => void;
}

export function EventDetailHeader({ eventDetail, activeTab, onTabChange }: EventDetailHeaderProps) {
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

  const handlePreviewEvent = () => {
    if (eventDetail.invite_token) {
      window.open(`/guest/${eventDetail.invite_token}`, "_blank");
    }
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
    <div className="bg-white border-b border-border/50 sticky top-0 z-10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-4">
          <div className="flex items-center gap-3">
            <Button
              onClick={handleBackToEvents}
              variant="ghost"
              size="sm"
              className="flex-shrink-0 p-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-foreground truncate">
                {sanitizeForEventPay(eventDetail.title)}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {getStatusBadge(eventDetail.status)}

                <div className="items-center gap-3 text-xs text-muted-foreground hidden sm:flex">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{formatUtcToJstByType(eventDetail.date, "standard")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate max-w-[150px]">
                      {sanitizeForEventPay(eventDetail.location)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* プレビューボタン */}
              {eventDetail.invite_token && (
                <Button
                  onClick={handlePreviewEvent}
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex h-9"
                >
                  <Eye className="h-4 w-4 mr-1.5" />
                  <span className="font-medium">プレビュー</span>
                </Button>
              )}

              {/* 編集ボタン */}
              <Button
                onClick={handleEditEvent}
                variant="outline"
                size="sm"
                disabled={!canEdit}
                className={`flex-shrink-0 h-9 px-3 transition-all duration-200 ${
                  canEdit
                    ? "hover:bg-orange-50 hover:border-orange-300 border-orange-200"
                    : "opacity-50 cursor-not-allowed"
                }`}
                title={canEdit ? "イベント設定を編集" : "編集不可"}
              >
                <Edit className={`h-4 w-4 ${canEdit ? "text-orange-600" : "text-gray-400"}`} />
                <span className="ml-1.5 hidden sm:inline font-medium">編集</span>
              </Button>
            </div>
          </div>
        </div>

        {/* タブナビゲーション */}
        <div className="mt-2">
          <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
            <TabsList className="bg-transparent p-0 h-auto space-x-6 border-b-0 w-full justify-start rounded-none">
              <TabsTrigger
                value="overview"
                className="rounded-none border-b-2 border-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground transition-colors bg-transparent"
              >
                概要
              </TabsTrigger>
              <TabsTrigger
                value="participants"
                className="rounded-none border-b-2 border-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground transition-colors bg-transparent"
              >
                参加者管理
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
