export type MobilePrimaryNav = "dashboard" | "events" | "create" | "settings";

export type MobilePageConfig = {
  title: string;
  activeNav: MobilePrimaryNav | null;
  backHref: string | null;
  showTabs: boolean;
};

function createConfig(
  title: string,
  activeNav: MobilePrimaryNav | null,
  backHref: string | null = null,
  showTabs = activeNav !== null
): MobilePageConfig {
  return {
    title,
    activeNav,
    backHref,
    showTabs,
  };
}

export function resolveMobilePageConfig(pathname: string): MobilePageConfig {
  if (pathname === "/dashboard") {
    return createConfig("ホーム", "dashboard");
  }

  if (pathname === "/dashboard/settlement-reports") {
    return createConfig("清算レポート", "dashboard", "/dashboard");
  }

  if (pathname === "/events") {
    return createConfig("イベント一覧", "events");
  }

  if (pathname === "/events/create") {
    return createConfig("新規イベント", "create", "/events");
  }

  if (/^\/events\/[^/]+\/edit$/.test(pathname)) {
    const eventPath = pathname.replace(/\/edit$/, "");
    return createConfig("イベント編集", "events", eventPath);
  }

  if (/^\/events\/[^/]+\/forbidden$/.test(pathname)) {
    return createConfig("アクセス不可", "events", "/events");
  }

  if (/^\/events\/[^/]+$/.test(pathname)) {
    return createConfig("イベント詳細", "events", "/events");
  }

  if (pathname === "/settings") {
    return createConfig("設定", "settings");
  }

  if (pathname === "/settings/community") {
    return createConfig("コミュニティ", "settings", "/settings");
  }

  if (pathname === "/settings/payments") {
    return createConfig("オンライン集金", "settings", "/settings");
  }

  if (pathname === "/settings/payments/guide") {
    return createConfig("Stripe 接続ガイド", "settings", "/settings/payments");
  }

  if (pathname === "/settings/payments/return") {
    return createConfig("Stripe 連携確認", "settings", "/settings/payments");
  }

  if (pathname === "/settings/payments/refresh") {
    return createConfig("Stripe 再連携", "settings", "/settings/payments");
  }

  if (pathname === "/settings/payments/error") {
    return createConfig("Stripe 接続エラー", "settings", "/settings/payments");
  }

  if (pathname === "/settings/profile") {
    return createConfig("アカウント", "settings", "/settings");
  }

  if (pathname === "/settings/security") {
    return createConfig("パスワード", "settings", "/settings");
  }

  if (pathname === "/communities/create") {
    return createConfig("コミュニティ作成", null, "/dashboard", false);
  }

  return createConfig("みんなの集金", null, null, false);
}

export function isMobileTabActive(tabHref: string, activeNav: MobilePrimaryNav | null) {
  if (tabHref === "/dashboard") {
    return activeNav === "dashboard";
  }

  if (tabHref === "/events") {
    return activeNav === "events";
  }

  if (tabHref === "/events/create") {
    return activeNav === "create";
  }

  if (tabHref === "/settings") {
    return activeNav === "settings";
  }

  return false;
}
