"use client";

import { useRouter } from "next/navigation";

import { Users, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InviteLinkPopover } from "@/features/invite/components/invite-link-popover";

interface QuickActionsGridProps {
  eventId: string;
  inviteToken?: string;
  attendingCount?: number; // 参加者数を追加
}

export function QuickActionsGrid({
  eventId,
  inviteToken,
  attendingCount = 0,
}: QuickActionsGridProps) {
  const router = useRouter();

  const handleManageParticipants = () => {
    router.push(`/events/${eventId}/participants`);
  };

  return (
    <div className="mb-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold text-foreground mb-2">クイックアクション</h3>
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
            <ChevronRight className="h-5 w-5 opacity-70" />
          </div>
        </Button>

        {/* 招待リンク */}
        <InviteLinkPopover
          eventId={eventId}
          initialInviteToken={inviteToken}
          className="w-full h-14"
        />
      </div>
    </div>
  );
}
