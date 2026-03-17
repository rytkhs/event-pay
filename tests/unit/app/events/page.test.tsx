/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

const requireNonEmptyCommunityWorkspaceForServerComponent = jest.fn();
const getEventsAction = jest.fn();

jest.mock("@core/community/app-workspace", () => ({
  requireNonEmptyCommunityWorkspaceForServerComponent,
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
  EventListWithFilters: ({ events }: { events: Array<{ title: string }> }) => (
    <div>{events.map((event) => event.title).join(",")}</div>
  ),
  EventLoading: () => <div>loading</div>,
}));

jest.mock("../../../../app/(app)/events/actions", () => ({
  getEventsAction,
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
    expect(getEventsAction).not.toHaveBeenCalled();
  });
});
