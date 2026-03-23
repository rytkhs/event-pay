/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

const requireNonEmptyCommunityWorkspaceForServerComponent = jest.fn();
const createServerComponentSupabaseClient = jest.fn();
const getEventPayoutProfileReadiness = jest.fn();
const getOwnedEventContextForCurrentCommunity = jest.fn();

jest.mock("@core/community/app-workspace", () => ({
  requireNonEmptyCommunityWorkspaceForServerComponent,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerComponentSupabaseClient,
}));

jest.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock("@features/events", () => ({
  SinglePageEventEditForm: () => <div>edit-form</div>,
}));

jest.mock("@features/events/server", () => ({
  getEventPayoutProfileReadiness,
  getOwnedEventContextForCurrentCommunity,
}));

jest.mock("../../../../app/(app)/events/[id]/edit/actions", () => ({
  updateEventAction: jest.fn(),
}));

jest.mock("../../../../app/(app)/events/[id]/edit/components/EventDangerZone", () => ({
  EventDangerZone: () => <div>danger-zone</div>,
}));

describe("EventEditPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("current community 不一致なら forbidden へ redirect する", async () => {
    requireNonEmptyCommunityWorkspaceForServerComponent.mockResolvedValue({
      currentCommunity: { id: "community-1", name: "A" },
    });
    createServerComponentSupabaseClient.mockResolvedValue({});
    getOwnedEventContextForCurrentCommunity.mockResolvedValue({
      success: false,
      error: { code: "EVENT_ACCESS_DENIED" },
    });

    const EventEditPage = (await import("../../../../app/(app)/events/[id]/edit/page")).default;

    await expect(
      EventEditPage({
        params: Promise.resolve({ id: "event-1" }),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-1/forbidden");
  });

  it("current community 一致時は編集フォームを表示する", async () => {
    requireNonEmptyCommunityWorkspaceForServerComponent.mockResolvedValue({
      currentCommunity: { id: "community-1", name: "A" },
    });
    getOwnedEventContextForCurrentCommunity.mockResolvedValue({
      success: true,
      data: {
        id: "00000000-0000-0000-0000-000000000001",
        communityId: "community-1",
        createdBy: "user-1",
      },
    });
    getEventPayoutProfileReadiness.mockResolvedValue({ isReady: true });

    const eventsQuery = {
      select: jest.fn(),
      eq: jest.fn(),
      single: jest.fn(),
      overrideTypes: jest.fn(),
    } as any;
    eventsQuery.select.mockReturnValue(eventsQuery);
    eventsQuery.eq.mockReturnValue(eventsQuery);
    eventsQuery.single.mockReturnValue(eventsQuery);
    eventsQuery.overrideTypes.mockResolvedValue({
      data: {
        id: "00000000-0000-0000-0000-000000000001",
        title: "春合宿",
        description: "desc",
        location: "Tokyo",
        date: "2099-01-01T10:00:00.000Z",
        fee: 3000,
        capacity: 30,
        payment_methods: ["cash"],
        registration_deadline: "2098-12-25T10:00:00.000Z",
        payment_deadline: null,
        allow_payment_after_deadline: false,
        grace_period_days: 0,
        created_at: "2098-10-01T10:00:00.000Z",
        updated_at: "2098-10-02T10:00:00.000Z",
        created_by: "user-1",
        community_id: "community-1",
        payout_profile_id: "payout-1",
        invite_token: "invite-token",
        canceled_at: null,
        attendances: [],
      },
      error: null,
    });

    const paymentsQuery = {
      select: jest.fn(),
      eq: jest.fn(),
      in: jest.fn(),
      limit: jest.fn(),
    } as any;
    paymentsQuery.select.mockReturnValue(paymentsQuery);
    paymentsQuery.eq.mockReturnValue(paymentsQuery);
    paymentsQuery.in.mockReturnValue(paymentsQuery);
    paymentsQuery.limit.mockResolvedValue({
      data: [],
      error: null,
    });

    createServerComponentSupabaseClient.mockResolvedValue({
      from: jest.fn((table: string) => {
        if (table === "events") return eventsQuery;
        if (table === "payments") return paymentsQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const EventEditPage = (await import("../../../../app/(app)/events/[id]/edit/page")).default;
    const ui = await EventEditPage({
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000001" }),
    });

    render(ui);

    expect(screen.getByText("edit-form")).toBeInTheDocument();
    expect(getOwnedEventContextForCurrentCommunity).toHaveBeenCalledWith(
      expect.anything(),
      "00000000-0000-0000-0000-000000000001",
      "community-1"
    );
    expect(paymentsQuery.eq).toHaveBeenCalledWith(
      "attendances.event_id",
      "00000000-0000-0000-0000-000000000001"
    );
  });
});
