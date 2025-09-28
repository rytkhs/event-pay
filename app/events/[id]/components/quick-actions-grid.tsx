"use client";

import { useRouter } from "next/navigation";

import { Users, Edit, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InviteLinkPopover } from "@/features/invite/components/invite-link-popover";

interface QuickActionsGridProps {
  eventId: string;
  inviteToken?: string;
  eventStatus?: string;
}

interface QuickActionsGridProps {
  eventId: string;
  inviteToken?: string;
  eventStatus?: string;
  attendingCount?: number; // 参加者数を追加
}

export function QuickActionsGrid({
  eventId,
  inviteToken,
  eventStatus,
  attendingCount = 0,
}: QuickActionsGridProps) {
  const router = useRouter();

  // 編集可能かどうかの判定（開催済みまたはキャンセル済みは編集不可）
  const canEdit = eventStatus !== "past" && eventStatus !== "canceled";

  const handleManageParticipants = () => {
    router.push(`/events/${eventId}/participants`);
  };

  const handleEditEvent = () => {
    if (!canEdit) return;
    router.push(`/events/${eventId}/edit`);
  };

  return (
    <div className="mb-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold text-foreground mb-2">クイックアクション</h3>
        {/* <p className="text-sm text-muted-foreground">よく使う機能にすばやくアクセス</p> */}
      </div>

      {/* FAB風のアクションボタン群 */}
      <div className="space-y-3">
        {/* 参加者管理 - 最優先アクション */}
        <Button
          onClick={handleManageParticipants}
          size="lg"
          className="w-full h-16 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all duration-200"
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-white/20 rounded-lg">
                <Users className="h-6 w-6" />
              </div>
              <div className="text-left">
                <div className="font-bold text-lg">参加者管理</div>
                <div className="text-sm opacity-90">
                  {attendingCount > 0 ? `${attendingCount}人が参加中` : "参加者を確認・管理"}
                </div>
              </div>
            </div>
            <ExternalLink className="h-5 w-5 opacity-70" />
          </div>
        </Button>

        {/* サブアクション - 2列グリッド */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 招待リンク */}
          <div className="flex-1">
            <InviteLinkPopover
              eventId={eventId}
              initialInviteToken={inviteToken}
              className="w-full h-14"
            />
          </div>

          {/* イベント編集 */}
          <Button
            onClick={handleEditEvent}
            variant="outline"
            size="lg"
            disabled={!canEdit}
            className={`h-14 border-2 transition-all duration-200 ${
              canEdit
                ? "hover:bg-orange-50 hover:border-orange-300 border-orange-200"
                : "opacity-50 cursor-not-allowed"
            }`}
            title={
              canEdit
                ? "イベント設定を編集"
                : eventStatus === "past"
                  ? "開催済みのイベントは編集できません"
                  : "キャンセル済みのイベントは編集できません"
            }
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${canEdit ? "bg-orange-100" : "bg-gray-100"}`}>
                <Edit className={`h-5 w-5 ${canEdit ? "text-orange-600" : "text-gray-400"}`} />
              </div>
              <div className="text-left">
                <div className={`font-bold ${canEdit ? "text-foreground" : "text-gray-400"}`}>
                  イベント編集
                </div>
                <div className="text-xs text-muted-foreground">
                  {canEdit ? "設定を変更" : "編集不可"}
                </div>
              </div>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
