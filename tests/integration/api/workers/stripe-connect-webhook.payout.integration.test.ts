import { NextRequest } from "next/server";

import { POST as ConnectWorkerPOST } from "../../../../app/api/workers/stripe-connect-webhook/route";
import {
  createPayoutContextFixture,
  createPayoutRequestFixture,
  getPayoutRequestById,
  buildPayout,
  type PayoutContextFixture,
} from "../../../helpers/stripe-connect-payout-fixtures";

// QStash Receiver.verify を常にtrueにする
const mockVerify = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Receiver: jest.fn().mockImplementation(() => ({
    verify: (...args: unknown[]) => mockVerify(...args),
  })),
}));

/**
 * テスト用のQStashリクエストを作成する
 */
function createRequest(body: unknown, headersInit?: Record<string, string>) {
  const url = new URL("http://localhost/api/workers/stripe-connect-webhook");
  const headers = new Headers({
    "Upstash-Signature": "sig_test",
    "Upstash-Message-Id": "msg_test_payout",
    "Upstash-Retried": "0",
    ...headersInit,
  });
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("Stripe Connect Payout Webhook 統合テスト", () => {
  beforeEach(() => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = "test_current_key";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test_next_key";
    mockVerify.mockResolvedValue(true);
  });

  describe("payout.paid", () => {
    let ctx: PayoutContextFixture;
    let payoutRequestId: string;

    beforeEach(async () => {
      // Arrange (データの作成)
      ctx = await createPayoutContextFixture({ emailPrefix: "payout-paid" });
      const request = await createPayoutRequestFixture(ctx, {
        status: "requesting",
        stripeAccountId: ctx.stripeAccountId,
        amount: 1000,
      });
      payoutRequestId = request.id;
    });

    afterEach(async () => {
      // Cleanup (データの削除)
      await ctx.cleanup();
    });

    it("payout.paidを受け取った時、204を返しpayout_requestがpaidへ更新されfailure情報が空であること", async () => {
      // Arrange
      const payout = buildPayout(
        ctx,
        { id: payoutRequestId, amount: 1000 },
        { id: "po_test_paid", status: "paid" }
      );
      const event = {
        id: "evt_payout_paid",
        type: "payout.paid",
        account: ctx.stripeAccountId,
        data: { object: payout },
      };
      const req = createRequest({ event });

      // Act
      const res = await ConnectWorkerPOST(req);

      // Assert
      expect(res.status).toBe(204);

      // 戻り値の検証（DB更新状態）
      const updated = await getPayoutRequestById(ctx, payoutRequestId);
      expect(updated?.status).toBe("paid");
      expect(updated?.stripe_payout_id).toBe("po_test_paid");
      expect(updated?.failure_code).toBeNull();
      expect(updated?.failure_message).toBeNull();
    });
  });

  describe("不正・未知イベント", () => {
    let ctx: PayoutContextFixture;
    let payoutRequestId: string;

    beforeEach(async () => {
      // Arrange (データの作成)
      ctx = await createPayoutContextFixture({ emailPrefix: "payout-invalid" });
      const request = await createPayoutRequestFixture(ctx, {
        status: "requesting",
        stripeAccountId: ctx.stripeAccountId,
        amount: 1000,
      });
      payoutRequestId = request.id;
    });

    afterEach(async () => {
      // Cleanup (データの削除)
      await ctx.cleanup();
    });

    it("event.accountが対象payout_requestのstripe_account_idと一致しない時、489を返しpayout_requestを更新しないこと", async () => {
      // Arrange
      const payout = buildPayout(
        ctx,
        { id: payoutRequestId, amount: 1000 },
        { id: "po_test_mismatch", status: "paid" }
      );
      const event = {
        id: "evt_payout_mismatch",
        type: "payout.paid",
        account: "acct_mismatch", // 不一致なアカウントID
        data: { object: payout },
      };
      const req = createRequest({ event });

      // Act
      const res = await ConnectWorkerPOST(req);

      // Assert
      expect(res.status).toBe(489);
      expect(res.headers.get("Upstash-NonRetryable-Error")).toBe("true");

      // 不変条件の検証 (DB状態が変わっていないこと)
      const unchanged = await getPayoutRequestById(ctx, payoutRequestId);
      expect(unchanged?.status).toBe("requesting");
    });

    it("payout以外の未対応Connectイベントを受け取った時、204を返しpayout_requestsを更新しないこと", async () => {
      // Arrange
      const event = {
        id: "evt_unsupported",
        type: "account.external_account.created", // 未対応イベント
        account: ctx.stripeAccountId,
        data: { object: { id: "ba_123" } },
      };
      const req = createRequest({ event });

      // Act
      const res = await ConnectWorkerPOST(req);

      // Assert
      expect(res.status).toBe(204);

      // 不変条件の検証 (DB状態が変わっていないこと)
      const unchanged = await getPayoutRequestById(ctx, payoutRequestId);
      expect(unchanged?.status).toBe("requesting");
    });
  });
});
