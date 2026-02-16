import { isTerminalDatabaseError } from "@features/payments/services/webhook/errors/webhook-db-error";

describe("isTerminalDatabaseError", () => {
  it("code がなくても cardinality メッセージなら terminal=true を返す", () => {
    expect(
      isTerminalDatabaseError({
        code: null,
        message: "JSON object requested, multiple rows returned",
        details: null,
      })
    ).toBe(true);
  });

  it("SQLSTATE 22/23 は terminal=true を返す", () => {
    expect(
      isTerminalDatabaseError({
        code: "23505",
        message: "duplicate key value violates unique constraint",
      })
    ).toBe(true);
  });

  it("非対象エラーは terminal=false を返す", () => {
    expect(
      isTerminalDatabaseError({
        code: "57014",
        message: "canceling statement due to statement timeout",
      })
    ).toBe(false);
  });
});
