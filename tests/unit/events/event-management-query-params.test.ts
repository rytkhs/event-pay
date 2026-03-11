import {
  buildEventManagementHref,
  buildEventManagementSearchParams,
  parseEventManagementQuery,
} from "@/app/(app)/events/[id]/query-params";

describe("event-management query params", () => {
  it("invalid values are normalized to safe defaults", () => {
    const query = parseEventManagementQuery({
      tab: "invalid",
      attendance: "wrong",
      smart: "1",
      sort: "unknown",
      order: "wrong",
      page: "0",
      limit: "999",
    });

    expect(query).toMatchObject({
      tab: "overview",
      attendance: "all",
      smart: true,
      sort: undefined,
      order: undefined,
      page: 1,
      limit: 150,
    });
  });

  it("parses manual sort and participant filters", () => {
    const query = parseEventManagementQuery({
      tab: "participants",
      search: "  alice  ",
      attendance: "attending",
      payment_method: "cash",
      payment_status: "paid",
      smart: "0",
      sort: "nickname",
      order: "asc",
      page: "2",
      limit: "50",
    });

    expect(query).toMatchObject({
      tab: "participants",
      search: "alice",
      attendance: "attending",
      paymentMethod: "cash",
      paymentStatus: "paid",
      smart: false,
      sort: "nickname",
      order: "asc",
      page: 2,
      limit: 50,
    });
  });

  it("resets pagination on filter updates and clears manual sort when smart sort is enabled", () => {
    const params = buildEventManagementSearchParams(
      "?tab=participants&page=3&smart=0&sort=nickname&order=asc",
      {
        search: "bob",
        smart: true,
        sort: undefined,
        order: undefined,
      }
    );

    expect(params.get("tab")).toBe("participants");
    expect(params.get("search")).toBe("bob");
    expect(params.get("page")).toBeNull();
    expect(params.get("smart")).toBeNull();
    expect(params.get("sort")).toBeNull();
    expect(params.get("order")).toBeNull();
  });

  it("builds tab hrefs while preserving participant filters", () => {
    expect(
      buildEventManagementHref(
        "/events/event-1",
        {
          tab: "participants",
          search: "alice",
          attendance: "attending",
          smart: "0",
        },
        { tab: "overview" }
      )
    ).toBe("/events/event-1?search=alice&attendance=attending&smart=0");

    expect(
      buildEventManagementHref(
        "/events/event-1",
        {
          search: "alice",
          attendance: "attending",
        },
        { tab: "participants" }
      )
    ).toBe("/events/event-1?search=alice&attendance=attending&tab=participants");
  });
});
