/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

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

jest.mock("@/components/ui/separator", () => ({
  Separator: () => <span data-testid="separator" />,
}));

jest.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => <button type="button">toggle</button>,
}));

describe("Header", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("current community 名を表示する", async () => {
    const { Header } = await import("@/components/layout/Header");

    render(
      <Header
        workspace={{
          currentCommunity: {
            id: "community-1",
            name: "ボドゲ会",
            slug: "board-games",
            createdAt: "2026-03-01T00:00:00.000Z",
          },
          ownedCommunities: [],
          hasOwnedCommunities: true,
          isCommunityEmptyState: false,
        }}
      />
    );

    expect(screen.getByText("現在のコミュニティ")).toBeInTheDocument();
    const badge = screen.getByText("ボドゲ会");
    expect(badge).toBeInTheDocument();
    expect(badge.closest("a")).toHaveAttribute("href", "/settings/community");
  });

  it("コミュニティ未作成時に『未設定』を表示する", async () => {
    const { Header } = await import("@/components/layout/Header");

    render(
      <Header
        workspace={{
          currentCommunity: null,
          ownedCommunities: [],
          hasOwnedCommunities: false,
          isCommunityEmptyState: true,
        }}
      />
    );

    expect(screen.getByText("未設定")).toBeInTheDocument();
  });
});
