/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

const resolveAppWorkspaceForServerComponent = jest.fn();
const toAppWorkspaceShellData = jest.fn();
const ensureFeaturesRegistered = jest.fn();

jest.mock("@core/community/app-workspace", () => ({
  resolveAppWorkspaceForServerComponent,
  toAppWorkspaceShellData,
}));

jest.mock("@core/announcements/community-announcement", () => ({
  resolveCommunityAnnouncementForServerComponent: jest.fn().mockResolvedValue({
    shouldShow: false,
  }),
}));

jest.mock("@features/demo", () => ({
  DemoBanner: () => <div data-testid="demo-banner" />,
}));

jest.mock("@components/layout/AppSidebar", () => ({
  AppSidebar: ({ workspace }: { workspace: unknown }) => (
    <div data-testid="app-sidebar">
      <span data-testid="app-sidebar-workspace">{JSON.stringify(workspace)}</span>
    </div>
  ),
}));

jest.mock("@components/layout/Header", () => ({
  Header: () => <div data-testid="header" />,
}));

jest.mock("@components/layout/MobileAppChrome", () => ({
  MobileAppChrome: () => <div data-testid="mobile-app-chrome" />,
}));

jest.mock("@/app/(auth)/actions", () => ({
  logoutAction: jest.fn(),
}));

jest.mock("@/app/_actions/stripe-connect/actions", () => ({
  createExpressDashboardLoginLinkAction: jest.fn(),
}));

jest.mock("@/app/_init/feature-registrations", () => ({
  ensureFeaturesRegistered,
}));

jest.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("AppLayout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("workspace loader を 1 回呼び、AppSidebar に shell data を渡す", async () => {
    const workspace = {
      currentUser: {
        id: "user-1",
        email: "owner@example.com",
        name: "集金 太郎",
      },
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
        slug: "board-games",
        createdAt: "2026-03-01T00:00:00.000Z",
      },
      ownedCommunities: [],
      hasOwnedCommunities: true,
      isCommunityEmptyState: false,
      currentCommunityResolution: {
        currentCommunity: null,
        ownedCommunities: [],
        requestedCommunityId: null,
        resolvedBy: "cookie",
      },
    };
    const shellData = {
      currentCommunity: workspace.currentCommunity,
      ownedCommunities: workspace.ownedCommunities,
      hasOwnedCommunities: workspace.hasOwnedCommunities,
      isCommunityEmptyState: workspace.isCommunityEmptyState,
    };

    resolveAppWorkspaceForServerComponent.mockResolvedValue(workspace);
    toAppWorkspaceShellData.mockReturnValue(shellData);

    const { default: AppLayout } = await import("@/app/(app)/layout");
    const ui = await AppLayout({ children: <div>child-content</div> });

    render(ui);

    expect(ensureFeaturesRegistered).toHaveBeenCalledTimes(1);
    expect(resolveAppWorkspaceForServerComponent).toHaveBeenCalledTimes(1);
    expect(toAppWorkspaceShellData).toHaveBeenCalledWith(workspace);
    expect(screen.getByTestId("app-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByText("child-content")).toBeInTheDocument();
    expect(screen.getByTestId("app-sidebar-workspace")).toHaveTextContent(
      JSON.stringify(shellData)
    );
  });
});
