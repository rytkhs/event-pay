import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { generateGuestToken } from "@core/utils/guest-token";

import { createTestUser, deleteTestUser, type TestUser } from "@tests/helpers/test-user";

import type { Database } from "@/types/database";

type AdminClient = Awaited<ReturnType<typeof createAuditedAdminClient>>;
type PayoutRequestRow = Database["public"]["Tables"]["payout_requests"]["Row"];
type PayoutRequestInsert = Database["public"]["Tables"]["payout_requests"]["Insert"];
type PayoutRequestSnapshot = Pick<
  PayoutRequestRow,
  | "id"
  | "payout_profile_id"
  | "community_id"
  | "requested_by"
  | "stripe_account_id"
  | "stripe_payout_id"
  | "amount"
  | "currency"
  | "status"
  | "idempotency_key"
  | "failure_code"
  | "failure_message"
>[];

type AuthenticatedClient = {
  client: SupabaseClient<Database>;
  userId: string;
};

type PayoutRLSFixture = {
  adminClient: AdminClient;
  owner: TestUser;
  otherUser: TestUser;
  sameCommunityUser: TestUser;
  communityId: string;
  eventId: string;
  sameCommunityAttendanceId: string;
  payoutProfileId: string;
  payoutRequest: PayoutRequestRow;
  stripeAccountId: string;
  cleanup: () => Promise<void>;
};

const PASSWORD = "TestPassword123!";
const PAYOUT_REQUEST_SELECT =
  "id, payout_profile_id, community_id, requested_by, stripe_account_id, stripe_payout_id, amount, currency, status, idempotency_key, failure_code, failure_message, requested_at, updated_at, arrival_date, stripe_created_at";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<AuthenticatedClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for tests");
  }

  const client = createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Failed to sign in test user: ${error.message}`);
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new Error("Signed-in test user is missing an id");
  }

  return { client, userId };
}

async function createAdminClient(context: string): Promise<AdminClient> {
  return await createAuditedAdminClient(AdminReason.TEST_DATA_SETUP, context, {
    operationType: "INSERT",
    accessedTables: [
      "auth.users",
      "public.users",
      "public.communities",
      "public.events",
      "public.attendances",
      "public.payout_profiles",
      "public.payout_requests",
    ],
  });
}

function buildPayoutRequestInsert(
  fixture: Pick<
    PayoutRLSFixture,
    "payoutProfileId" | "communityId" | "owner" | "stripeAccountId"
  >,
  overrides: Partial<PayoutRequestInsert> = {}
): PayoutRequestInsert {
  const suffix = uniqueSuffix();

  return {
    payout_profile_id: fixture.payoutProfileId,
    community_id: fixture.communityId,
    requested_by: fixture.owner.id,
    stripe_account_id: fixture.stripeAccountId,
    stripe_payout_id: `po_rls_${suffix}`,
    amount: 1200,
    currency: "jpy",
    status: "created",
    idempotency_key: `payout_rls_${suffix}`,
    ...overrides,
  };
}

async function insertPayoutRequest(
  adminClient: AdminClient,
  input: PayoutRequestInsert
): Promise<PayoutRequestRow> {
  const { data, error } = await adminClient
    .from("payout_requests")
    .insert(input)
    .select(PAYOUT_REQUEST_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert payout_request fixture: ${error?.message}`);
  }

  return data;
}

async function getPayoutRequestById(
  adminClient: AdminClient,
  id: string
): Promise<PayoutRequestRow | null> {
  const { data, error } = await adminClient
    .from("payout_requests")
    .select(PAYOUT_REQUEST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch payout_request fixture: ${error.message}`);
  }

  return data ?? null;
}

async function listPayoutRequestSnapshots(
  adminClient: AdminClient,
  payoutProfileId: string
): Promise<PayoutRequestSnapshot> {
  const { data, error } = await adminClient
    .from("payout_requests")
    .select(
      "id, payout_profile_id, community_id, requested_by, stripe_account_id, stripe_payout_id, amount, currency, status, idempotency_key, failure_code, failure_message"
    )
    .eq("payout_profile_id", payoutProfileId)
    .order("requested_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list payout_request fixtures: ${error.message}`);
  }

  return data ?? [];
}

async function createPayoutRLSFixture(): Promise<PayoutRLSFixture> {
  const suffix = uniqueSuffix();
  const owner = await createTestUser(`payout-rls-owner-${suffix}@example.com`, PASSWORD);
  const otherUser = await createTestUser(`payout-rls-other-${suffix}@example.com`, PASSWORD);
  const sameCommunityUser = await createTestUser(
    `payout-rls-same-community-${suffix}@example.com`,
    PASSWORD
  );
  const adminClient = await createAdminClient("Creating payout_requests RLS fixture");
  const stripeAccountId = `acct_rls_${suffix.replace(/-/g, "_")}`;

  const { data: community, error: communityError } = await adminClient
    .from("communities")
    .insert({
      created_by: owner.id,
      name: `payout-rls-community-${suffix}`,
      slug: `payout-rls-community-${suffix}`,
      legal_slug: `legal-payout-rls-community-${suffix}`,
    })
    .select("id")
    .single();

  if (communityError || !community) {
    throw new Error(`Failed to insert community fixture: ${communityError?.message}`);
  }

  const { data: payoutProfile, error: payoutProfileError } = await adminClient
    .from("payout_profiles")
    .insert({
      owner_user_id: owner.id,
      stripe_account_id: stripeAccountId,
      status: "verified",
      collection_ready: true,
      payouts_enabled: true,
      representative_community_id: community.id,
    })
    .select("id")
    .single();

  if (payoutProfileError || !payoutProfile) {
    throw new Error(`Failed to insert payout_profile fixture: ${payoutProfileError?.message}`);
  }

  const { error: communityUpdateError } = await adminClient
    .from("communities")
    .update({ current_payout_profile_id: payoutProfile.id })
    .eq("id", community.id);

  if (communityUpdateError) {
    throw new Error(`Failed to attach payout_profile fixture: ${communityUpdateError.message}`);
  }

  const { data: event, error: eventError } = await adminClient
    .from("events")
    .insert({
      title: `payout-rls-event-${suffix}`,
      description: "payout_requests RLS fixture event",
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      location: "Test Location",
      fee: 1200,
      capacity: 10,
      created_by: owner.id,
      community_id: community.id,
      payout_profile_id: payoutProfile.id,
      invite_token: `inv_${suffix.replace(/-/g, "")}`,
      payment_methods: ["stripe", "cash"],
      registration_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      payment_deadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (eventError || !event) {
    throw new Error(`Failed to insert event fixture: ${eventError?.message}`);
  }

  const { data: attendance, error: attendanceError } = await adminClient
    .from("attendances")
    .insert({
      event_id: event.id,
      nickname: "same-community-user",
      email: sameCommunityUser.email,
      status: "attending",
      guest_token: generateGuestToken(),
    })
    .select("id")
    .single();

  if (attendanceError || !attendance) {
    throw new Error(`Failed to insert attendance fixture: ${attendanceError?.message}`);
  }

  const payoutRequest = await insertPayoutRequest(
    adminClient,
    buildPayoutRequestInsert({
      payoutProfileId: payoutProfile.id,
      communityId: community.id,
      owner,
      stripeAccountId,
    })
  );

  return {
    adminClient,
    owner,
    otherUser,
    sameCommunityUser,
    communityId: community.id,
    eventId: event.id,
    sameCommunityAttendanceId: attendance.id,
    payoutProfileId: payoutProfile.id,
    payoutRequest,
    stripeAccountId,
    cleanup: async () => {
      await adminClient.from("payout_requests").delete().eq("payout_profile_id", payoutProfile.id);
      await adminClient.from("attendances").delete().eq("id", attendance.id);
      await adminClient.from("events").delete().eq("id", event.id);
      await adminClient
        .from("communities")
        .update({ current_payout_profile_id: null })
        .eq("id", community.id);
      await adminClient.from("payout_profiles").delete().eq("id", payoutProfile.id);
      await adminClient.from("communities").delete().eq("id", community.id);
      await deleteTestUser(sameCommunityUser.email);
      await deleteTestUser(otherUser.email);
      await deleteTestUser(owner.email);
    },
  };
}

describe("payout_requests RLS 統合テスト", () => {
  describe("参照権限", () => {
    let fixture: PayoutRLSFixture;
    let ownerClient: AuthenticatedClient;
    let otherClient: AuthenticatedClient;
    let sameCommunityClient: AuthenticatedClient;

    beforeEach(async () => {
      fixture = await createPayoutRLSFixture();
      ownerClient = await createAuthenticatedClient(fixture.owner.email, fixture.owner.password);
      otherClient = await createAuthenticatedClient(
        fixture.otherUser.email,
        fixture.otherUser.password
      );
      sameCommunityClient = await createAuthenticatedClient(
        fixture.sameCommunityUser.email,
        fixture.sameCommunityUser.password
      );
    });

    afterEach(async () => {
      await fixture.cleanup();
    });

    // 所有者だけが履歴を読めることを固定する
    it("payout_profileのowner_user_idと一致するユーザーの時、自分のpayout_requestsを参照できること", async () => {
      const result = await ownerClient.client
        .from("payout_requests")
        .select(PAYOUT_REQUEST_SELECT)
        .eq("id", fixture.payoutRequest.id)
        .single();

      expect(result.error).toBeNull();
      expect(result.data).toEqual(
        expect.objectContaining({
          id: fixture.payoutRequest.id,
          payout_profile_id: fixture.payoutProfileId,
          community_id: fixture.communityId,
          requested_by: fixture.owner.id,
          stripe_account_id: fixture.stripeAccountId,
          stripe_payout_id: fixture.payoutRequest.stripe_payout_id,
          amount: fixture.payoutRequest.amount,
          currency: "jpy",
          status: "created",
          idempotency_key: fixture.payoutRequest.idempotency_key,
        })
      );
    });

    // 他ユーザーの入金履歴を読めないことを固定する
    it("payout_profileのowner_user_idと一致しないユーザーの時、他人のpayout_requestsを参照できないこと", async () => {
      const result = await otherClient.client
        .from("payout_requests")
        .select(PAYOUT_REQUEST_SELECT)
        .eq("payout_profile_id", fixture.payoutProfileId);

      expect(result.error).toBeNull();
      expect(result.data ?? []).toHaveLength(0);
    });

    // コミュニティメンバーであるだけでは受取履歴を読めないことを固定する
    it("同じコミュニティに所属していてもpayout_profileのowner_user_idと一致しない時、payout_requestsを参照できないこと", async () => {
      const result = await sameCommunityClient.client
        .from("payout_requests")
        .select(PAYOUT_REQUEST_SELECT)
        .eq("community_id", fixture.communityId);

      expect(result.error).toBeNull();
      expect(result.data ?? []).toHaveLength(0);
    });

    // metadata経由でIDが漏れても、DB参照はowner_user_id境界を越えない
    it("payout_request_idを知っていてもpayout_profileのowner_user_idと一致しない時、そのpayout_requestを参照できないこと", async () => {
      const result = await otherClient.client
        .from("payout_requests")
        .select(PAYOUT_REQUEST_SELECT)
        .eq("id", fixture.payoutRequest.id);

      expect(result.error).toBeNull();
      expect(result.data ?? []).toHaveLength(0);
    });
  });

  describe("書き込み権限", () => {
    let fixture: PayoutRLSFixture;
    let ownerClient: AuthenticatedClient;
    let beforeSnapshot: PayoutRequestSnapshot;

    beforeEach(async () => {
      fixture = await createPayoutRLSFixture();
      ownerClient = await createAuthenticatedClient(fixture.owner.email, fixture.owner.password);
      beforeSnapshot = await listPayoutRequestSnapshots(
        fixture.adminClient,
        fixture.payoutProfileId
      );
    });

    afterEach(async () => {
      await fixture.cleanup();
    });

    // クライアントからの任意作成を許さないことを固定する
    it("authenticatedユーザーが直接payout_requestsをinsertしようとした時、RLSにより拒否されること", async () => {
      const insertResult = await ownerClient.client
        .from("payout_requests")
        .insert(
          buildPayoutRequestInsert(fixture, {
            stripe_payout_id: `po_direct_insert_${uniqueSuffix()}`,
            idempotency_key: `payout_direct_insert_${uniqueSuffix()}`,
          })
        )
        .select(PAYOUT_REQUEST_SELECT);

      const afterSnapshot = await listPayoutRequestSnapshots(
        fixture.adminClient,
        fixture.payoutProfileId
      );

      expect(insertResult.error).not.toBeNull();
      expect(insertResult.data).toBeNull();
      expect(afterSnapshot).toEqual(beforeSnapshot);
    });

    // クライアントからの任意更新を許さないことを固定する
    it("authenticatedユーザーが直接payout_requestsをupdateしようとした時、RLSにより拒否されること", async () => {
      const updateResult = await ownerClient.client
        .from("payout_requests")
        .update({
          status: "paid",
          failure_code: "should_not_update",
          failure_message: "authenticated direct update must not mutate payout_requests",
        })
        .eq("id", fixture.payoutRequest.id)
        .select(PAYOUT_REQUEST_SELECT);

      const afterRow = await getPayoutRequestById(fixture.adminClient, fixture.payoutRequest.id);
      const afterSnapshot = await listPayoutRequestSnapshots(
        fixture.adminClient,
        fixture.payoutProfileId
      );

      expect(updateResult.error).toBeNull();
      expect(updateResult.data ?? []).toHaveLength(0);
      expect(afterRow).toEqual(fixture.payoutRequest);
      expect(afterSnapshot).toEqual(beforeSnapshot);
    });

    // クライアントからの任意削除を許さないことを固定する
    it("authenticatedユーザーが直接payout_requestsをdeleteしようとした時、RLSにより拒否されること", async () => {
      const deleteResult = await ownerClient.client
        .from("payout_requests")
        .delete()
        .eq("id", fixture.payoutRequest.id)
        .select(PAYOUT_REQUEST_SELECT);

      const afterRow = await getPayoutRequestById(fixture.adminClient, fixture.payoutRequest.id);
      const afterSnapshot = await listPayoutRequestSnapshots(
        fixture.adminClient,
        fixture.payoutProfileId
      );

      expect(deleteResult.error).toBeNull();
      expect(deleteResult.data ?? []).toHaveLength(0);
      expect(afterRow).toEqual(fixture.payoutRequest);
      expect(afterSnapshot).toEqual(beforeSnapshot);
    });

    // Server ActionとWebhookのDB更新権限を固定する
    it("service_roleの時、payout_requestsを作成・更新できること", async () => {
      const createInput = buildPayoutRequestInsert(fixture, {
        stripe_payout_id: `po_service_role_${uniqueSuffix()}`,
        idempotency_key: `payout_service_role_${uniqueSuffix()}`,
        amount: 3400,
      });
      const createResult = await fixture.adminClient
        .from("payout_requests")
        .insert(createInput)
        .select(PAYOUT_REQUEST_SELECT)
        .single();

      expect(createResult.error).toBeNull();
      expect(createResult.data).toEqual(
        expect.objectContaining({
          payout_profile_id: fixture.payoutProfileId,
          community_id: fixture.communityId,
          requested_by: fixture.owner.id,
          stripe_account_id: fixture.stripeAccountId,
          stripe_payout_id: createInput.stripe_payout_id,
          amount: 3400,
          currency: "jpy",
          status: "created",
          idempotency_key: createInput.idempotency_key,
        })
      );

      const updateResult = await fixture.adminClient
        .from("payout_requests")
        .update({
          status: "paid",
          failure_code: null,
          failure_message: null,
        })
        .eq("id", createResult.data!.id)
        .select(PAYOUT_REQUEST_SELECT)
        .single();
      const updatedRow = await getPayoutRequestById(fixture.adminClient, createResult.data!.id);

      expect(updateResult.error).toBeNull();
      expect(updateResult.data).toEqual(
        expect.objectContaining({
          id: createResult.data!.id,
          status: "paid",
          failure_code: null,
          failure_message: null,
        })
      );
      expect(updatedRow).toEqual(updateResult.data);
    });
  });
});
