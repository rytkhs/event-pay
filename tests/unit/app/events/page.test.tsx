/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

const requireNonEmptyCommunityWorkspaceForServerComponent = jest.fn();
const createServerComponentSupabaseClient = jest.fn();
const listEventsForCommunity = jest.fn();

jest.mock("@core/community/app-workspace", () => ({
  requireNonEmptyCommunityWorkspaceForServerComponent,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerComponentSupabaseClient,
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

jest.mock("@/components/errors/ui/ErrorCard", () => ({
  InlineErrorCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

jest.mock("@features/events", () => ({
  EventListWithFilters: ({
    events,
    totalCount,
  }: {
    events: Array<{ title: string }>;
    totalCount: number;
  }) => (
    <div>
      <div>{totalCount} EVENTS FOUND</div>
      <div>{events.map((event) => event.title).join(",")}</div>
    </div>
  ),
}));

jest.mock("@features/events/server", () => ({
  listEventsForCommunity,
}));

describe("EventsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("community 空状態なら /dashboard redirect を優先し一覧取得しない", async () => {
    requireNonEmptyCommunityWorkspaceForServerComponent.mockRejectedValue(
      new Error("NEXT_REDIRECT:/dashboard")
    );

    const EventsPage = (await import("../../../../app/(app)/events/page")).default;

    await expect(EventsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard"
    );
    expect(createServerComponentSupabaseClient).not.toHaveBeenCalled();
    expect(listEventsForCommunity).not.toHaveBeenCalled();
  });

  it("current community の文脈で一覧を取得しヘッダーにコミュニティ名を表示する", async () => {
    createServerComponentSupabaseClient.mockResolvedValue({ from: jest.fn() });
    requireNonEmptyCommunityWorkspaceForServerComponent.mockResolvedValue({
      isCommunityEmptyState: false,
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
      },
    });
    listEventsForCommunity.mockResolvedValue({
      success: true,
      data: {
        items: [{ id: "event-1", title: "交流会" }],
        totalCount: 1,
        hasMore: false,
      },
    });

    const EventsPage = (await import("../../../../app/(app)/events/page")).default;
    const ui = await EventsPage({
      searchParams: Promise.resolve({
        page: "2",
        limit: "12",
        sortBy: "created_at",
        sortOrder: "asc",
        status: "past",
      }),
    });

    render(ui);

    expect(listEventsForCommunity).toHaveBeenCalledTimes(1);
    expect(listEventsForCommunity).toHaveBeenCalledWith(
      expect.anything(),
      "community-1",
      expect.objectContaining({
        limit: 12,
        offset: 12,
        sortBy: "created_at",
        sortOrder: "asc",
        statusFilter: "past",
      })
    );
    expect(screen.getByText("1 EVENTS FOUND")).toBeInTheDocument();
    expect(screen.getByText("交流会")).toBeInTheDocument();
  });
});
