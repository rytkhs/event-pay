import { stripe } from "@/lib/stripe/client";
// Stripe クライアントの transfers オブジェクトをモックして spyOn 可能にする
jest.mock("@/lib/stripe/client", () => ({
  stripe: {
    transfers: {
      create: jest.fn(),
    },
  },
}));
import { StripeTransferService } from "@/lib/services/payout/stripe-transfer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process.env as any).NODE_ENV = "ci";

const service = new StripeTransferService();

describe("StripeTransferService - 重複 Transfer 防止", () => {
  it("同じ payout_id での再試行でも Transfer は1件だけ作成される", async () => {
    const createdTransfers = new Map<string, any>();

    // stripe.transfers.create をモック
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripeClient: any = stripe; // jest.mock により transfers オブジェクトが存在する
    const createMock = jest
      .spyOn(stripeClient.transfers, "create")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(async (params: any, opts: any) => {
        const idemKey: string | undefined = opts?.idempotencyKey;
        if (!idemKey) {
          throw new Error("idempotencyKey が付与されていません");
        }

        // 既に作成済みなら同一 Transfer を返す
        if (createdTransfers.has(idemKey)) {
          return createdTransfers.get(idemKey);
        }

        // Transfer オブジェクトを生成してキャッシュ
        const transferObj = {
          id: "tr_mock_" + Math.random().toString(36).substring(2, 10),
          amount: params.amount,
          destination: params.destination,
          created: Math.floor(Date.now() / 1000),
        } as const;

        createdTransfers.set(idemKey, transferObj);

        // 1 回目だけ 5xx エラーを投げてリトライさせる
        if (createdTransfers.size === 1) {
          const err = new Error("stripe internal error") as any;
          err.statusCode = 500;
          throw err;
        }

        return transferObj;
      });

    // テスト用の送金パラメータ
    const testParams = {
      amount: 1337,
      currency: "jpy" as const,
      destination: "acct_123456",
      metadata: {
        payout_id: "11111111-2222-3333-4444-555555555555",
        event_id: "event_test",
        user_id: "user_test",
      },
    } as const;

    // 1回目: Stripe内部エラー→リトライ成功で Transfer 作成
    const firstResult = await service.createTransfer(testParams);

    // 2回目: transfers.create を成功させるようにモックを更新
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createMock.mockImplementation(async (params: any, opts: any) => {
      const idemKey = opts?.idempotencyKey;
      if (!idemKey) throw new Error("missing key");
      if (createdTransfers.has(idemKey)) {
        return createdTransfers.get(idemKey);
      }
      const transferObj = {
        id: "tr_mock_existing",
        amount: params.amount,
        destination: params.destination,
        created: Math.floor(Date.now() / 1000),
      } as const;
      createdTransfers.set(idemKey, transferObj);
      return transferObj;
    });

    const secondResult = await service.createTransfer(testParams);

    // 同一 Transfer が返ってきているか確認
    expect(createdTransfers.size).toBe(1);
    const existing = createdTransfers.values().next().value;
    expect(firstResult.transferId).toBe(existing.id);
    expect(secondResult.transferId).toBe(existing.id);

    // 合計 3 回 (1回目: エラー, 成功 / 2回目: キャッシュ成功) が呼ばれているはず
    expect(createMock).toHaveBeenCalledTimes(3);
  });
});
