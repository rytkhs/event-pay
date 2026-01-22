import { redirect } from "next/navigation";

import { createClient } from "@core/supabase/server";

export const dynamic = "force-dynamic";

import { SinglePageEventForm } from "@features/events";
import { getDetailedAccountStatusAction } from "@features/stripe-connect";

import { createEventAction } from "./actions";

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

  /**
   * オンライン決済可否の判定ロジック
   *
   * getDetailedAccountStatusAction の仕様:
   * - アカウント未作成/認証不備がある場合: status オブジェクトを返す（CTA表示用）
   * - 全て正常で決済可能な場合: status を undefined で返す（CTA非表示）
   *
   * したがって、status === undefined が「ready」状態を意味する
   *
   */
  const canUseOnlinePayments = detailedStatus.success && !detailedStatus.status;

  return (
    <div className="min-h-screen ">
      <div className="container mx-auto">
        <SinglePageEventForm
          canUseOnlinePayments={canUseOnlinePayments}
          connectStatus={detailedStatus.status}
          createEventAction={createEventAction}
        />
      </div>
    </div>
  );
}
