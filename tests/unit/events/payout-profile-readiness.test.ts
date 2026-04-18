import { getEventPayoutProfileReadiness } from "@features/events/services/payout-profile-readiness";

function createSupabaseMock(row: { status: string } | null, error: unknown = null) {
  type QueryMock = {
    select: jest.Mock<QueryMock, [string]>;
    eq: jest.Mock<QueryMock, [string, string]>;
    maybeSingle: jest.Mock<Promise<{ data: { status: string } | null; error: unknown }>, []>;
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
  it("uses only status for online collection readiness", async () => {
    const { query, from } = createSupabaseMock({ status: "verified" });

    const result = await getEventPayoutProfileReadiness(
      { from } as any,
      "11111111-1111-4111-8111-111111111111"
    );

    expect(result).toEqual({ isReady: true });
    expect(query.select).toHaveBeenCalledWith("status");
  });

  it("rejects non-verified payout profiles", async () => {
    const { from } = createSupabaseMock({ status: "onboarding" });

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
