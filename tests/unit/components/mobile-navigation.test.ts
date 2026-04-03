import { isMobileTabActive, resolveMobilePageConfig } from "@/components/layout/mobile-navigation";

describe("mobile navigation config", () => {
  it("resolves dashboard root as a primary tab page", () => {
    expect(resolveMobilePageConfig("/dashboard")).toEqual({
      title: "ダッシュボード",
      activeNav: "dashboard",
      backHref: null,
      showTabs: true,
    });
  });

  it("marks create event as the create tab and provides a back target", () => {
    expect(resolveMobilePageConfig("/events/create")).toEqual({
      title: "新規イベント",
      activeNav: "create",
      backHref: "/events",
      showTabs: true,
    });
  });

  it("switches event detail title when participants tab is active", () => {
    const searchParams = new URLSearchParams("tab=participants");

    expect(resolveMobilePageConfig("/events/event_123", searchParams)).toEqual({
      title: "参加者管理",
      activeNav: "events",
      backHref: "/events",
      showTabs: true,
    });
  });

  it("keeps settings descendants under the settings tab", () => {
    expect(resolveMobilePageConfig("/settings/payments/return")).toEqual({
      title: "Stripe 連携確認",
      activeNav: "settings",
      backHref: "/settings/payments",
      showTabs: true,
    });
  });

  it("hides primary tabs on non-primary setup pages", () => {
    expect(resolveMobilePageConfig("/communities/create")).toEqual({
      title: "コミュニティ作成",
      activeNav: null,
      backHref: "/dashboard",
      showTabs: false,
    });
  });

  it("matches mobile tab activation by primary route family", () => {
    expect(isMobileTabActive("/dashboard", "dashboard")).toBe(true);
    expect(isMobileTabActive("/events", "events")).toBe(true);
    expect(isMobileTabActive("/events/create", "create")).toBe(true);
    expect(isMobileTabActive("/settings", "settings")).toBe(true);
    expect(isMobileTabActive("/settings", "events")).toBe(false);
  });
});
