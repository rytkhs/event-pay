import {
  buildEventManagementSearchParams,
  parseEventManagementQuery,
} from "@/app/(app)/events/[id]/query-params";

describe("event-management query params", () => {
  describe("parseEventManagementQuery", () => {
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

    it("defaults order to desc when sort is present but order is invalid", () => {
      const query = parseEventManagementQuery({
        sort: "nickname",
        order: "invalid",
      });

      expect(query).toMatchObject({
        sort: "nickname",
        order: "desc",
      });
    });
  });

  describe("buildEventManagementSearchParams", () => {
    it("removes default values from search params", () => {
      const params = buildEventManagementSearchParams("?tab=participants&attendance=attending", {
        tab: "overview",
        attendance: "all",
        smart: true,
        page: 1,
        limit: 150,
      });

      expect(params.toString()).toBe("");
    });

    it("resets pagination on filter updates", () => {
      const params = buildEventManagementSearchParams("?tab=participants&page=3", {
        search: "bob",
      });

      expect(params.get("search")).toBe("bob");
      expect(params.get("page")).toBeNull();
    });

    it("clears manual sort when smart sort is enabled", () => {
      const params = buildEventManagementSearchParams(
        "?tab=participants&smart=0&sort=nickname&order=asc",
        {
          smart: true,
          sort: undefined,
          order: undefined,
        }
      );

      expect(params.get("smart")).toBeNull();
      expect(params.get("sort")).toBeNull();
      expect(params.get("order")).toBeNull();
    });

    it("preserves other filters when changing tabs", () => {
      const params = buildEventManagementSearchParams(
        "?search=alice&attendance=attending&smart=0",
        {
          tab: "participants",
        }
      );

      expect(params.get("tab")).toBe("participants");
      expect(params.get("search")).toBe("alice");
      expect(params.get("attendance")).toBe("attending");
      expect(params.get("smart")).toBe("0");
    });

    it("preserves tab when updating filters", () => {
      const params = buildEventManagementSearchParams("?tab=participants", {
        search: "alice",
      });

      expect(params.get("tab")).toBe("participants");
      expect(params.get("search")).toBe("alice");
    });
  });
});
