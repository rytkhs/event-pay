import { getEventPayoutProfileReadiness } from "@features/events/services/payout-profile-readiness";

function createSupabaseMock(row: { collection_ready: boolean } | null, error: unknown = null) {
  type QueryMock = {
    select: jest.Mock<QueryMock, [string]>;
    eq: jest.Mock<QueryMock, [string, string]>;
    maybeSingle: jest.Mock<
      Promise<{ data: { collection_ready: boolean } | null; error: unknown }>,
      []
    >;
  };

  const query = {} as QueryMock;
  query.select = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.maybeSingle = jest.fn(async () => ({ data: row, error }));

  return {
    from: jest.fn(() => query),
    query,
  };
}

describe("getEventPayoutProfileReadiness", () => {
  it("uses collection_ready for online collection readiness", async () => {
    const { query, from } = createSupabaseMock({ collection_ready: true });

    const result = await getEventPayoutProfileReadiness(
      { from } as any,
      "11111111-1111-4111-8111-111111111111"
    );

    expect(result).toEqual({ isReady: true });
    expect(query.select).toHaveBeenCalledWith("collection_ready");
  });

  it("rejects collection-unready payout profiles", async () => {
    const { from } = createSupabaseMock({ collection_ready: false });

    const result = await getEventPayoutProfileReadiness(
      { from } as any,
      "11111111-1111-4111-8111-111111111111"
    );

    expect(result).toEqual({
      isReady: false,
      userMessage: "オンライン決済を追加するには受取先プロファイルの設定完了が必要です。",
    });
  });
});
