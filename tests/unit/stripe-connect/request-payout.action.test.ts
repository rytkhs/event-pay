import { revalidatePath, revalidateTag } from "next/cache";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { resolveCurrentCommunityForServerComponent } from "@core/community/current-community";

import { requestPayoutAction } from "@features/stripe-connect/actions/request-payout";

import { expectActionFailure, expectActionSuccess } from "@tests/helpers/assert-result";
import {
  createPayoutContextFixture,
  getPayoutRequestById,
  listPayoutRequests,
  type PayoutContextFixture,
} from "@tests/helpers/stripe-connect-payout-fixtures";
import { installStripePayoutSdkDouble } from "@tests/helpers/stripe-payout-sdk-double";

const mockStripeDouble = installStripePayoutSdkDouble();
const mockResolveCurrentCommunityForServerComponent = jest.fn();

jest.mock("@core/stripe/client", () => ({
  getStripe: jest.fn(() => mockStripeDouble.stripe),
  generateIdempotencyKey: jest.fn((prefix?: string) => `${prefix ?? "key"}_action_idempotency_key`),
}));

jest.mock("@core/community/current-community", () => ({
  resolveCurrentCommunityForServerComponent: (...args: unknown[]) =>
    mockResolveCurrentCommunityForServerComponent(...args),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

describe("requestPayoutAction", () => {
  let ctx: PayoutContextFixture;

  beforeEach(async () => {
    ctx = await createPayoutContextFixture({ emailPrefix: "request-payout-action" });
    mockStripeDouble.setBalance({
      available: [{ amount: 2400, currency: "jpy", source_types: { card: 2400 } }],
    });
    mockStripeDouble.setPayoutResponse({
      id: "po_action_created",
      amount: 2400,
      status: "pending",
    });
    jest.mocked(getCurrentUserForServerAction).mockResolvedValue({
      id: ctx.user.id,
      email: ctx.user.email,
    } as any);
    mockResolveCurrentCommunityForServerComponent.mockResolvedValue({
      currentCommunity: { id: ctx.communityId, name: "Action Community", slug: "action-community" },
    });
  });

  afterEach(async () => {
    await ctx?.cleanup();
    mockStripeDouble.reset();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  // UI境界の成功レスポンス契約を固定する
  it("現在のコミュニティで入金要求に成功した時、payoutRequestIdとamountとstatusを含む成功ActionResultを返すこと", async () => {
    const result = await requestPayoutAction();

    const data = expectActionSuccess(result);
    const row = await getPayoutRequestById(ctx, data.payoutRequestId);
    expect(data).toEqual(
      expect.objectContaining({
        payoutRequestId: expect.any(String),
        amount: 2400,
        status: "pending",
        stripePayoutId: "po_action_created",
      })
    );
    expect(row).toEqual(
      expect.objectContaining({
        amount: 2400,
        stripe_payout_id: "po_action_created",
        status: "pending",
      })
    );
    expect(revalidateTag).toHaveBeenCalledWith("stripe-balance");
    expect(revalidateTag).toHaveBeenCalledWith(`stripe-balance-${ctx.stripeAccountId}`);
    expect(revalidatePath).toHaveBeenCalledWith("/settings/payments");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  // 認証なしでは実行できないことを固定する
  it("ログインユーザーを解決できない時、入金要求を実行せず失敗ActionResultを返すこと", async () => {
    jest.mocked(getCurrentUserForServerAction).mockResolvedValue(null);

    const result = await requestPayoutAction();

    const error = expectActionFailure(result);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(await listPayoutRequests(ctx)).toHaveLength(0);
    expect(mockStripeDouble.payoutCreateCalls).toHaveLength(0);
  });

  // コミュニティ未選択時の境界契約を固定する
  it("現在のコミュニティを解決できない時、入金要求を実行せず失敗ActionResultを返すこと", async () => {
    mockResolveCurrentCommunityForServerComponent.mockResolvedValue({ currentCommunity: null });

    const result = await requestPayoutAction();

    const error = expectActionFailure(result);
    expect(error.code).toBe("NOT_FOUND");
    expect(await listPayoutRequests(ctx)).toHaveLength(0);
    expect(mockStripeDouble.payoutCreateCalls).toHaveLength(0);
    expect(mockResolveCurrentCommunityForServerComponent).toHaveBeenCalled();
  });

  // 内部AppResultをUI向けActionResultへ投影することを固定する
  it("PayoutRequestServiceが失敗Resultを返した時、userMessageを含む失敗ActionResultを返すこと", async () => {
    mockStripeDouble.setAccount({ payouts_enabled: false });

    const result = await requestPayoutAction();

    const error = expectActionFailure(result);
    expect(error.code).toBe("CONNECT_ACCOUNT_RESTRICTED");
    expect(error.userMessage).toBe("入金を実行できる状態ではありません。");
    expect(await listPayoutRequests(ctx)).toHaveLength(0);
    expect(mockStripeDouble.payoutCreateCalls).toHaveLength(0);
  });

  // Action境界で例外を握りつぶさず契約に変換することを固定する
  it("想定外のエラーが発生した時、INTERNAL_ERRORの失敗ActionResultを返すこと", async () => {
    mockResolveCurrentCommunityForServerComponent.mockRejectedValueOnce(
      new Error("current community exploded")
    );

    const result = await requestPayoutAction();

    const error = expectActionFailure(result);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(await listPayoutRequests(ctx)).toHaveLength(0);
    expect(mockStripeDouble.payoutCreateCalls).toHaveLength(0);
  });
});
