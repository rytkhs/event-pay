import "server-only";

import type { AppSupabaseClient } from "@core/types/supabase";

type PayoutProfileReadiness = {
  isReady: boolean;
  userMessage?: string;
};

type PayoutProfileStatusRow = {
  status: string;
  payouts_enabled: boolean;
};

export async function getEventPayoutProfileReadiness(
  supabase: AppSupabaseClient<"public">,
  payoutProfileId: string | null
): Promise<PayoutProfileReadiness> {
  if (!payoutProfileId) {
    return {
      isReady: false,
      userMessage:
        "このイベントには受取先プロファイルが紐づいていないため、オンライン決済を有効化できません。コミュニティ対応のイベント作成・移行を完了してから再試行してください。",
    };
  }

  const { data, error } = await supabase
    .from("payout_profiles")
    .select("status, payouts_enabled")
    .eq("id", payoutProfileId)
    .maybeSingle<PayoutProfileStatusRow>();

  if (error || !data) {
    return {
      isReady: false,
      userMessage: "受取先プロファイルの状態を確認できないため、オンライン決済を有効化できません。",
    };
  }

  if (data.status !== "verified" || data.payouts_enabled !== true) {
    return {
      isReady: false,
      userMessage: "オンライン決済を追加するには受取先プロファイルの設定完了が必要です。",
    };
  }

  return { isReady: true };
}
