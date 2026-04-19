import type { RequirementsSummary } from "@features/stripe-connect";
import { StripeConnectError, StripeConnectErrorType } from "@features/stripe-connect";
import { StripeConnectService } from "@features/stripe-connect/server";

type MaybeSingleResult = {
  data: unknown;
  error: unknown;
};

type SelectResult = {
  data: unknown;
  error: unknown;
};

const sampleRequirementsSummary: RequirementsSummary = {
  account: {
    currently_due: [],
    past_due: [],
    eventually_due: ["individual.verification.document"],
    pending_verification: [],
  },
  transfers: {
    currently_due: [],
    past_due: [],
    eventually_due: [],
    pending_verification: [],
  },
  review_state: "none",
};

const sampleRequirementsSummaryJson = {
  account: {
    currently_due: [],
    past_due: [],
    eventually_due: ["individual.verification.document"],
    pending_verification: [],
    disabled_reason: null,
    current_deadline: null,
  },
  transfers: {
    currently_due: [],
    past_due: [],
    eventually_due: [],
    pending_verification: [],
    disabled_reason: null,
    current_deadline: null,
  },
  review_state: "none",
};

function createSupabaseMock(config: {
  currentAccountResult: MaybeSingleResult;
  updateResult?: SelectResult;
  conflictCheckResult?: MaybeSingleResult;
  upsertResult?: SelectResult;
}) {
  const calls = {
    currentAccountLookups: [] as Array<{ column: string; value: string }>,
    updatePayloads: [] as unknown[],
    updateFilters: [] as Array<{ column: string; value: string }>,
    conflictChecks: [] as Array<{ column: string; value: string }>,
    upserts: [] as Array<{ payload: unknown; options: unknown }>,
    communityUpdates: [] as Array<{
      payload: unknown;
      filters: Array<{ column: string; value: unknown }>;
      or?: string;
    }>,
  };

  const supabase = {
    from: jest.fn((table: string) => {
      if (table === "payout_profiles") {
        return {
          select: jest.fn((columns: string) => {
            if (columns === "id, owner_user_id, status, stripe_account_id") {
              return {
                eq: jest.fn((column: string, value: string) => ({
                  maybeSingle: jest.fn().mockImplementation(async () => {
                    calls.currentAccountLookups.push({ column, value });
                    return config.currentAccountResult;
                  }),
                })),
              };
            }

            if (columns === "owner_user_id") {
              return {
                eq: jest.fn((column: string, value: string) => ({
                  maybeSingle: jest.fn().mockImplementation(async () => {
                    calls.conflictChecks.push({ column, value });
                    return config.conflictCheckResult ?? { data: null, error: null };
                  }),
                })),
              };
            }

            throw new Error(`unexpected payout_profiles select: ${columns}`);
          }),
          update: jest.fn((payload: unknown) => {
            calls.updatePayloads.push(payload);

            return {
              eq: jest.fn((column: string, value: string) => {
                calls.updateFilters.push({ column, value });

                return {
                  select: jest
                    .fn()
                    .mockResolvedValue(config.updateResult ?? { data: [], error: null }),
                };
              }),
            };
          }),
          upsert: jest.fn((payload: unknown, options: unknown) => {
            calls.upserts.push({ payload, options });

            return {
              select: jest.fn().mockResolvedValue(
                config.upsertResult ?? {
                  data: [{ id: "profile-inserted", owner_user_id: "user-1" }],
                  error: null,
                }
              ),
            };
          }),
        };
      }

      if (table === "communities") {
        return {
          update: jest.fn((payload: unknown) => {
            const communityUpdate = {
              payload,
              filters: [] as Array<{ column: string; value: unknown }>,
              or: undefined as string | undefined,
            };
            calls.communityUpdates.push(communityUpdate);

            return {
              eq: jest.fn((column: string, value: unknown) => {
                communityUpdate.filters.push({ column, value });

                return {
                  eq: jest.fn((nestedColumn: string, nestedValue: unknown) => {
                    communityUpdate.filters.push({ column: nestedColumn, value: nestedValue });

                    return {
                      or: jest.fn().mockImplementation(async (expression: string) => {
                        communityUpdate.or = expression;
                        return { error: null };
                      }),
                    };
                  }),
                };
              }),
            };
          }),
        };
      }

      throw new Error(`unexpected table: ${table}`);
    }),
  };

  return {
    supabase,
    calls,
  };
}

function createErrorHandlerMock() {
  return {
    handleError: jest.fn(),
    mapStripeError: jest.fn(),
    mapDatabaseError: jest
      .fn()
      .mockImplementation(
        (error: Error, context: string) => new Error(`${context}: ${error.message}`)
      ),
  } as any;
}

async function expectStripeConnectError(
  promise: Promise<unknown>,
  expectedType: StripeConnectErrorType
) {
  try {
    await promise;
    throw new Error("expected StripeConnectError to be thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(StripeConnectError);
    expect(error).toMatchObject({
      type: expectedType,
    });
  }
}

describe("StripeConnectService.updateAccountStatus", () => {
  it("fails closed when payoutProfileId resolves to a different stripeAccountId", async () => {
    const { supabase, calls } = createSupabaseMock({
      currentAccountResult: {
        data: {
          id: "profile-1",
          owner_user_id: "550e8400-e29b-41d4-a716-446655440000",
          status: "verified",
          stripe_account_id: "acct_current",
        },
        error: null,
      },
    });
    const service = new StripeConnectService(supabase as never, createErrorHandlerMock());

    await expectStripeConnectError(
      service.updateAccountStatus({
        payoutProfileId: "profile-1",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        stripeAccountId: "acct_other",
        status: "verified",
        payoutsEnabled: true,
      }),
      StripeConnectErrorType.VALIDATION_ERROR
    );

    expect(calls.updatePayloads).toHaveLength(0);
    expect(calls.upserts).toHaveLength(0);
    expect(calls.communityUpdates).toHaveLength(0);
  });

  it("fails closed when stripeAccountId resolves to a different owner userId", async () => {
    const { supabase, calls } = createSupabaseMock({
      currentAccountResult: {
        data: {
          id: "profile-1",
          owner_user_id: "660e8400-e29b-41d4-a716-446655440000",
          status: "verified",
          stripe_account_id: "acct_current",
        },
        error: null,
      },
    });
    const service = new StripeConnectService(supabase as never, createErrorHandlerMock());

    await expectStripeConnectError(
      service.updateAccountStatus({
        userId: "770e8400-e29b-41d4-a716-446655440000",
        stripeAccountId: "acct_current",
        status: "verified",
        payoutsEnabled: true,
      }),
      StripeConnectErrorType.VALIDATION_ERROR
    );

    expect(calls.updatePayloads).toHaveLength(0);
    expect(calls.upserts).toHaveLength(0);
    expect(calls.communityUpdates).toHaveLength(0);
  });

  it("does not upsert when an explicit payoutProfileId does not exist", async () => {
    const { supabase, calls } = createSupabaseMock({
      currentAccountResult: {
        data: null,
        error: null,
      },
    });
    const service = new StripeConnectService(supabase as never, createErrorHandlerMock());

    await expectStripeConnectError(
      service.updateAccountStatus({
        payoutProfileId: "0f2f36b2-29d9-4894-9d1a-d4cfdf793c5d",
        userId: "8f0d2d8a-0a9d-452a-bf98-f15fc651c01c",
        stripeAccountId: "acct_missing",
        status: "unverified",
        payoutsEnabled: false,
      }),
      StripeConnectErrorType.ACCOUNT_NOT_FOUND
    );

    expect(calls.updatePayloads).toHaveLength(0);
    expect(calls.upserts).toHaveLength(0);
    expect(calls.communityUpdates).toHaveLength(0);
  });

  it("keeps the fail-safe upsert path for userId plus stripeAccountId without payoutProfileId", async () => {
    const { supabase, calls } = createSupabaseMock({
      currentAccountResult: {
        data: null,
        error: null,
      },
      updateResult: {
        data: [],
        error: null,
      },
      conflictCheckResult: {
        data: null,
        error: null,
      },
      upsertResult: {
        data: [{ id: "profile-inserted", owner_user_id: "550e8400-e29b-41d4-a716-446655440000" }],
        error: null,
      },
    });
    const service = new StripeConnectService(supabase as never, createErrorHandlerMock());

    await service.updateAccountStatus({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      stripeAccountId: "acct_inserted",
      status: "unverified",
      payoutsEnabled: false,
      transfersStatus: "inactive",
      requirementsDisabledReason: "requirements.past_due",
      requirementsSummary: sampleRequirementsSummary,
    });

    expect(calls.updatePayloads).toHaveLength(1);
    expect(calls.updatePayloads[0]).toEqual(
      expect.objectContaining({
        status: "unverified",
        collection_ready: false,
        payouts_enabled: false,
        transfers_status: "inactive",
        requirements_disabled_reason: "requirements.past_due",
        requirements_summary: sampleRequirementsSummaryJson,
        stripe_status_synced_at: expect.any(String),
        updated_at: expect.any(String),
      })
    );
    expect(calls.updateFilters).toEqual([
      { column: "id", value: "00000000-0000-0000-0000-000000000000" },
    ]);
    expect(calls.conflictChecks).toEqual([{ column: "stripe_account_id", value: "acct_inserted" }]);
    expect(calls.upserts).toHaveLength(1);
    expect(calls.upserts[0]?.payload).toEqual(
      expect.objectContaining({
        owner_user_id: "550e8400-e29b-41d4-a716-446655440000",
        stripe_account_id: "acct_inserted",
        status: "unverified",
        collection_ready: false,
        payouts_enabled: false,
        transfers_status: "inactive",
        requirements_disabled_reason: "requirements.past_due",
        requirements_summary: sampleRequirementsSummaryJson,
        stripe_status_synced_at: expect.any(String),
        updated_at: expect.any(String),
      })
    );
    expect(calls.communityUpdates).toHaveLength(1);
  });

  it("updates an existing payout profile when all identifiers are aligned", async () => {
    const { supabase, calls } = createSupabaseMock({
      currentAccountResult: {
        data: {
          id: "profile-1",
          owner_user_id: "550e8400-e29b-41d4-a716-446655440000",
          status: "verified",
          stripe_account_id: "acct_aligned",
        },
        error: null,
      },
      updateResult: {
        data: [{ id: "profile-1", owner_user_id: "550e8400-e29b-41d4-a716-446655440000" }],
        error: null,
      },
    });
    const service = new StripeConnectService(supabase as never, createErrorHandlerMock());

    await service.updateAccountStatus({
      payoutProfileId: "profile-1",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      stripeAccountId: "acct_aligned",
      status: "verified",
      collectionReady: true,
      payoutsEnabled: true,
      transfersStatus: "active",
      requirementsSummary: sampleRequirementsSummary,
    });

    expect(calls.updatePayloads).toHaveLength(1);
    expect(calls.updatePayloads[0]).toEqual(
      expect.objectContaining({
        status: "verified",
        collection_ready: true,
        payouts_enabled: true,
        transfers_status: "active",
        requirements_summary: sampleRequirementsSummaryJson,
        stripe_status_synced_at: expect.any(String),
        updated_at: expect.any(String),
      })
    );
    expect(calls.upserts).toHaveLength(0);
    expect(calls.communityUpdates).toHaveLength(1);
  });

  it("clears nullable Stripe state cache columns when null is provided", async () => {
    const { supabase, calls } = createSupabaseMock({
      currentAccountResult: {
        data: {
          id: "profile-1",
          owner_user_id: "550e8400-e29b-41d4-a716-446655440000",
          status: "restricted",
          stripe_account_id: "acct_aligned",
        },
        error: null,
      },
      updateResult: {
        data: [{ id: "profile-1", owner_user_id: "550e8400-e29b-41d4-a716-446655440000" }],
        error: null,
      },
    });
    const service = new StripeConnectService(supabase as never, createErrorHandlerMock());

    await service.updateAccountStatus({
      payoutProfileId: "profile-1",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      stripeAccountId: "acct_aligned",
      status: "verified",
      collectionReady: true,
      payoutsEnabled: true,
      transfersStatus: null,
      requirementsDisabledReason: null,
      requirementsSummary: sampleRequirementsSummary,
    });

    expect(calls.updatePayloads[0]).toEqual(
      expect.objectContaining({
        transfers_status: null,
        requirements_disabled_reason: null,
      })
    );
  });

  it("derives collection_ready from verified status when collectionReady is omitted", async () => {
    const { supabase, calls } = createSupabaseMock({
      currentAccountResult: {
        data: {
          id: "profile-1",
          owner_user_id: "550e8400-e29b-41d4-a716-446655440000",
          status: "verified",
          stripe_account_id: "acct_aligned",
        },
        error: null,
      },
      updateResult: {
        data: [{ id: "profile-1", owner_user_id: "550e8400-e29b-41d4-a716-446655440000" }],
        error: null,
      },
    });
    const service = new StripeConnectService(supabase as never, createErrorHandlerMock());

    await service.updateAccountStatus({
      payoutProfileId: "profile-1",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      stripeAccountId: "acct_aligned",
      status: "verified",
      payoutsEnabled: false,
    });

    expect(calls.updatePayloads[0]).toEqual(
      expect.objectContaining({
        status: "verified",
        collection_ready: true,
        payouts_enabled: false,
      })
    );
  });
});
