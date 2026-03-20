/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockUsePathname = jest.fn(() => "/events");

jest.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
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

jest.mock("@/components/ui/breadcrumb", () => ({
  Breadcrumb: ({ children }: { children: React.ReactNode }) => <nav>{children}</nav>,
  BreadcrumbItem: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  BreadcrumbLink: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  BreadcrumbList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BreadcrumbPage: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  BreadcrumbSeparator: () => <span>/</span>,
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
    mockUsePathname.mockReturnValue("/events");
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
    expect(screen.getByText("ボドゲ会")).toBeInTheDocument();
    expect(screen.getByText("イベント一覧")).toBeInTheDocument();
  });

  it("communities/create では breadcrumb にコミュニティ / 新規作成を表示する", async () => {
    mockUsePathname.mockReturnValue("/communities/create");

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

    expect(screen.getByText("コミュニティ")).toBeInTheDocument();
    expect(screen.getByText("新規作成")).toBeInTheDocument();
  });
});
