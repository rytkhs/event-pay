import Stripe from "stripe";

import { PayoutRequestService } from "@features/stripe-connect/services/payout-request-service";
import { StripeConnectErrorHandler, StripeConnectService } from "@features/stripe-connect/server";

import { expectAppFailure, expectAppSuccess } from "@tests/helpers/assert-result";
import {
  buildPayout,
  createPayoutContextFixture,
  createPayoutRequestFixture,
  getPayoutRequestById,
  listPayoutRequests,
  type PayoutContextFixture,
  type PayoutRequestFixture,
} from "@tests/helpers/stripe-connect-payout-fixtures";
import { installStripePayoutSdkDouble } from "@tests/helpers/stripe-payout-sdk-double";

const stripeDouble = installStripePayoutSdkDouble();
const EXPIRED_IDEMPOTENCY_FAILURE_CODE = "idempotency_key_expired";

jest.mock("@core/stripe/client", () => ({
  getStripe: jest.fn(() => stripeDouble.stripe),
  generateIdempotencyKey: jest.fn((prefix?: string) => `${prefix ?? "key"}_fixed_idempotency_key`),
}));

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

describe("PayoutRequestService", () => {
  let ctx: PayoutContextFixture;
  let service: PayoutRequestService;

  afterEach(async () => {
    await ctx?.cleanup();
    stripeDouble.reset();
    jest.clearAllMocks();
  });

  describe("getFreshPayoutBalance", () => {
    beforeEach(async () => {
      ctx = await createPayoutContextFixture({ emailPrefix: "fresh-balance" });
      service = new PayoutRequestService(ctx.adminClient);
    });

    // Stripe Payoutはsource_type: cardで作成するため、表示・実行可能額もcard source残高に揃える
    it("JPYのcard source available残高とpending残高が存在する時、availableAmountとpendingAmountを分離して返すこと", async () => {
      stripeDouble.setBalance({
        available: [{ amount: 1200, currency: "jpy", source_types: { card: 1200 } }],
        pending: [{ amount: 800, currency: "jpy", source_types: { card: 800 } }],
      });

      const result = await service.getFreshPayoutBalance(ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(result).toEqual(
        expect.objectContaining({
          data: { availableAmount: 1200, pendingAmount: 800, currency: "jpy" },
        })
      );
      expect(stripeDouble.balanceRetrieveCalls[0]?.options).toEqual(
        expect.objectContaining({ stripeAccount: ctx.stripeAccountId })
      );
    });

    // pendingは入金可能額に含めないことを固定する
    it("JPYのpending残高のみが存在する時、availableAmountは0でpendingAmountのみを返すこと", async () => {
      stripeDouble.setBalance({
        pending: [{ amount: 900, currency: "jpy", source_types: { card: 900 } }],
      });

      const result = await service.getFreshPayoutBalance(ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(result).toEqual(
        expect.objectContaining({
          data: { availableAmount: 0, pendingAmount: 900, currency: "jpy" },
        })
      );
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // 通貨違いの残高を誤ってJPYとして扱わないことを固定する
    it("JPY以外の残高のみが存在する時、JPYのavailableAmountとpendingAmountはいずれも0であること", async () => {
      stripeDouble.setBalance({
        available: [{ amount: 1200, currency: "usd" }],
        pending: [{ amount: 800, currency: "eur" }],
      });

      const result = await service.getFreshPayoutBalance(ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(result).toEqual(
        expect.objectContaining({
          data: { availableAmount: 0, pendingAmount: 0, currency: "jpy" },
        })
      );
    });

    // 通貨合算額ではなく、Payout作成時に指定するcard sourceの残高を使うことを固定する
    it("JPYのavailable合算額にcard以外が含まれる時、availableAmountはcard source残高だけを返すこと", async () => {
      stripeDouble.setBalance({
        available: [
          { amount: 1800, currency: "jpy", source_types: { card: 1200, bank_account: 600 } },
        ],
        pending: [{ amount: 900, currency: "jpy", source_types: { card: 700, bank_account: 200 } }],
      });

      const result = await service.getFreshPayoutBalance(ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(result).toEqual(
        expect.objectContaining({
          data: { availableAmount: 1200, pendingAmount: 700, currency: "jpy" },
        })
      );
    });

    // Stripe API障害時のResult契約を固定する
    it("Stripe残高取得に失敗した時、例外を外へ投げず失敗Resultを返すこと", async () => {
      stripeDouble.setBalanceError(new Error("stripe balance failed"));

      const result = await service.getFreshPayoutBalance(ctx.stripeAccountId);

      const failure = expectAppFailure(result);
      expect(failure.error.code).toBe("STRIPE_CONNECT_SERVICE_ERROR");
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });
  });

  describe("requestPayout", () => {
    beforeEach(async () => {
      ctx = await createPayoutContextFixture({ emailPrefix: "request-payout" });
      service = new PayoutRequestService(ctx.adminClient);
      stripeDouble.setBalance({
        available: [{ amount: 1500, currency: "jpy", source_types: { card: 1500 } }],
      });
      stripeDouble.setPayoutResponse({
        id: "po_test_created",
        amount: 1500,
        status: "pending",
      });
    });

    // 正常系の最小成功条件を固定する
    it("入金可能なpayout_profileとavailable残高が存在する時、available全額のpayout_requestを作成してStripe Payoutを作成すること", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      const row = await getPayoutRequestById(ctx, success.data.payoutRequestId);
      expect(success.data).toEqual(
        expect.objectContaining({ amount: 1500, currency: "jpy", status: "pending" })
      );
      expect(row).toEqual(expect.objectContaining({ amount: 1500, status: "pending" }));
      expect(stripeDouble.payoutCreateCalls).toHaveLength(1);
    });

    // 入金実行可否はDBキャッシュではなくStripe Accountの最新payouts_enabledで判定する
    it("Stripe Accountのpayouts_enabledがfalseの時、Stripe Payoutを作成せず失敗Resultを返すこと", async () => {
      stripeDouble.setAccount({ payouts_enabled: false });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // 対象通貨のdefault外部口座がない時はStripe Payout作成前に止める
    it("JPYのdefault外部銀行口座がない時、Stripe Payoutを作成せず失敗Resultを返すこと", async () => {
      stripeDouble.setExternalAccounts([
        { id: "ba_usd_default", currency: "usd", default_for_currency: true },
      ]);

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const failure = expectAppFailure(result);
      expect(failure.error.code).toBe("CONNECT_ACCOUNT_RESTRICTED");
      expect(failure.error.userMessage).toBe("振込先口座を確認してください。");
      expect(await listPayoutRequests(ctx)).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    it.each(["errored", "verification_failed", "tokenized_account_number_deactivated"])(
      "default外部銀行口座のstatusが%sの時、Stripe Payoutを作成せず失敗Resultを返すこと",
      async (status) => {
        stripeDouble.setExternalAccounts([{ status }]);

        const result = await service.requestPayout({
          userId: ctx.user.id,
          communityId: ctx.communityId,
        });

        const failure = expectAppFailure(result);
        expect(failure.error.code).toBe("CONNECT_ACCOUNT_RESTRICTED");
        expect(failure.error.userMessage).toBe("振込先口座を確認してください。");
        expect(await listPayoutRequests(ctx)).toHaveLength(0);
        expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
      }
    );

    // Payout APIのmethod: standardで利用できない口座はアプリ内入金に使わない
    it("default外部銀行口座のavailable_payout_methodsにstandardがない時、Stripe Payoutを作成しないこと", async () => {
      stripeDouble.setExternalAccounts([{ available_payout_methods: ["instant"] }]);

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const failure = expectAppFailure(result);
      expect(failure.error.code).toBe("CONNECT_ACCOUNT_RESTRICTED");
      expect(await listPayoutRequests(ctx)).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // アプリ内入金は現在のコミュニティの受取先に限定することを固定する
    it("現在のコミュニティにpayout_profileが紐付かない時、Stripe Payoutを作成せず失敗Resultを返すこと", async () => {
      await ctx.adminClient
        .from("communities")
        .update({ current_payout_profile_id: null })
        .eq("id", ctx.communityId);

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // available残高がない場合に空のPayoutを作らないことを固定する
    it("available残高が0円の時、payout_requestもStripe Payoutも作成せず失敗Resultを返すこと", async () => {
      stripeDouble.setBalance({
        available: [{ amount: 0, currency: "jpy", source_types: { card: 0 } }],
      });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // pending残高だけでは入金可能にしないことを固定する
    it("pending残高が存在してavailable残高が0円の時、Stripe Payoutを作成せず失敗Resultを返すこと", async () => {
      stripeDouble.setBalance({
        pending: [{ amount: 1500, currency: "jpy", source_types: { card: 1500 } }],
      });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // 進行中リクエストの二重作成を防ぐことを固定する
    it("同じpayout_profileにrequestingのpayout_requestが存在する時、新しいStripe Payoutを作成せず失敗Resultを返すこと", async () => {
      const existing = await createPayoutRequestFixture(ctx, { status: "requesting" });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toHaveLength(1);
      expect(await getPayoutRequestById(ctx, existing.id)).toEqual(
        expect.objectContaining({ status: "requesting" })
      );
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    it("同じpayout_profileにmanual_review_requiredのpayout_requestが存在する時、新しいStripe Payoutを作成せず失敗Resultを返すこと", async () => {
      const existing = await createPayoutRequestFixture(ctx, {
        status: "manual_review_required",
        failureCode: EXPIRED_IDEMPOTENCY_FAILURE_CODE,
      });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const failure = expectAppFailure(result);
      expect(failure.error.code).toBe("RESOURCE_CONFLICT");
      expect(failure.error.retryable).toBe(false);
      expect(await listPayoutRequests(ctx)).toHaveLength(1);
      expect(await getPayoutRequestById(ctx, existing.id)).toEqual(
        expect.objectContaining({ status: "manual_review_required" })
      );
      expect(stripeDouble.accountRetrieveCalls).toHaveLength(0);
      expect(stripeDouble.externalAccountsListCalls).toHaveLength(0);
      expect(stripeDouble.balanceRetrieveCalls).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // 作成結果不明の再実行は新規行ではなく保存済みidempotency_keyで復旧する
    it("同じpayout_profileにcreation_unknownのpayout_requestが存在する時、保存済みidempotency_keyで復旧すること", async () => {
      await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 1500,
        idempotencyKey: "stored_existing_key",
      });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppSuccess(result);
      expect(await listPayoutRequests(ctx)).toHaveLength(1);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(1);
      expect(stripeDouble.payoutCreateCalls[0]?.options).toEqual(
        expect.objectContaining({ idempotencyKey: "stored_existing_key" })
      );
    });

    // Stripe作成済みのPayoutは履歴扱いにし、freshなavailable残高があれば次の入金を許可する
    it("同じpayout_profileにpendingのpayout_requestのみが存在する時、新しいStripe Payoutを作成できること", async () => {
      await createPayoutRequestFixture(ctx, { status: "pending", stripePayoutId: "po_old" });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppSuccess(result);
      expect(await listPayoutRequests(ctx)).toHaveLength(2);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(1);
    });

    // 入金要求時は履歴状態に関係なくfreshな出金可否を確認する
    it("入金要求前に最新のStripe Accountを確認し、payouts_enabledがfalseならStripe Payoutを作成しないこと", async () => {
      stripeDouble.setAccount({ payouts_enabled: false });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // 支払い済み履歴は次回要求を妨げないことを固定する
    it("同じpayout_profileにpaidのpayout_requestのみが存在する時、新しい入金要求を作成できること", async () => {
      await createPayoutRequestFixture(ctx, { status: "paid", stripePayoutId: "po_paid_old" });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppSuccess(result);
      expect(await listPayoutRequests(ctx)).toHaveLength(2);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(1);
    });

    // Stripe metadataの追跡可能性を固定する
    it("Stripe Payout作成時、payout_request_idとpayout_profile_idとcommunity_idとrequested_byをmetadataに含めること", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });
      const success = expectAppSuccess(result);

      const call = stripeDouble.payoutCreateCalls[0];
      expect(call.params.metadata).toEqual({
        payout_request_id: success.data.payoutRequestId,
        payout_profile_id: ctx.payoutProfileId,
        community_id: ctx.communityId,
        requested_by: ctx.user.id,
      });
      expect(await getPayoutRequestById(ctx, success.data.payoutRequestId)).toBeTruthy();
    });

    // Connectのmanual payoutでは残高source typeを明示し、カード売上以外を誤って入金しない
    it("Stripe Payout作成時、source_typeにcardを指定すること", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppSuccess(result);
      expect(stripeDouble.payoutCreateCalls[0]?.params).toEqual(
        expect.objectContaining({ source_type: "card" })
      );
    });

    // 冪等性キーの永続化を固定する
    it("Stripe Payout作成時、保存済みpayout_requestのidempotency_keyをStripeリクエストに使用すること", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });
      const success = expectAppSuccess(result);
      const row = await getPayoutRequestById(ctx, success.data.payoutRequestId);

      expect(row?.idempotency_key).toBe("payout_fixed_idempotency_key");
      expect(stripeDouble.payoutCreateCalls[0]?.options).toEqual(
        expect.objectContaining({ idempotencyKey: row?.idempotency_key })
      );
    });

    // DB作成後にStripe作成成功した場合の状態遷移を固定する
    it("Stripe Payout作成に成功した時、payout_requestをpendingに更新しstripe_payout_idを保存すること", async () => {
      stripeDouble.setPayoutResponse({ id: "po_created_contract", status: "pending" });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });
      const success = expectAppSuccess(result);

      expect(await getPayoutRequestById(ctx, success.data.payoutRequestId)).toEqual(
        expect.objectContaining({ stripe_payout_id: "po_created_contract", status: "pending" })
      );
    });

    // active requestはrequesting / creation_unknown / manual_review_requiredのみとし、同時クリックを単一に収束させる
    it("同じpayout_profileへの入金要求が同時実行された時、作成されるactiveなpayout_requestとStripe Payoutは1件だけであること", async () => {
      const [first, second] = await Promise.all([
        service.requestPayout({ userId: ctx.user.id, communityId: ctx.communityId }),
        service.requestPayout({ userId: ctx.user.id, communityId: ctx.communityId }),
      ]);

      const results = [first, second];
      expect(results.filter((result) => result.success)).toHaveLength(1);
      expect(
        (await listPayoutRequests(ctx)).filter((row) => row.status === "requesting")
      ).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(1);
    });

    // Stripe API前のDB作成失敗時に外部副作用を起こさないことを固定する
    it("payout_requestの作成に失敗した時、Stripe Payoutを作成せず失敗Resultを返すこと", async () => {
      await ctx.adminClient.from("payout_profiles").delete().eq("id", ctx.payoutProfileId);

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // Stripeの業務エラー時の状態を固定する
    it("Stripe Payout作成がinsufficient_fundsで失敗した時、payout_requestをfailedに更新して失敗Resultを返すこと", async () => {
      stripeDouble.setPayoutError(
        new Stripe.errors.StripeInvalidRequestError({
          message: "insufficient funds",
          code: "insufficient_funds",
        } as any)
      );

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toEqual([
        expect.objectContaining({ status: "failed", failure_code: "insufficient_funds" }),
      ]);

      const panelResult = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });
      const panelSuccess = expectAppSuccess(panelResult);
      expect(panelSuccess.data.latestRequest).toEqual(
        expect.objectContaining({
          status: "failed",
          failureCode: "insufficient_funds",
        })
      );
    });

    it("Stripe Payout作成失敗後のpayout_request更新に失敗した時、永続化失敗のResultを返すこと", async () => {
      const persistError = new Error("persist failed");
      const eq = jest.fn(async () => ({ error: persistError }));
      const update = jest.fn(() => ({ eq }));
      const from = jest.fn(() => ({ update }));
      const failureService = new PayoutRequestService({ from } as any);

      const result = await (failureService as any).markPayoutCreationFailure({
        payoutRequestId: "00000000-0000-0000-0000-000000000000",
        stripeError: new Stripe.errors.StripeInvalidRequestError({
          message: "insufficient funds",
          code: "insufficient_funds",
        } as any),
        failureMessageFallback: "Payout creation failed",
        failedUserMessage: "振込リクエストの作成に失敗しました。",
      });

      const failure = expectAppFailure(result);
      expect(failure.error.code).toBe("STRIPE_CONNECT_SERVICE_ERROR");
      expect(failure.error.message).toBe("persist failed");
      expect(failure.error.userMessage).not.toBe("振込リクエストの作成に失敗しました。");
      expect(from).toHaveBeenCalledWith("payout_requests");
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", failure_code: "insufficient_funds" })
      );
      expect(eq).toHaveBeenCalledWith("id", "00000000-0000-0000-0000-000000000000");
    });

    // ネットワーク不定状態の扱いを固定する
    it("Stripe Payout作成結果がネットワークエラーで不明な時、payout_requestをcreation_unknownに更新して失敗Resultを返すこと", async () => {
      stripeDouble.setPayoutError(
        new Stripe.errors.StripeConnectionError({ message: "network failed" } as any)
      );

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toEqual([
        expect.objectContaining({ status: "creation_unknown", failure_message: "network failed" }),
      ]);
    });

    it("Stripe Payout作成がRate Limitで失敗した時、payout_requestをfailedに更新してretryableな失敗Resultを返すこと", async () => {
      stripeDouble.setPayoutError(
        new Stripe.errors.StripeRateLimitError({ message: "rate limited" } as any)
      );

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const failure = expectAppFailure(result);
      expect(failure.error.code).toBe("RATE_LIMITED");
      expect(failure.error.retryable).toBe(true);
      expect(await listPayoutRequests(ctx)).toEqual([
        expect.objectContaining({ status: "failed", failure_message: "rate limited" }),
      ]);
    });

    // creation_unknownは新規作成ではなく同じidempotency_keyで復旧する。Stripeの冪等性キーは少なくとも24時間後にpruneされ得る。
    it("creation_unknownのpayout_requestを復旧する時、available残高が0でも保存済みidempotency_keyでStripe Payout作成を再試行すること", async () => {
      await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 1500,
        idempotencyKey: "stored_recovery_key",
      });
      stripeDouble.setBalance({
        available: [{ amount: 0, currency: "jpy", source_types: { card: 0 } }],
      });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppSuccess(result);
      expect(stripeDouble.payoutCreateCalls[0]?.options).toEqual(
        expect.objectContaining({ idempotencyKey: "stored_recovery_key" })
      );
    });

    // 復旧時もfreshな外部口座状態を確認し、無効化された口座へ再作成しない
    it("creation_unknownのpayout_request復旧時に外部銀行口座が利用不可ならStripe Payoutを再試行しないこと", async () => {
      await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 1500,
        idempotencyKey: "stored_recovery_key",
      });
      stripeDouble.setExternalAccounts([{ status: "errored" }]);

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const failure = expectAppFailure(result);
      expect(failure.error.code).toBe("CONNECT_ACCOUNT_RESTRICTED");
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // Stripeの冪等性契約に合わせ、復旧時はfresh balanceではなく保存済みamountで再試行する
    it("creation_unknownのpayout_request復旧時にfresh balanceと保存済みamountが異なっても保存済みamountで再試行すること", async () => {
      await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 1200,
        idempotencyKey: "stored_recovery_key",
      });
      stripeDouble.setBalance({
        available: [{ amount: 1500, currency: "jpy", source_types: { card: 1500 } }],
      });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppSuccess(result);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(1);
      expect(stripeDouble.payoutCreateCalls[0]?.params).toEqual(
        expect.objectContaining({ amount: 1200, currency: "jpy" })
      );
      expect(stripeDouble.payoutCreateCalls[0]?.options).toEqual(
        expect.objectContaining({ idempotencyKey: "stored_recovery_key" })
      );
    });

    it("24時間超のcreation_unknownはmanual_review_requiredに更新し、Stripe Payoutを再試行しないこと", async () => {
      const request = await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 1500,
        idempotencyKey: "stored_expired_key",
        requestedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const failure = expectAppFailure(result);
      expect(failure.error.retryable).toBe(false);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({
          status: "manual_review_required",
          failure_code: "idempotency_key_expired",
          failure_message:
            "Stripe idempotency key の保証期間を超過したため、振込状況の手動確認が必要です。",
        })
      );
    });

    // 予期しないエラーでも境界契約を守ることを固定する
    it("想定外のエラーが発生した時、例外を外へ投げず失敗Resultを返すこと", async () => {
      stripeDouble.setPayoutError(new Error("unexpected"));

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toEqual([
        expect.objectContaining({ status: "failed", failure_message: "unexpected" }),
      ]);
    });
  });

  describe("getPayoutPanelState", () => {
    beforeEach(async () => {
      ctx = await createPayoutContextFixture({ emailPrefix: "payout-panel-state" });
      service = new PayoutRequestService(ctx.adminClient);
      stripeDouble.setBalance({
        available: [{ amount: 1500, currency: "jpy", source_types: { card: 1500 } }],
      });
    });

    it("Stripe Accountのpayouts_enabledがfalseの時、payouts_disabledで入金不可を返すこと", async () => {
      stripeDouble.setAccount({ payouts_enabled: false });

      const result = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      expect(success.data).toEqual(
        expect.objectContaining({
          canRequestPayout: false,
          disabledReason: "payouts_disabled",
        })
      );
    });

    it("JPYのdefault外部銀行口座がない時、external_account_missingで入金不可を返すこと", async () => {
      stripeDouble.setExternalAccounts([
        { id: "ba_non_default", currency: "jpy", default_for_currency: false },
      ]);

      const result = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      expect(success.data).toEqual(
        expect.objectContaining({
          canRequestPayout: false,
          disabledReason: "external_account_missing",
        })
      );
    });

    it("default外部銀行口座が利用不可状態の時、external_account_unavailableで入金不可を返すこと", async () => {
      stripeDouble.setExternalAccounts([{ status: "errored" }]);

      const result = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      expect(success.data).toEqual(
        expect.objectContaining({
          canRequestPayout: false,
          disabledReason: "external_account_unavailable",
        })
      );
    });

    it("validな外部銀行口座とavailable残高がある時、入金可能を返すこと", async () => {
      const result = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      expect(success.data).toEqual(
        expect.objectContaining({
          availableAmount: 1500,
          canRequestPayout: true,
          disabledReason: undefined,
        })
      );
      expect(stripeDouble.accountRetrieveCalls[0]?.id).toBe(ctx.stripeAccountId);
      expect(stripeDouble.externalAccountsListCalls[0]).toEqual(
        expect.objectContaining({
          id: ctx.stripeAccountId,
          params: expect.objectContaining({ object: "bank_account", limit: 100 }),
        })
      );
    });

    it("creation_unknownのpayout_requestが存在する時、available残高が0でもrequest_in_progressを返すこと", async () => {
      await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 1500,
      });
      stripeDouble.setBalance({
        available: [{ amount: 0, currency: "jpy", source_types: { card: 0 } }],
      });

      const result = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      expect(success.data).toEqual(
        expect.objectContaining({
          availableAmount: 0,
          canRequestPayout: false,
          disabledReason: "request_in_progress",
          latestRequest: expect.objectContaining({ status: "creation_unknown" }),
        })
      );
    });

    it("24時間超のcreation_unknownはpanel state取得時にmanual_review_requiredへ更新すること", async () => {
      const request = await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 1500,
        requestedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      });
      stripeDouble.setBalance({
        available: [{ amount: 0, currency: "jpy", source_types: { card: 0 } }],
      });

      const result = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      expect(success.data).toEqual(
        expect.objectContaining({
          availableAmount: 0,
          canRequestPayout: false,
          disabledReason: "request_in_progress",
          latestRequest: expect.objectContaining({
            status: "manual_review_required",
            failureCode: "idempotency_key_expired",
            failureMessage:
              "Stripe idempotency key の保証期間を超過したため、振込状況の手動確認が必要です。",
          }),
        })
      );
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({
          status: "manual_review_required",
          failure_code: "idempotency_key_expired",
          failure_message:
            "Stripe idempotency key の保証期間を超過したため、振込状況の手動確認が必要です。",
        })
      );
    });

    it("manual_review_requiredのpayout_requestが存在する時、available残高が0でもrequest_in_progressを返すこと", async () => {
      await createPayoutRequestFixture(ctx, {
        status: "manual_review_required",
        amount: 1500,
      });
      stripeDouble.setBalance({
        available: [{ amount: 0, currency: "jpy", source_types: { card: 0 } }],
      });

      const result = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      expect(success.data).toEqual(
        expect.objectContaining({
          availableAmount: 0,
          canRequestPayout: false,
          disabledReason: "request_in_progress",
          latestRequest: expect.objectContaining({ status: "manual_review_required" }),
        })
      );
    });

  });

  describe("syncPayoutFromWebhook", () => {
    let request: PayoutRequestFixture;

    beforeEach(async () => {
      ctx = await createPayoutContextFixture({ emailPrefix: "sync-payout" });
      service = new PayoutRequestService(ctx.adminClient);
      request = await createPayoutRequestFixture(ctx, {
        status: "pending",
        stripePayoutId: "po_test_fixture",
        failureCode: "old_failure",
        failureMessage: "old failure",
      });
    });

    // metadataは自社DB IDの紐付けに使うが、Connect webhookの外部入力なのでstripe_account_id照合は必須
    it("payout.metadata.payout_request_idが存在しevent.accountとpayout_request.stripe_account_idが一致する時、そのpayout_requestを更新すること", async () => {
      const payout = buildPayout(ctx, request, { status: "paid" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "paid", stripe_payout_id: payout.id })
      );
    });

    // metadataが別アカウントのrequestを指す場合に誤更新しないことを固定する
    it("payout.metadata.payout_request_idが存在してもevent.accountとpayout_request.stripe_account_idが一致しない時、更新せずリトライ不要の失敗Resultを返すこと", async () => {
      const before = await getPayoutRequestById(ctx, request.id);
      const payout = buildPayout(ctx, request, { status: "paid" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, "acct_other");

      const failure = expectAppFailure(result);
      expect(failure.error.retryable).toBe(false);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(before);
    });

    // metadataが正しくても、保存済みstripe_payout_idと別のPayout IDなら誤更新しない
    it("payout.metadata.payout_request_idが存在しても保存済みstripe_payout_idとpayout.idが矛盾する時、更新せずリトライ不要の失敗Resultを返すこと", async () => {
      const before = await getPayoutRequestById(ctx, request.id);
      const payout = buildPayout(ctx, request, { id: "po_different", status: "paid" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      const failure = expectAppFailure(result);
      expect(failure.error.retryable).toBe(false);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(before);
    });

    // metadata欠落時の復旧経路を固定する
    it("payout.metadata.payout_request_idが存在しない時、stripe_payout_idでpayout_requestを特定して更新すること", async () => {
      const payout = buildPayout(ctx, request, { metadata: {}, status: "paid" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "paid" })
      );
    });

    // 作成イベントの状態反映を固定する
    it("payout.createdを受け取った時、payout_requestをpendingに更新すること", async () => {
      const payout = buildPayout(ctx, request, { status: "pending" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "pending" })
      );
    });

    // 汎用更新イベントの状態反映を固定する
    it("payout.updatedを受け取った時、Stripe Payoutのstatusに対応する状態へ更新すること", async () => {
      const payout = buildPayout(ctx, request, { status: "canceled" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "canceled" })
      );
    });

    // Stripeの銀行送信後状態をcreatedに潰さず保存する
    it("payout.updatedでin_transitを受け取った時、payout_requestをin_transitへ更新すること", async () => {
      const payout = buildPayout(ctx, request, { status: "in_transit" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "in_transit" })
      );
    });

    it.each([
      ["pending", "po_manual_pending"],
      ["in_transit", "po_manual_in_transit"],
      ["paid", "po_manual_paid"],
      ["failed", "po_manual_failed"],
      ["canceled", "po_manual_canceled"],
    ] as const)(
      "manual_review_requiredのpayout_requestに%sのwebhookが届いた時、Stripe状態へ同期すること",
      async (status, payoutId) => {
        const manualRequest = await createPayoutRequestFixture(ctx, {
          status: "manual_review_required",
          stripePayoutId: null,
          failureCode: EXPIRED_IDEMPOTENCY_FAILURE_CODE,
          failureMessage: "manual review required",
        });
        const payout = buildPayout(ctx, manualRequest, {
          id: payoutId,
          status,
          failure_code: status === "failed" ? "account_closed" : null,
          failure_message: status === "failed" ? "account closed" : null,
        });

        const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

        expectAppSuccess(result);
        expect(await getPayoutRequestById(ctx, manualRequest.id)).toEqual(
          expect.objectContaining({
            status,
            stripe_payout_id: payoutId,
            failure_code: status === "failed" ? "account_closed" : null,
            failure_message: status === "failed" ? "account closed" : null,
          })
        );
      }
    );

    // 入金完了の状態反映を固定する
    it("payout.paidを受け取った時、payout_requestをpaidに更新しfailure情報を残さないこと", async () => {
      const payout = buildPayout(ctx, request, { status: "paid" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "paid", failure_code: null, failure_message: null })
      );
    });

    // 入金失敗の状態反映を固定する
    it("payout.failedを受け取った時、payout_requestをfailedに更新しfailure_codeとfailure_messageを保存すること", async () => {
      const payout = buildPayout(ctx, request, {
        status: "failed",
        failure_code: "account_closed",
        failure_message: "account closed",
      });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({
          status: "failed",
          failure_code: "account_closed",
          failure_message: "account closed",
        })
      );
    });

    // キャンセルの状態反映を固定する
    it("payout.canceledを受け取った時、payout_requestをcanceledに更新すること", async () => {
      const payout = buildPayout(ctx, request, { status: "canceled" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "canceled" })
      );
    });

    // webhook冪等性を固定する
    it("同じStripe Payoutイベントを複数回受け取った時、同じ最終状態に更新されること", async () => {
      const payout = buildPayout(ctx, request, { status: "paid" });

      const first = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);
      const second = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(first);
      expectAppSuccess(second);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "paid" })
      );
    });

    // Stripeはイベント順序を保証しない。古いpending/in_transit系イベントでpaid/failedを巻き戻さない。
    it("paidまたはfailedのpayout_requestに古いpayout.createdやpendingのpayout.updatedが届いても、状態をpendingへ巻き戻さないこと", async () => {
      await ctx.adminClient.from("payout_requests").update({ status: "paid" }).eq("id", request.id);
      const payout = buildPayout(ctx, request, { status: "pending" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "paid" })
      );
    });

    it("manual_review_requiredのpayout_requestにpayout.createdが届いた時、pendingへ同期すること", async () => {
      const expiredRequest = await createPayoutRequestFixture(ctx, {
        status: "manual_review_required",
        stripePayoutId: null,
        failureCode: EXPIRED_IDEMPOTENCY_FAILURE_CODE,
        failureMessage: "expired",
      });
      const payout = buildPayout(ctx, expiredRequest, {
        id: "po_expired_pending",
        status: "pending",
      });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, expiredRequest.id)).toEqual(
        expect.objectContaining({
          status: "pending",
          stripe_payout_id: "po_expired_pending",
        })
      );
    });

    it("manual_review_requiredのpayout_requestにpayout.paidが届いた時、paidへ同期しfailure情報を消すこと", async () => {
      const expiredRequest = await createPayoutRequestFixture(ctx, {
        status: "manual_review_required",
        stripePayoutId: null,
        failureCode: EXPIRED_IDEMPOTENCY_FAILURE_CODE,
        failureMessage: "expired",
      });
      const payout = buildPayout(ctx, expiredRequest, { id: "po_expired_paid", status: "paid" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, expiredRequest.id)).toEqual(
        expect.objectContaining({
          status: "paid",
          stripe_payout_id: "po_expired_paid",
          failure_code: null,
          failure_message: null,
        })
      );
    });

    it("Stripe由来のfailedに古いpendingのwebhookが届いても、状態をpendingへ巻き戻さないこと", async () => {
      await ctx.adminClient
        .from("payout_requests")
        .update({
          status: "failed",
          failure_code: "account_closed",
          failure_message: "account closed",
        })
        .eq("id", request.id);
      const payout = buildPayout(ctx, request, { status: "pending" });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({
          status: "failed",
          failure_code: "account_closed",
          failure_message: "account closed",
        })
      );
    });

    it("manual_review_requiredでも保存済みstripe_payout_idとpayout.idが矛盾する時、更新しないこと", async () => {
      const expiredRequest = await createPayoutRequestFixture(ctx, {
        status: "manual_review_required",
        stripePayoutId: "po_existing_expired",
        failureCode: EXPIRED_IDEMPOTENCY_FAILURE_CODE,
        failureMessage: "expired",
      });
      const before = await getPayoutRequestById(ctx, expiredRequest.id);
      const payout = buildPayout(ctx, expiredRequest, {
        id: "po_different_expired",
        status: "paid",
      });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      const failure = expectAppFailure(result);
      expect(failure.error.retryable).toBe(false);
      expect(await getPayoutRequestById(ctx, expiredRequest.id)).toEqual(before);
    });

    // Stripeでは失敗するPayoutが一度paidに見えてからfailedへ変わる場合があるため、この遷移だけは許可する
    it("paidのpayout_requestにpayout.failedが届いた時、failedへ更新しfailure情報を保存すること", async () => {
      await ctx.adminClient.from("payout_requests").update({ status: "paid" }).eq("id", request.id);
      const payout = buildPayout(ctx, request, {
        status: "failed",
        failure_code: "bank_account_restricted",
        failure_message: "restricted",
      });

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({
          status: "failed",
          failure_code: "bank_account_restricted",
          failure_message: "restricted",
        })
      );
    });

    // アプリ外PayoutのwebhookをACKし、DLQノイズにしないことを固定する
    it("対応するpayout_requestが存在しない時、成功Resultとしてスキップすること", async () => {
      const payout = buildPayout(
        ctx,
        { id: "missing", amount: 1000 },
        {
          id: "po_missing",
          metadata: { payout_request_id: "00000000-0000-0000-0000-000000000000" },
        }
      );

      const result = await (service.syncPayoutFromWebhook as any)(payout, ctx.stripeAccountId);

      const success = expectAppSuccess(result);
      expect(success.meta).toEqual({
        reason: "untracked_payout_skipped",
        payoutId: "po_missing",
      });
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "pending" })
      );
    });
  });

  describe("configureManualPayoutSchedule", () => {
    beforeEach(async () => {
      ctx = await createPayoutContextFixture({
        emailPrefix: "manual-schedule",
        attachPayoutProfileToCommunity: false,
      });
      // 新規アカウント作成ロジックを通すため、fixtureで作成されたプロファイルを削除しておく
      await ctx.adminClient.from("payout_profiles").delete().eq("id", ctx.payoutProfileId);
    });

    // 新規Connectアカウントはアプリ内入金管理が標準。外部API実状態ではなくStripe呼び出し引数をunitで固定する。
    it("新規Connectアカウント作成後、payout scheduleをmanualに更新するStripe APIを呼び出すこと", async () => {
      const service = new StripeConnectService(ctx.adminClient, new StripeConnectErrorHandler());

      await service.createExpressAccount({ userId: ctx.user.id, email: ctx.user.email });

      expect(stripeDouble.balanceSettingsUpdateCalls).toHaveLength(1);
    });

    // StripeのBalance Settings APIへ渡すmanual schedule引数を固定する
    it("payout scheduleのmanual設定時、payments.payouts.schedule.intervalにmanualを指定すること", async () => {
      const service = new StripeConnectService(ctx.adminClient, new StripeConnectErrorHandler());

      await service.createExpressAccount({ userId: ctx.user.id, email: ctx.user.email });

      expect(stripeDouble.balanceSettingsUpdateCalls[0]?.params).toEqual({
        payments: { payouts: { schedule: { interval: "manual" } } },
      });
    });

    // manual化に失敗したアカウントは、アプリ内入金の前提を満たさないためready扱いしない
    it("payout scheduleのmanual設定に失敗した時、payout_profileを入金可能状態として扱わない失敗Resultを返すこと", async () => {
      stripeDouble.setBalanceSettingsError(new Error("manual schedule failed"));
      const service = new StripeConnectService(ctx.adminClient, new StripeConnectErrorHandler());

      await expect(
        service.createExpressAccount({ userId: ctx.user.id, email: ctx.user.email })
      ).rejects.toThrow("振込スケジュールの設定に失敗しました");
    });
  });
});
