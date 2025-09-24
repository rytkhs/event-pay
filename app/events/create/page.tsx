import { redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";

import { ModernEventForm } from "@features/events";
import { getDetailedAccountStatusAction } from "@features/stripe-connect/actions/account-status-check";

export default async function CreateEventPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  // Stripe Connectの詳細状態を取得し、オンライン決済可否を決定
  const detailedStatus = await getDetailedAccountStatusAction();
  const canUseOnlinePayments =
    detailedStatus.success && detailedStatus.status?.statusType === "ready";

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/30 to-accent/5 py-8">
      <div className="container mx-auto px-4">
        <ModernEventForm
          canUseOnlinePayments={canUseOnlinePayments}
          connectStatus={detailedStatus.status}
        />
      </div>
    </div>
  );
}
