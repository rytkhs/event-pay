import type { AppSupabaseClient } from "@core/types/supabase";

import type { PlatformFeeConfig } from "./service";

export const LEGACY_APPLICATION_FEE_REGISTERED_BEFORE = "2026-05-17T00:00:00+09:00";
export const LEGACY_APPLICATION_FEE_EVENT_CREATED_BEFORE = "2026-07-01T00:00:00+09:00";
export const LEGACY_PLATFORM_FEE_RATE = 0.049;
export const LEGACY_PLATFORM_FIXED_FEE = 0;

export type ApplicationFeeConfigResolutionOptions =
  | boolean
  | {
      forceRefresh?: boolean;
      eventId?: string;
      payoutProfileId?: string;
    };

export async function resolvePlatformFeeConfigForApplicationFee(
  supabase: AppSupabaseClient<"public">,
  platform: PlatformFeeConfig,
  options: ApplicationFeeConfigResolutionOptions
): Promise<{
  platform: PlatformFeeConfig;
  legacyApplicationFeeApplied: boolean;
}> {
  if (typeof options === "boolean" || !options.eventId || !options.payoutProfileId) {
    return {
      platform,
      legacyApplicationFeeApplied: false,
    };
  }

  const shouldApplyLegacyFee = await shouldApplyLegacyApplicationFee(supabase, {
    eventId: options.eventId,
    payoutProfileId: options.payoutProfileId,
  });

  if (!shouldApplyLegacyFee) {
    return {
      platform,
      legacyApplicationFeeApplied: false,
    };
  }

  return {
    platform: {
      ...platform,
      rate: LEGACY_PLATFORM_FEE_RATE,
      fixedFee: LEGACY_PLATFORM_FIXED_FEE,
    },
    legacyApplicationFeeApplied: true,
  };
}

async function shouldApplyLegacyApplicationFee(
  supabase: AppSupabaseClient<"public">,
  params: {
    eventId: string;
    payoutProfileId: string;
  }
): Promise<boolean> {
  const [{ data: event, error: eventError }, { data: payoutProfile, error: payoutProfileError }] =
    await Promise.all([
      supabase
        .from("events")
        .select("created_at")
        .eq("id", params.eventId)
        .maybeSingle<{ created_at: string }>(),
      supabase
        .from("payout_profiles")
        .select("owner_user_id")
        .eq("id", params.payoutProfileId)
        .maybeSingle<{ owner_user_id: string }>(),
    ]);

  if (eventError) {
    throw new Error(`[ApplicationFeeCalculator] Failed to fetch event: ${eventError.message}`);
  }
  if (payoutProfileError) {
    throw new Error(
      `[ApplicationFeeCalculator] Failed to fetch payout profile: ${payoutProfileError.message}`
    );
  }
  if (!event) {
    throw new Error(`[ApplicationFeeCalculator] Event not found: ${params.eventId}`);
  }
  if (!payoutProfile) {
    throw new Error(
      `[ApplicationFeeCalculator] Payout profile not found: ${params.payoutProfileId}`
    );
  }

  const { data: ownerUser, error: ownerUserError } = await supabase
    .from("users")
    .select("created_at")
    .eq("id", payoutProfile.owner_user_id)
    .maybeSingle<{ created_at: string }>();

  if (ownerUserError) {
    throw new Error(
      `[ApplicationFeeCalculator] Failed to fetch payout profile owner: ${ownerUserError.message}`
    );
  }
  if (!ownerUser) {
    throw new Error(
      `[ApplicationFeeCalculator] Payout profile owner not found: ${payoutProfile.owner_user_id}`
    );
  }

  return (
    new Date(ownerUser.created_at).getTime() <
      new Date(LEGACY_APPLICATION_FEE_REGISTERED_BEFORE).getTime() &&
    new Date(event.created_at).getTime() <
      new Date(LEGACY_APPLICATION_FEE_EVENT_CREATED_BEFORE).getTime()
  );
}
