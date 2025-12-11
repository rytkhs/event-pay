"use client";

import { InviteLinkPopover } from "@/features/invite/components/invite-link-popover";

interface QuickActionsGridProps {
  eventId: string;
  inviteToken?: string;
}

export function QuickActionsGrid({ eventId, inviteToken }: QuickActionsGridProps) {
  return (
    <div className="mb-6">
      {/* 招待リンク */}
      <InviteLinkPopover
        eventId={eventId}
        initialInviteToken={inviteToken}
        className="w-full h-14"
      />
    </div>
  );
}
