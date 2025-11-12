import { NextRequest } from "next/server";

import { POST as ConnectWorkerPOST } from "../../../../app/api/workers/stripe-connect-webhook/route";

// QStash Receiver.verify を常にtrueにする
const mockVerify = jest.fn();
jest.mock("@upstash/qstash", () => ({
  Receiver: jest.fn().mockImplementation(() => ({
    verify: (...args: unknown[]) => mockVerify(...args),
  })),
}));

// ConnectWebhookHandler をスパイ
const handleAccountUpdated = jest.fn();
jest.mock("@features/payments/services/webhook/connect-webhook-handler", () => ({
  ConnectWebhookHandler: {
    create: jest.fn().mockResolvedValue({
      handleAccountUpdated: (...args: unknown[]) => handleAccountUpdated(...args),
      handleAccountApplicationDeauthorized: jest.fn(),
      handlePayoutPaid: jest.fn(),
      handlePayoutFailed: jest.fn(),
    }),
  },
}));

function createRequest(body: unknown, headersInit?: Record<string, string>) {
  const url = new URL("http://localhost/api/workers/stripe-connect-webhook");
  const headers = new Headers({
    "Upstash-Signature": "sig_test",
    "Upstash-Delivery-Id": "deliv_test_789",
    ...headersInit,
  });
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("/api/workers/stripe-connect-webhook (worker)", () => {
  beforeEach(() => {
    process.env.QSTASH_CURRENT_SIGNING_KEY = "test_current_key";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test_next_key";
    mockVerify.mockResolvedValue(true);
    handleAccountUpdated.mockReset();
  });

  it("account.updated を処理してハンドラが呼ばれる", async () => {
    const evt = {
      id: "evt_test_connect_account_updated",
      type: "account.updated",
      data: { object: { id: "acct_test", metadata: { actor_id: "user_123" } } },
    } as any;

    const req = createRequest({ event: evt });
    const res = await ConnectWorkerPOST(req);
    expect(res.status).toBe(200);
    expect(handleAccountUpdated).toHaveBeenCalledTimes(1);
  });
});
