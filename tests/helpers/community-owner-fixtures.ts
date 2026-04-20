import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { generateInviteToken } from "@core/utils/invite-token";

import type { Database } from "@/types/database";

type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
type CommunityInsert = Database["public"]["Tables"]["communities"]["Insert"];

type OwnedCommunityFixture = {
  community: {
    id: string;
    name: string;
    slug: string;
  };
  payoutProfileId: string | null;
};

type CommunityOwnedEventFixture = {
  communityId: string;
  payoutProfileId: string | null;
  event: {
    id: string;
    created_by: string;
    payout_profile_id: string | null;
    payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
    fee: number;
  };
};

type CreateCommunityOwnedEventOptions = {
  title?: string;
  date?: string;
  fee?: number;
  capacity?: number | null;
  payment_methods?: Database["public"]["Enums"]["payment_method_enum"][];
  location?: string;
  description?: string;
  registration_deadline?: string | null;
  payment_deadline?: string | null;
  canceled_at?: string | null;
  withPayoutProfile?: boolean;
  attachPayoutProfileToEvent?: boolean;
  payoutProfileStatus?: string;
  payoutsEnabled?: boolean;
};

type CreateOwnedCommunityOptions = {
  name?: string;
  description?: string;
  slug?: string;
  withPayoutProfile?: boolean;
  payoutProfileStatus?: string;
  payoutsEnabled?: boolean;
};

export async function createOwnedCommunityFixture(
  createdBy: string,
  options: CreateOwnedCommunityOptions = {}
): Promise<OwnedCommunityFixture> {
  const adminClient = await createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    "Creating owned community fixture",
    {
      operationType: "INSERT",
      accessedTables: ["public.communities", "public.payout_profiles"],
      additionalInfo: {
        testContext: "owned-community-fixture",
        createdBy,
      },
    }
  );

  const {
    name = `fixture-community-${Date.now()}`,
    description = "community owner fixture",
    slug = `fixture-community-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    withPayoutProfile = true,
    payoutProfileStatus = "verified",
    payoutsEnabled = true,
  } = options;

  const communityInsert: CommunityInsert = {
    created_by: createdBy,
    name,
    slug,
    description,
  };

  const { data: community, error: communityError } = await adminClient
    .from("communities")
    .insert(communityInsert)
    .select("id, name, slug")
    .single();

  if (communityError || !community) {
    throw new Error(`Failed to create fixture community: ${communityError?.message}`);
  }

  let payoutProfileId: string | null = null;

  if (withPayoutProfile) {
    const { data: existingPayoutProfile, error: existingPayoutProfileError } = await adminClient
      .from("payout_profiles")
      .select("id, representative_community_id")
      .eq("owner_user_id", createdBy)
      .maybeSingle();

    if (existingPayoutProfileError) {
      throw new Error(
        `Failed to look up fixture payout profile: ${existingPayoutProfileError.message}`
      );
    }

    if (existingPayoutProfile) {
      payoutProfileId = existingPayoutProfile.id;

      const { error: payoutProfileUpdateError } = await adminClient
        .from("payout_profiles")
        .update({
          status: payoutProfileStatus,
          collection_ready: payoutProfileStatus === "verified",
          payouts_enabled: payoutsEnabled,
          representative_community_id:
            existingPayoutProfile.representative_community_id ?? community.id,
        })
        .eq("id", existingPayoutProfile.id);

      if (payoutProfileUpdateError) {
        throw new Error(
          `Failed to update fixture payout profile: ${payoutProfileUpdateError.message}`
        );
      }
    } else {
      const { data: payoutProfile, error: payoutProfileError } = await adminClient
        .from("payout_profiles")
        .insert({
          owner_user_id: createdBy,
          stripe_account_id: `acct_fixture_${Math.random().toString(36).slice(2, 14)}`,
          status: payoutProfileStatus,
          collection_ready: payoutProfileStatus === "verified",
          payouts_enabled: payoutsEnabled,
          representative_community_id: community.id,
        })
        .select("id")
        .single();

      if (payoutProfileError || !payoutProfile) {
        throw new Error(`Failed to create fixture payout profile: ${payoutProfileError?.message}`);
      }

      payoutProfileId = payoutProfile.id;
    }

    const { error: communityUpdateError } = await adminClient
      .from("communities")
      .update({
        current_payout_profile_id: payoutProfileId,
      })
      .eq("id", community.id);

    if (communityUpdateError) {
      throw new Error(
        `Failed to attach payout profile to community: ${communityUpdateError.message}`
      );
    }
  }

  return {
    community,
    payoutProfileId,
  };
}

export async function createCommunityOwnedEventFixture(
  createdBy: string,
  options: CreateCommunityOwnedEventOptions = {}
): Promise<CommunityOwnedEventFixture> {
  const adminClient = await createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    "Creating community-owned event fixture",
    {
      operationType: "INSERT",
      accessedTables: ["public.communities", "public.payout_profiles", "public.events"],
      additionalInfo: {
        testContext: "community-owner-fixture",
        createdBy,
      },
    }
  );

  const futureDate = new Date(Date.now() + 60 * 60 * 1000);
  const futureDateString = futureDate.toISOString();
  const defaultRegistrationDeadline = new Date(futureDate.getTime() - 30 * 60 * 1000).toISOString();

  const {
    title = "community owner fixture event",
    date = futureDateString,
    fee = 0,
    capacity = null,
    payment_methods = fee > 0 ? ["stripe"] : [],
    location = "fixture hall",
    description = "community owner fixture",
    registration_deadline = defaultRegistrationDeadline,
    payment_deadline = null,
    canceled_at = null,
    withPayoutProfile = true,
    attachPayoutProfileToEvent = withPayoutProfile,
    payoutProfileStatus = "verified",
    payoutsEnabled = true,
  } = options;

  const { community, payoutProfileId } = await createOwnedCommunityFixture(createdBy, {
    withPayoutProfile,
    payoutProfileStatus,
    payoutsEnabled,
  });

  const eventData: EventInsert = {
    title,
    date,
    location,
    description,
    fee,
    capacity,
    payment_methods,
    registration_deadline: registration_deadline || defaultRegistrationDeadline,
    payment_deadline: payment_deadline || null,
    canceled_at,
    invite_token: generateInviteToken(),
    created_by: createdBy,
    community_id: community.id,
    payout_profile_id: attachPayoutProfileToEvent ? payoutProfileId : null,
    created_at: new Date().toISOString(),
  };

  const { data: event, error: eventError } = await adminClient
    .from("events")
    .insert(eventData)
    .select("id, created_by, payout_profile_id, payment_methods, fee")
    .single();

  if (eventError || !event) {
    throw new Error(`Failed to create fixture event: ${eventError?.message}`);
  }

  return {
    communityId: community.id,
    payoutProfileId,
    event,
  };
}
