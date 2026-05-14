import Stripe from "stripe";

import { FeeConfigService } from "@core/stripe/fee-config/service";
import { PayoutRequestService } from "@features/stripe-connect/services/payout-request-service";

import { expectAppFailure, expectAppSuccess } from "@tests/helpers/assert-result";
import {
  createPayoutContextFixture,
  createPayoutRequestFixture,
  getPayoutRequestById,
  listPayoutRequests,
  type PayoutContextFixture,
} from "@tests/helpers/stripe-connect-payout-fixtures";
import { installStripePayoutSdkDouble } from "@tests/helpers/stripe-payout-sdk-double";

const stripeDouble = installStripePayoutSdkDouble();

jest.mock("@core/stripe/client", () => ({
  getStripe: jest.fn(() => stripeDouble.stripe),
  generateIdempotencyKey: jest.fn((prefix?: string) => `${prefix ?? "key"}_fixed_idempotency_key`),
}));

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type FeeConfigSnapshot = {
  payout_request_fee_amount: number;
  min_payout_amount: number;
};

const PAYOUT_FEE = 260;
const MIN_PAYOUT_AMOUNT = 1;
const PAYOUT_CREATION_FAILED_AFTER_FEE_COLLECTED =
  "payout_creation_failed_after_fee_collected";

function confirmedAccountDebit(overrides: Partial<Stripe.Charge> = {}) {
  stripeDouble.setChargeResponse({
    id: "py_test_system_fee",
    amount: PAYOUT_FEE,
    source_transfer: "tr_test_system_fee",
    ...overrides,
  });
}

function confirmedPayout(overrides: Partial<Stripe.Payout> = {}) {
  stripeDouble.setPayoutResponse({
    id: "po_test_system_fee",
    amount: 740,
    status: "pending",
    ...overrides,
  });
}

async function readFeeConfig(ctx: PayoutContextFixture): Promise<FeeConfigSnapshot> {
  const { data, error } = await ctx.adminClient
    .from("fee_config")
    .select("payout_request_fee_amount, min_payout_amount")
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Failed to read fee_config fixture: ${error?.message}`);
  }

  return data;
}

async function updateFeeConfig(
  ctx: PayoutContextFixture,
  values: Partial<FeeConfigSnapshot>
): Promise<void> {
  const { error } = await ctx.adminClient.from("fee_config").update(values).neq("id", 0);

  if (error) {
    throw new Error(`Failed to update fee_config fixture: ${error.message}`);
  }

  new FeeConfigService(ctx.adminClient).invalidateCache();
}

async function createServiceContext(
  emailPrefix: string,
  feeConfig: Partial<FeeConfigSnapshot> = {}
): Promise<{
  ctx: PayoutContextFixture;
  service: PayoutRequestService;
  originalFeeConfig: FeeConfigSnapshot;
}> {
  const ctx = await createPayoutContextFixture({ emailPrefix });
  const originalFeeConfig = await readFeeConfig(ctx);
  await updateFeeConfig(ctx, {
    payout_request_fee_amount: feeConfig.payout_request_fee_amount ?? PAYOUT_FEE,
    min_payout_amount: feeConfig.min_payout_amount ?? MIN_PAYOUT_AMOUNT,
  });

  return {
    ctx,
    service: new PayoutRequestService(ctx.adminClient),
    originalFeeConfig,
  };
}

async function cleanupContext(
  ctx: PayoutContextFixture | undefined,
  originalFeeConfig: FeeConfigSnapshot | undefined
): Promise<void> {
  if (ctx && originalFeeConfig) {
    await updateFeeConfig(ctx, originalFeeConfig);
  }
  await ctx?.cleanup();
  stripeDouble.reset();
  jest.clearAllMocks();
}

describe("PayoutRequestService payout手数料", () => {
  describe("payout可否判定", () => {
    let ctx: PayoutContextFixture;
    let service: PayoutRequestService;
    let originalFeeConfig: FeeConfigSnapshot;

    beforeEach(async () => {
      const fixture = await createServiceContext("system-fee-eligibility");
      ctx = fixture.ctx;
      service = fixture.service;
      originalFeeConfig = fixture.originalFeeConfig;
      stripeDouble.setBalance({
        available: [{ amount: 261, currency: "jpy", source_types: { card: 261 } }],
      });
    });

    afterEach(async () => {
      await cleanupContext(ctx, originalFeeConfig);
    });

    // 手数料を差し引いても1円以上payoutできる場合のみ、リクエスト可能にする意図を固定する
    it("available残高がsystem_fee_amountを超える時、system_fee_amountを差し引いた金額でpayout可能であること", async () => {
      const result = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      expect(success.data).toEqual(
        expect.objectContaining({
          availableAmount: 261,
          payoutRequestFeeAmount: PAYOUT_FEE,
          payoutAmount: 1,
          canRequestPayout: true,
          disabledReason: undefined,
        })
      );
      expect(await listPayoutRequests(ctx)).toHaveLength(0);
      expect(stripeDouble.chargeCreateCalls).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // system_fee_amountを不可条件にする
    it("available残高がsystem_fee_amount以下の時、payoutリクエスト不可でありStripe操作を開始しないこと", async () => {
      stripeDouble.setBalance({
        available: [{ amount: PAYOUT_FEE, currency: "jpy", source_types: { card: PAYOUT_FEE } }],
      });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const failure = expectAppFailure(result);
      expect(failure.error.code).toBe("INSUFFICIENT_BALANCE");
      expect(await listPayoutRequests(ctx)).toHaveLength(0);
      expect(stripeDouble.chargeCreateCalls).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // fee_configの現在値を画面表示・リクエスト作成の単一の入力値にする
    it("fee_configのpayout_request_fee_amountが変更されている時、その値をsystem_fee_amountとしてpayout可否判定に使用すること", async () => {
      await updateFeeConfig(ctx, { payout_request_fee_amount: 400, min_payout_amount: 1 });
      stripeDouble.setBalance({
        available: [{ amount: 401, currency: "jpy", source_types: { card: 401 } }],
      });

      const result = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      expect(success.data).toEqual(
        expect.objectContaining({
          availableAmount: 401,
          payoutRequestFeeAmount: 400,
          payoutAmount: 1,
          canRequestPayout: true,
          disabledReason: undefined,
        })
      );
      expect(await listPayoutRequests(ctx)).toHaveLength(0);
    });
  });

  describe("payoutリクエスト作成", () => {
    let ctx: PayoutContextFixture;
    let service: PayoutRequestService;
    let originalFeeConfig: FeeConfigSnapshot;

    beforeEach(async () => {
      const fixture = await createServiceContext("system-fee-create");
      ctx = fixture.ctx;
      service = fixture.service;
      originalFeeConfig = fixture.originalFeeConfig;
      stripeDouble.setBalance({
        available: [{ amount: 1000, currency: "jpy", source_types: { card: 1000 } }],
      });
      confirmedAccountDebit();
      confirmedPayout({ amount: 740 });
    });

    afterEach(async () => {
      await cleanupContext(ctx, originalFeeConfig);
    });

    // 監査・二重実行防止・振込額の正当性を担保する初期値を保存する
    it("payoutリクエスト作成時に、fee_configからのsystem_fee_amount、gross_amountから差し引いたamount、分離された各idempotency keyをDBへ保存すること", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      const row = await getPayoutRequestById(ctx, success.data.payoutRequestId);
      expect(success.data).toEqual(
        expect.objectContaining({
          amount: 740,
          grossAmount: 1000,
          systemFeeAmount: PAYOUT_FEE,
          systemFeeState: "succeeded",
        })
      );
      expect(row).toEqual(
        expect.objectContaining({
          gross_amount: 1000,
          amount: 740,
          system_fee_amount: PAYOUT_FEE,
          idempotency_key: "payout_fixed_idempotency_key",
          system_fee_idempotency_key: "payout_fee_fixed_idempotency_key",
        })
      );
      expect(row?.idempotency_key).not.toBe(row?.system_fee_idempotency_key);
    });

    // Account Debitが成功するまでpayoutを作らない資金フローと、監査・手動復旧用のStripe object保存を固定する
    it("Account Debitが成功した時、fee stateをsucceededにし、Transfer IDとPayment IDを保存して差引後金額のPayoutを作成し、返却payloadのamountも差引後の金額であること", async () => {
      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      const row = await getPayoutRequestById(ctx, success.data.payoutRequestId);
      expect(success.data).toEqual(
        expect.objectContaining({
          amount: 740,
          grossAmount: 1000,
          systemFeeAmount: PAYOUT_FEE,
          systemFeeState: "succeeded",
          status: "pending",
        })
      );
      expect(row).toEqual(
        expect.objectContaining({
          amount: 740,
          gross_amount: 1000,
          status: "pending",
          system_fee_state: "succeeded",
          stripe_account_debit_payment_id: "py_test_system_fee",
          stripe_account_debit_transfer_id: "tr_test_system_fee",
          system_fee_failure_code: null,
          system_fee_failure_message: null,
        })
      );
      expect(stripeDouble.chargeCreateCalls).toHaveLength(1);
      expect(stripeDouble.chargeCreateCalls[0]).toEqual(
        expect.objectContaining({
          params: expect.objectContaining({
            amount: PAYOUT_FEE,
            source: ctx.stripeAccountId,
            metadata: expect.objectContaining({ purpose: "payout_request_system_fee" }),
          }),
          options: expect.objectContaining({ idempotencyKey: "payout_fee_fixed_idempotency_key" }),
        })
      );
      expect(stripeDouble.payoutCreateCalls).toHaveLength(1);
      expect(stripeDouble.payoutCreateCalls[0]).toEqual(
        expect.objectContaining({
          params: expect.objectContaining({ amount: 740 }),
          options: expect.objectContaining({ idempotencyKey: "payout_fixed_idempotency_key" }),
        })
      );
    });
  });

  describe("Account Debit失敗時の扱い", () => {
    let ctx: PayoutContextFixture;
    let service: PayoutRequestService;
    let originalFeeConfig: FeeConfigSnapshot;

    beforeEach(async () => {
      const fixture = await createServiceContext("system-fee-debit-failure");
      ctx = fixture.ctx;
      service = fixture.service;
      originalFeeConfig = fixture.originalFeeConfig;
      stripeDouble.setBalance({
        available: [{ amount: 1000, currency: "jpy", source_types: { card: 1000 } }],
      });
    });

    afterEach(async () => {
      await cleanupContext(ctx, originalFeeConfig);
    });

    // 手数料を回収できていない状態でpayoutを作らないことを固定する
    it("Account Debitが確定失敗した時、Payoutを作成せずsystem_fee_stateをfailedにしてpayout_requestをfailedにすること", async () => {
      stripeDouble.setChargeError(
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
        expect.objectContaining({
          amount: 740,
          gross_amount: 1000,
          system_fee_amount: PAYOUT_FEE,
          status: "failed",
          system_fee_state: "failed",
          system_fee_failure_code: "insufficient_funds",
          failure_code: "insufficient_funds",
          stripe_account_debit_payment_id: null,
          stripe_account_debit_transfer_id: null,
        }),
      ]);
      expect(stripeDouble.chargeCreateCalls).toHaveLength(1);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // Stripe接続/APIエラーでAccount Debitの成否が不明な場合に二重徴収を避ける
    it("Account Debitの作成成否が不明な時、Payoutを作成せずsystem_fee_stateをcreation_unknownにしてpayout_requestをcreation_unknownにすること", async () => {
      stripeDouble.setChargeError(
        new Stripe.errors.StripeConnectionError({ message: "network failed" } as any)
      );

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toEqual([
        expect.objectContaining({
          amount: 740,
          gross_amount: 1000,
          system_fee_amount: PAYOUT_FEE,
          status: "creation_unknown",
          system_fee_state: "creation_unknown",
          system_fee_failure_message: "network failed",
          failure_message: "network failed",
          stripe_account_debit_payment_id: null,
          stripe_account_debit_transfer_id: null,
        }),
      ]);
      expect(stripeDouble.chargeCreateCalls).toHaveLength(1);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });
  });

  describe("Account Debit作成成否不明からの復旧", () => {
    let ctx: PayoutContextFixture;
    let service: PayoutRequestService;
    let originalFeeConfig: FeeConfigSnapshot;

    beforeEach(async () => {
      const fixture = await createServiceContext("system-fee-recovery");
      ctx = fixture.ctx;
      service = fixture.service;
      originalFeeConfig = fixture.originalFeeConfig;
      stripeDouble.setBalance({
        available: [{ amount: 0, currency: "jpy", source_types: { card: 0 } }],
      });
    });

    afterEach(async () => {
      await cleanupContext(ctx, originalFeeConfig);
    });

    // 期限内の復旧では二重徴収を避けるため、初回と同じAccount Debit idempotency keyを使う
    it("Account Debitのcreation_unknownが期限内に再実行された時、同じAccount Debit idempotency keyで復旧し成功確認後にPayoutを作成すること", async () => {
      const existing = await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 740,
        grossAmount: 1000,
        systemFeeAmount: PAYOUT_FEE,
        systemFeeState: "creation_unknown",
        idempotencyKey: "stored_payout_key",
        systemFeeIdempotencyKey: "stored_system_fee_key",
      });
      confirmedAccountDebit();
      confirmedPayout({ id: "po_recovered", amount: 740 });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      const row = await getPayoutRequestById(ctx, existing.id);
      expect(success.data).toEqual(
        expect.objectContaining({ payoutRequestId: existing.id, amount: 740, status: "pending" })
      );
      expect(row).toEqual(
        expect.objectContaining({
          status: "pending",
          system_fee_state: "succeeded",
          stripe_account_debit_payment_id: "py_test_system_fee",
          stripe_account_debit_transfer_id: "tr_test_system_fee",
          stripe_payout_id: "po_recovered",
        })
      );
      expect(stripeDouble.chargeCreateCalls).toHaveLength(1);
      expect(stripeDouble.chargeCreateCalls[0]?.options).toEqual(
        expect.objectContaining({ idempotencyKey: "stored_system_fee_key" })
      );
      expect(stripeDouble.payoutCreateCalls).toHaveLength(1);
      expect(stripeDouble.payoutCreateCalls[0]?.options).toEqual(
        expect.objectContaining({ idempotencyKey: "stored_payout_key" })
      );
    });

    // 期限内の復旧でAccount Debit未作成が確定した場合は、payoutを作らず失敗確定にする
    it("Account Debitのcreation_unknownが期限内に再実行され確定失敗した時、Payoutを作成せずsystem_fee_stateをfailedにしてpayout_requestをfailedにすること", async () => {
      const existing = await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 740,
        grossAmount: 1000,
        systemFeeAmount: PAYOUT_FEE,
        systemFeeState: "creation_unknown",
        idempotencyKey: "stored_payout_key",
        systemFeeIdempotencyKey: "stored_system_fee_key",
      });
      stripeDouble.setChargeError(
        new Stripe.errors.StripeInvalidRequestError({
          message: "account debit failed",
          code: "balance_insufficient",
        } as any)
      );

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await getPayoutRequestById(ctx, existing.id)).toEqual(
        expect.objectContaining({
          status: "failed",
          system_fee_state: "failed",
          system_fee_failure_code: "balance_insufficient",
          failure_code: "balance_insufficient",
          stripe_payout_id: null,
        })
      );
      expect(stripeDouble.chargeCreateCalls[0]?.options).toEqual(
        expect.objectContaining({ idempotencyKey: "stored_system_fee_key" })
      );
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // 不明状態の自動復旧期限を超えた場合は人間の確認に切り替える
    it("Account Debitのcreation_unknownが復旧期限を超えた時、system_fee_stateをmanual_review_requiredにしてAccount DebitもPayoutも再実行しないこと", async () => {
      const existing = await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 740,
        grossAmount: 1000,
        systemFeeAmount: PAYOUT_FEE,
        systemFeeState: "creation_unknown",
        idempotencyKey: "stored_payout_key",
        systemFeeIdempotencyKey: "stored_system_fee_key",
        requestedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await getPayoutRequestById(ctx, existing.id)).toEqual(
        expect.objectContaining({
          status: "manual_review_required",
          system_fee_state: "manual_review_required",
          failure_code: "idempotency_key_expired",
          stripe_account_debit_payment_id: null,
          stripe_payout_id: null,
        })
      );
      expect(stripeDouble.chargeCreateCalls).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });
  });

  describe("Account Debit成功後のPayout失敗時の扱い", () => {
    let ctx: PayoutContextFixture;
    let service: PayoutRequestService;
    let originalFeeConfig: FeeConfigSnapshot;

    beforeEach(async () => {
      const fixture = await createServiceContext("system-fee-payout-failure");
      ctx = fixture.ctx;
      service = fixture.service;
      originalFeeConfig = fixture.originalFeeConfig;
      stripeDouble.setBalance({
        available: [{ amount: 1000, currency: "jpy", source_types: { card: 1000 } }],
      });
    });

    afterEach(async () => {
      await cleanupContext(ctx, originalFeeConfig);
    });

    // 260円回収済みのため二重徴収を避け、手動確認対象を運用上特定できるよう状態を明示する
    it("Account Debit成功後にPayout作成が確定失敗した時、system_fee_state=succeeded、status=manual_review_required、failure_code=payout_creation_failed_after_fee_collectedとして保存すること", async () => {
      confirmedAccountDebit();
      stripeDouble.setPayoutError(
        new Stripe.errors.StripeInvalidRequestError({
          message: "payout failed",
          code: "insufficient_funds",
        } as any)
      );

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toEqual([
        expect.objectContaining({
          amount: 740,
          gross_amount: 1000,
          status: "manual_review_required",
          system_fee_state: "succeeded",
          stripe_account_debit_payment_id: "py_test_system_fee",
          stripe_account_debit_transfer_id: "tr_test_system_fee",
          failure_code: PAYOUT_CREATION_FAILED_AFTER_FEE_COLLECTED,
          stripe_payout_id: null,
        }),
      ]);
      expect(stripeDouble.chargeCreateCalls).toHaveLength(1);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(1);
    });

    // Payout作成の成否が不明な場合は、fee回収済み状態を維持したままPayout復旧対象にする
    it("Account Debitが成功した後にPayout作成の成否が不明な時、system_fee_stateはsucceededのままpayout_requestをcreation_unknownにすること", async () => {
      confirmedAccountDebit();
      stripeDouble.setPayoutError(
        new Stripe.errors.StripeConnectionError({ message: "payout network failed" } as any)
      );

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await listPayoutRequests(ctx)).toEqual([
        expect.objectContaining({
          status: "creation_unknown",
          system_fee_state: "succeeded",
          stripe_account_debit_payment_id: "py_test_system_fee",
          stripe_account_debit_transfer_id: "tr_test_system_fee",
          failure_message: "payout network failed",
          stripe_payout_id: null,
        }),
      ]);
      expect(stripeDouble.chargeCreateCalls).toHaveLength(1);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(1);
    });

    // Payout復旧ではAccount Debitを再実行せず、Payout用idempotency keyだけを再利用する
    it("Account Debit成功後のPayout creation_unknownでユーザーが再試行した時、Account Debitを再実行せず同じPayout idempotency keyでPayout作成を復旧すること", async () => {
      const existing = await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 740,
        grossAmount: 1000,
        systemFeeAmount: PAYOUT_FEE,
        systemFeeState: "succeeded",
        idempotencyKey: "stored_payout_key",
        systemFeeIdempotencyKey: "stored_system_fee_key",
        stripeAccountDebitPaymentId: "py_existing_system_fee",
        stripeAccountDebitTransferId: "tr_existing_system_fee",
      });
      confirmedPayout({ id: "po_recovered_without_fee", amount: 740 });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppSuccess(result);
      expect(await getPayoutRequestById(ctx, existing.id)).toEqual(
        expect.objectContaining({
          status: "pending",
          system_fee_state: "succeeded",
          stripe_account_debit_payment_id: "py_existing_system_fee",
          stripe_account_debit_transfer_id: "tr_existing_system_fee",
          stripe_payout_id: "po_recovered_without_fee",
        })
      );
      expect(stripeDouble.chargeCreateCalls).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(1);
      expect(stripeDouble.payoutCreateCalls[0]?.options).toEqual(
        expect.objectContaining({ idempotencyKey: "stored_payout_key" })
      );
    });

    // Payoutの作成成否不明が期限切れになっても、回収済みfeeの状態は巻き戻さない
    it("Account Debit成功後のPayout creation_unknownが復旧期限を超えた時、system_fee_stateはsucceededのままpayout_requestをmanual_review_requiredにすること", async () => {
      const existing = await createPayoutRequestFixture(ctx, {
        status: "creation_unknown",
        amount: 740,
        grossAmount: 1000,
        systemFeeAmount: PAYOUT_FEE,
        systemFeeState: "succeeded",
        idempotencyKey: "stored_payout_key",
        systemFeeIdempotencyKey: "stored_system_fee_key",
        stripeAccountDebitPaymentId: "py_existing_system_fee",
        stripeAccountDebitTransferId: "tr_existing_system_fee",
        requestedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      expectAppFailure(result);
      expect(await getPayoutRequestById(ctx, existing.id)).toEqual(
        expect.objectContaining({
          status: "manual_review_required",
          system_fee_state: "succeeded",
          failure_code: "idempotency_key_expired",
          stripe_account_debit_payment_id: "py_existing_system_fee",
          stripe_account_debit_transfer_id: "tr_existing_system_fee",
          stripe_payout_id: null,
        })
      );
      expect(stripeDouble.chargeCreateCalls).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // 手動確認のみとし、ユーザー操作による自動再試行を許可しない
    it("manual_review_requiredのpayout_requestが存在する時、再度requestPayoutを呼んでもAccount DebitもPayoutも作成しないこと", async () => {
      const existing = await createPayoutRequestFixture(ctx, {
        status: "manual_review_required",
        amount: 740,
        grossAmount: 1000,
        systemFeeAmount: PAYOUT_FEE,
        systemFeeState: "succeeded",
        idempotencyKey: "stored_payout_key",
        systemFeeIdempotencyKey: "stored_system_fee_key",
        stripeAccountDebitPaymentId: "py_existing_system_fee",
        stripeAccountDebitTransferId: "tr_existing_system_fee",
        failureCode: PAYOUT_CREATION_FAILED_AFTER_FEE_COLLECTED,
      });

      const result = await service.requestPayout({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const failure = expectAppFailure(result);
      expect(failure.error.code).toBe("RESOURCE_CONFLICT");
      expect(await getPayoutRequestById(ctx, existing.id)).toEqual(
        expect.objectContaining({
          status: "manual_review_required",
          system_fee_state: "succeeded",
          stripe_account_debit_payment_id: "py_existing_system_fee",
          stripe_account_debit_transfer_id: "tr_existing_system_fee",
        })
      );
      expect(stripeDouble.chargeCreateCalls).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });
  });

  describe("画面表示用状態", () => {
    let ctx: PayoutContextFixture;
    let service: PayoutRequestService;
    let originalFeeConfig: FeeConfigSnapshot;

    beforeEach(async () => {
      const fixture = await createServiceContext("system-fee-panel");
      ctx = fixture.ctx;
      service = fixture.service;
      originalFeeConfig = fixture.originalFeeConfig;
    });

    afterEach(async () => {
      await cleanupContext(ctx, originalFeeConfig);
    });

    // 手数料以下の残高で既存のno_available_balanceと区別できるようにする
    it("available残高がsystem_fee_amount以下の時、PayoutPanelStateのdisabledReasonはbelow_payout_feeであること", async () => {
      stripeDouble.setBalance({
        available: [{ amount: PAYOUT_FEE, currency: "jpy", source_types: { card: PAYOUT_FEE } }],
      });

      const result = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      expect(success.data).toEqual(
        expect.objectContaining({
          availableAmount: PAYOUT_FEE,
          payoutRequestFeeAmount: PAYOUT_FEE,
          payoutAmount: 0,
          canRequestPayout: false,
          disabledReason: "below_payout_fee",
        })
      );
      expect(await listPayoutRequests(ctx)).toHaveLength(0);
      expect(stripeDouble.chargeCreateCalls).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });

    // 既に手数料回収済みで手動確認が必要な状態をUIで復旧ボタンにしない
    it("Account Debit成功後のmanual_review_requiredが最新requestの時、PayoutPanelStateはrequest_in_progressとしてpayout再実行不可であること", async () => {
      const existing = await createPayoutRequestFixture(ctx, {
        status: "manual_review_required",
        amount: 740,
        grossAmount: 1000,
        systemFeeAmount: PAYOUT_FEE,
        systemFeeState: "succeeded",
        stripeAccountDebitPaymentId: "py_existing_system_fee",
        stripeAccountDebitTransferId: "tr_existing_system_fee",
        failureCode: PAYOUT_CREATION_FAILED_AFTER_FEE_COLLECTED,
      });
      stripeDouble.setBalance({
        available: [{ amount: 1000, currency: "jpy", source_types: { card: 1000 } }],
      });

      const result = await service.getPayoutPanelState({
        userId: ctx.user.id,
        communityId: ctx.communityId,
      });

      const success = expectAppSuccess(result);
      expect(success.data).toEqual(
        expect.objectContaining({
          availableAmount: 1000,
          payoutAmount: 740,
          canRequestPayout: false,
          disabledReason: "request_in_progress",
          latestRequest: expect.objectContaining({
            id: existing.id,
            status: "manual_review_required",
            systemFeeState: "succeeded",
          }),
        })
      );
      expect(stripeDouble.chargeCreateCalls).toHaveLength(0);
      expect(stripeDouble.payoutCreateCalls).toHaveLength(0);
    });
  });
});
