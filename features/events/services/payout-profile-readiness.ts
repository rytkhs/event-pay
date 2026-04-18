import "server-only";

import type { AppSupabaseClient } from "@core/types/supabase";

type PayoutProfileReadiness = {
  isReady: boolean;
  userMessage?: string;
};

type PayoutProfileStatusRow = {
  status: string;
};

export async function getEventPayoutProfileReadiness(
  supabase: AppSupabaseClient<"public">,
  payoutProfileId: string | null
): Promise<PayoutProfileReadiness> {
  if (!payoutProfileId) {
    return {
      isReady: false,
      userMessage:
        "受取先プロファイルが設定されていないため、オンライン決済を有効化できません。Stripe設定を確認してから再試行してください。",
    };
  }

  const { data, error } = await supabase
    .from("payout_profiles")
    .select("status")
    .eq("id", payoutProfileId)
    .maybeSingle<PayoutProfileStatusRow>();

  if (error || !data) {
    return {
      isReady: false,
      userMessage: "受取先プロファイルの状態を確認できないため、オンライン決済を有効化できません。",
    };
  }

  if (data.status !== "verified") {
    return {
      isReady: false,
      userMessage: "オンライン決済を追加するには受取先プロファイルの設定完了が必要です。",
    };
  }

  return { isReady: true };
}
