import { ConnectWebhookHandler } from "@features/stripe-connect/server";

import { expectAppSuccess } from "@tests/helpers/assert-result";
import {
  buildPayout,
  createPayoutContextFixture,
  createPayoutRequestFixture,
  getPayoutRequestById,
  type PayoutContextFixture,
  type PayoutRequestFixture,
} from "@tests/helpers/stripe-connect-payout-fixtures";

describe("ConnectWebhookHandler - Payout events", () => {
  let ctx: PayoutContextFixture;
  let request: PayoutRequestFixture;
  let handler: ConnectWebhookHandler;

  beforeEach(async () => {
    ctx = await createPayoutContextFixture({ emailPrefix: "connect-webhook-payout" });
    request = await createPayoutRequestFixture(ctx, {
      status: "created",
      stripePayoutId: "po_webhook_fixture",
    });
    handler = await ConnectWebhookHandler.create();
  });

  afterEach(async () => {
    await ctx.cleanup();
    jest.clearAllMocks();
  });

  describe("handlePayoutCreated", () => {
    // payout.createdの委譲先を固定する。event.account照合はサービス側で必ず行う。
    it("payout.createdを受け取った時、event.account付きでpayout_requestをcreatedへ同期すること", async () => {
      const payout = buildPayout(ctx, request, { id: "po_webhook_fixture", status: "pending" });

      const result = await (handler.handlePayoutCreated as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(result.meta).toEqual(expect.objectContaining({ reason: "payout_created_processed" }));
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "created", stripe_payout_id: "po_webhook_fixture" })
      );
    });
  });

  describe("handlePayoutUpdated", () => {
    // Stripeはイベント順序を保証しないため、サービス側で巻き戻し防止または最新Payout取得を行う
    it("payout.updatedを受け取った時、event.account付きでpayout_requestをStripe Payoutの現在状態へ同期すること", async () => {
      const payout = buildPayout(ctx, request, {
        id: "po_webhook_fixture",
        status: "canceled",
      });

      const result = await (handler.handlePayoutUpdated as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(result.meta).toEqual(expect.objectContaining({ reason: "payout_updated_processed" }));
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "canceled", stripe_payout_id: "po_webhook_fixture" })
      );
    });
  });

  describe("handlePayoutPaid", () => {
    // 既存のログのみ実装からDB更新へ変えることを固定する
    it("payout.paidを受け取った時、ログ出力だけで終えずpayout_requestをpaidへ同期すること", async () => {
      const payout = buildPayout(ctx, request, { id: "po_webhook_fixture", status: "paid" });

      const result = await (handler.handlePayoutPaid as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(result.meta).toEqual(expect.objectContaining({ reason: "payout_paid_processed" }));
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({
          status: "paid",
          stripe_payout_id: "po_webhook_fixture",
          failure_code: null,
          failure_message: null,
        })
      );
    });
  });

  describe("handlePayoutFailed", () => {
    // 既存のログのみ実装からDB更新へ変えることを固定する。Stripeではpaid後にfailedへ変わる場合がある。
    it("payout.failedを受け取った時、ログ出力だけで終えずpayout_requestをfailedへ同期すること", async () => {
      const payout = buildPayout(ctx, request, {
        id: "po_webhook_fixture",
        status: "failed",
        failure_code: "account_closed",
        failure_message: "account closed",
      });

      const result = await (handler.handlePayoutFailed as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(result.meta).toEqual(expect.objectContaining({ reason: "payout_failed_processed" }));
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({
          status: "failed",
          stripe_payout_id: "po_webhook_fixture",
          failure_code: "account_closed",
          failure_message: "account closed",
        })
      );
    });
  });

  describe("handlePayoutCanceled", () => {
    // キャンセル状態を履歴に残すことを固定する
    it("payout.canceledを受け取った時、payout_requestをcanceledへ同期すること", async () => {
      const payout = buildPayout(ctx, request, { id: "po_webhook_fixture", status: "canceled" });

      const result = await (handler.handlePayoutCanceled as any)(payout, ctx.stripeAccountId);

      expectAppSuccess(result);
      expect(result.meta).toEqual(expect.objectContaining({ reason: "payout_canceled_processed" }));
      expect(await getPayoutRequestById(ctx, request.id)).toEqual(
        expect.objectContaining({ status: "canceled", stripe_payout_id: "po_webhook_fixture" })
      );
    });
  });
});
