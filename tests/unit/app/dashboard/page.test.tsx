/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

const resolveAppWorkspaceForServerComponent = jest.fn();
const createDashboardDataResource = jest.fn();
const redirect = jest.fn();

jest.mock("@core/community/app-workspace", () => ({
  resolveAppWorkspaceForServerComponent,
}));

jest.mock("next/navigation", () => ({
  redirect,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("../../../../app/(app)/dashboard/_lib/dashboard-data", () => ({
  createDashboardDataResource,
}));

jest.mock("../../../../app/(app)/dashboard/components/DashboardStatsCards", () => ({
  DashboardStatsCards: () => <div>stats</div>,
}));

jest.mock("../../../../app/(app)/dashboard/components/StripeAccountCard", () => ({
  StripeAccountCard: () => <div>stripe-card</div>,
}));

jest.mock("../../../../app/(app)/dashboard/components/ConnectAccountCtaWrapper", () => ({
  ConnectAccountCtaWrapper: () => <div>cta</div>,
}));

jest.mock("../../../../app/(app)/dashboard/components/RecentEventsList", () => ({
  RecentEventsList: () => <div>recent-events</div>,
}));

jest.mock("../../../../app/(app)/dashboard/components/Skeletons", () => ({
  DashboardStatsSkeleton: () => <div>stats-skeleton</div>,
  StripeAccountSkeleton: () => <div>stripe-skeleton</div>,
  RecentEventsSkeleton: () => <div>recent-events-skeleton</div>,
  ConnectAccountCtaSkeleton: () => <div>cta-skeleton</div>,
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("community 空状態なら専用 empty state を表示し dashboard data を読まない", async () => {
    resolveAppWorkspaceForServerComponent.mockResolvedValue({
      isCommunityEmptyState: true,
    });
    redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const DashboardPage = (await import("../../../../app/(app)/dashboard/page")).default;
    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/communities/create");
    expect(createDashboardDataResource).not.toHaveBeenCalled();
  });

  it("community がある場合は通常の dashboard resource を作成する", async () => {
    resolveAppWorkspaceForServerComponent.mockResolvedValue({
      isCommunityEmptyState: false,
      currentUser: {
        id: "user-1",
      },
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
      },
    });
    createDashboardDataResource.mockReturnValue(Promise.resolve({}));

    const DashboardPage = (await import("../../../../app/(app)/dashboard/page")).default;
    const ui = await DashboardPage();

    render(ui);

    expect(createDashboardDataResource).toHaveBeenCalledTimes(1);
    expect(createDashboardDataResource).toHaveBeenCalledWith("user-1", "community-1");
  });
});
