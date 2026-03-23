export const dynamic = "force-dynamic";

import { requireNonEmptyCommunityWorkspaceForServerComponent } from "@core/community/app-workspace";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import { SinglePageEventForm } from "@features/events";
import { getDashboardConnectCtaStatus } from "@features/stripe-connect/server";

import { createEventAction } from "./actions";
import { notFound } from "next/navigation";

export default async function CreateEventPage() {
  const workspace = await requireNonEmptyCommunityWorkspaceForServerComponent();
  const currentCommunity = workspace.currentCommunity;

  if (!currentCommunity) {
    return notFound();
  }

  // current community の payout profile 状態から、オンライン決済可否を決定する
  const supabase = await createServerComponentSupabaseClient();
  const connectStatus = await getDashboardConnectCtaStatus(supabase, currentCommunity.id);
  const canUseOnlinePayments = !connectStatus;

  return (
    <div className="min-h-screen ">
      <div className="container mx-auto">
        <SinglePageEventForm
          canUseOnlinePayments={canUseOnlinePayments}
          connectStatus={connectStatus}
          currentCommunityName={currentCommunity.name}
          createEventAction={createEventAction}
        />
      </div>
    </div>
  );
}
