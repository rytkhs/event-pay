import { jest } from "@jest/globals";

import { AppError } from "@core/errors/app-error";
import { errResult, okResult } from "@core/errors/app-result";

import { getFutureDateTimeLocal } from "../../helpers/test-datetime";

const mockGetCurrentUserForServerAction = jest.fn();
const mockResolveCurrentCommunityForServerAction = jest.fn();
const mockCreateServerActionSupabaseClient = jest.fn();
const mockGetEventPayoutProfileReadiness = jest.fn();
const mockLogEventManagement = jest.fn();
const mockHandleServerError = jest.fn();
const mockRevalidatePath = jest.fn();

jest.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}));

jest.mock("@core/auth/auth-utils", () => ({
  getCurrentUserForServerAction: mockGetCurrentUserForServerAction,
}));

jest.mock("@core/community/current-community", () => ({
  resolveCurrentCommunityForServerAction: mockResolveCurrentCommunityForServerAction,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerActionSupabaseClient: mockCreateServerActionSupabaseClient,
}));

jest.mock("@core/logging/system-logger", () => ({
  logEventManagement: mockLogEventManagement,
}));

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: mockHandleServerError,
}));

jest.mock("@features/events/services/payout-profile-readiness", () => ({
  getEventPayoutProfileReadiness: mockGetEventPayoutProfileReadiness,
}));

function buildValidFormData(
  overrides: {
    capacity?: string;
    fee?: string;
    paymentMethods?: string[];
    showCapacity?: boolean;
  } = {}
): FormData {
  const formData = new FormData();
  formData.set("title", "春合宿");
  formData.set("date", getFutureDateTimeLocal(96));
  formData.set("fee", overrides.fee ?? "1500");
  formData.set("location", "渋谷");
  formData.set("description", "新歓イベント");
  formData.set("registration_deadline", getFutureDateTimeLocal(24));
  formData.set("payment_deadline", getFutureDateTimeLocal(48));
  if (overrides.capacity !== undefined) {
    formData.set("capacity", overrides.capacity);
  }
  if (overrides.showCapacity !== undefined) {
    formData.set("show_capacity", String(overrides.showCapacity));
  }

  for (const method of overrides.paymentMethods ?? ["cash"]) {
    formData.append("payment_methods", method);
  }

  return formData;
}

function createSupabaseMock(options: {
  currentPayoutProfileId: string | null;
  createdEvent?: Record<string, unknown>;
}) {
  const insertedRows: unknown[] = [];
  const eventsQuery = {
    insert: jest.fn(async (row: unknown) => {
      insertedRows.push(row);
      return { error: null };
    }),
    select: jest.fn(() => eventsQuery),
    eq: jest.fn(() => ({
      single: jest.fn(async () => ({
        data: options.createdEvent ?? {
          id: (insertedRows[0] as Record<string, unknown> | undefined)?.id ?? "event-1",
          community_id: (insertedRows[0] as Record<string, unknown> | undefined)?.community_id,
          payout_profile_id: (insertedRows[0] as Record<string, unknown> | undefined)
            ?.payout_profile_id,
        },
        error: null,
      })),
    })),
  };

  const communitiesQuery = {
    select: jest.fn(() => communitiesQuery),
    eq: jest.fn(() => communitiesQuery),
    maybeSingle: jest.fn(async () => ({
      data: {
        id: "community-1",
        current_payout_profile_id: options.currentPayoutProfileId,
      },
      error: null,
    })),
  };

  const supabase = {
    from: jest.fn((table: string) => {
      if (table === "communities") {
        return communitiesQuery;
      }
      if (table === "events") {
        return eventsQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    eventsQuery,
    insertedRows,
    supabase,
  };
}

describe("createEventAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserForServerAction.mockResolvedValue({ id: "user-1" });
    mockResolveCurrentCommunityForServerAction.mockResolvedValue(
      okResult({
        currentCommunity: {
          createdAt: "2026-03-20T00:00:00.000Z",
          id: "community-1",
          name: "ボドゲ会",
          slug: "board-games",
        },
        ownedCommunities: [],
        requestedCommunityId: "community-1",
        resolvedBy: "cookie",
      })
    );
    mockGetEventPayoutProfileReadiness.mockResolvedValue({ isReady: true });
  });

  it("current community 解決失敗は ActionResult の失敗へ投影する", async () => {
    mockResolveCurrentCommunityForServerAction.mockResolvedValue(
      errResult(
        new AppError("DATABASE_ERROR", {
          userMessage: "resolver failed",
          retryable: true,
        })
      )
    );

    const { createEventAction } = await import("@/features/events/actions/create-event");
    const result = await createEventAction(buildValidFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("DATABASE_ERROR");
      expect(result.error.userMessage).toBe(
        "イベントの作成に必要なコミュニティ情報を取得できませんでした"
      );
      expect(result.error.retryable).toBe(true);
    }
    expect(mockCreateServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  it("paid + stripe は current community の payout readiness が未完了なら fail-close する", async () => {
    const { supabase, eventsQuery } = createSupabaseMock({
      currentPayoutProfileId: null,
    });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);
    mockGetEventPayoutProfileReadiness.mockResolvedValue({
      isReady: false,
      userMessage:
        "受取先プロファイルが設定されていないため、オンライン決済を有効化できません。Stripe設定を確認してから再試行してください。",
    });

    const { createEventAction } = await import("@/features/events/actions/create-event");
    const result = await createEventAction(
      buildValidFormData({ paymentMethods: ["stripe"], fee: "2500" })
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fieldErrors).toEqual({
        payment_methods: [
          "受取先プロファイルが設定されていないため、オンライン決済を有効化できません。Stripe設定を確認してから再試行してください。",
        ],
      });
    }
    expect(mockGetEventPayoutProfileReadiness).toHaveBeenCalledWith(supabase, null);
    expect(eventsQuery.insert).not.toHaveBeenCalled();
  });

  it("cash-only の有料イベントは payout profile 未設定でも作成でき、community snapshot を保存する", async () => {
    const { supabase, insertedRows } = createSupabaseMock({
      currentPayoutProfileId: null,
    });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);

    const { createEventAction } = await import("@/features/events/actions/create-event");
    const result = await createEventAction(
      buildValidFormData({ paymentMethods: ["cash"], fee: "2500" })
    );

    expect(result.success).toBe(true);
    expect(mockGetEventPayoutProfileReadiness).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      community_id: "community-1",
      payout_profile_id: null,
      created_by: "user-1",
      payment_methods: ["cash"],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/events");
  });

  it("current community の payout profile があれば snapshot を保存する", async () => {
    const { supabase, insertedRows } = createSupabaseMock({
      currentPayoutProfileId: "payout-profile-1",
    });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);

    const { createEventAction } = await import("@/features/events/actions/create-event");
    const result = await createEventAction(
      buildValidFormData({ paymentMethods: ["stripe", "cash"], fee: "2500" })
    );

    expect(result.success).toBe(true);
    expect(mockGetEventPayoutProfileReadiness).toHaveBeenCalledWith(supabase, "payout-profile-1");
    expect(insertedRows[0]).toMatchObject({
      community_id: "community-1",
      payout_profile_id: "payout-profile-1",
      payment_methods: ["stripe", "cash"],
    });
  });

  it("定員ありで show_capacity=true の場合は定員表示設定を保存する", async () => {
    const { supabase, insertedRows } = createSupabaseMock({
      currentPayoutProfileId: null,
    });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);

    const { createEventAction } = await import("@/features/events/actions/create-event");
    const result = await createEventAction(
      buildValidFormData({ capacity: "30", showCapacity: true })
    );

    expect(result.success).toBe(true);
    expect(insertedRows[0]).toMatchObject({
      capacity: 30,
      show_capacity: true,
    });
  });

  it("定員なしでは show_capacity=true が送信されても false に正規化する", async () => {
    const { supabase, insertedRows } = createSupabaseMock({
      currentPayoutProfileId: null,
    });
    mockCreateServerActionSupabaseClient.mockResolvedValue(supabase);

    const { createEventAction } = await import("@/features/events/actions/create-event");
    const result = await createEventAction(buildValidFormData({ showCapacity: true }));

    expect(result.success).toBe(true);
    expect(insertedRows[0]).toMatchObject({
      capacity: null,
      show_capacity: false,
    });
  });
});
