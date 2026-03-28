/** @jest-environment jsdom */

import React from "react";

const requireNonEmptyCommunityWorkspaceForServerComponent = jest.fn();
const resolveAppWorkspaceForServerComponent = jest.fn();
const getEventDetailAction = jest.fn();
const getEventStatsAction = jest.fn();
const getEventParticipantsAction = jest.fn();
const handleServerError = jest.fn();

jest.mock("@core/community/app-workspace", () => ({
  requireNonEmptyCommunityWorkspaceForServerComponent,
  resolveAppWorkspaceForServerComponent,
}));

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError,
}));

jest.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

jest.mock("../../../../app/(app)/events/[id]/actions", () => ({
  getEventDetailAction,
  getEventStatsAction,
  getEventParticipantsAction,
}));

jest.mock("../../../../app/(app)/events/[id]/participants/actions", () => ({
  updateCashStatusAction: jest.fn(),
  bulkUpdateCashStatusAction: jest.fn(),
}));

jest.mock("@features/events/server", () => ({
  buildCollectionProgressSummary: jest.fn(() => null),
}));

jest.mock("../../../../app/(app)/events/[id]/components/EventManagementPage", () => ({
  EventManagementPage: ({ eventId }: { eventId: string }) => <div>{eventId}</div>,
}));

describe("EventDetailPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("current community 不一致なら forbidden へ redirect する", async () => {
    requireNonEmptyCommunityWorkspaceForServerComponent.mockResolvedValue({
      currentCommunity: { id: "community-1", name: "A" },
    });
    getEventDetailAction.mockResolvedValue({
      success: false,
      error: {
        code: "EVENT_ACCESS_DENIED",
        userMessage: "denied",
        correlationId: "corr-1",
        retryable: false,
      },
    });

    const EventDetailPage = (await import("../../../../app/(app)/events/[id]/page")).default;

    await expect(
      EventDetailPage({
        params: Promise.resolve({ id: "event-1" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/events/event-1/forbidden");

    expect(getEventDetailAction).toHaveBeenCalledWith("event-1", "community-1");
    expect(getEventStatsAction).not.toHaveBeenCalled();
    expect(getEventParticipantsAction).not.toHaveBeenCalled();
  });

  it("metadata は current community 不一致時に汎用タイトルへフォールバックする", async () => {
    resolveAppWorkspaceForServerComponent.mockResolvedValue({
      currentCommunity: { id: "community-1", name: "A" },
    });
    getEventDetailAction.mockResolvedValue({
      success: false,
      error: {
        code: "EVENT_ACCESS_DENIED",
        userMessage: "denied",
        correlationId: "corr-1",
        retryable: false,
      },
    });

    const { generateMetadata } = await import("../../../../app/(app)/events/[id]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "event-1" }),
    });

    expect(metadata.title).toBe("イベント詳細");
    expect(getEventDetailAction).toHaveBeenCalledWith("event-1", "community-1");
  });

  it("詳細取得成功時は stats と participants に current community を渡す", async () => {
    requireNonEmptyCommunityWorkspaceForServerComponent.mockResolvedValue({
      currentCommunity: { id: "community-1", name: "A" },
    });
    getEventDetailAction.mockResolvedValue({
      success: true,
      data: {
        id: "event-1",
        title: "Event",
        description: null,
        location: "Tokyo",
        date: "2099-01-01T00:00:00.000Z",
        fee: 1000,
        capacity: null,
        status: "upcoming",
        payment_methods: ["cash"],
        registration_deadline: "2098-12-25T00:00:00.000Z",
        payment_deadline: null,
        allow_payment_after_deadline: false,
        grace_period_days: 0,
        created_at: "2098-01-01T00:00:00.000Z",
        updated_at: "2098-01-01T00:00:00.000Z",
        created_by: "user-1",
        community_id: "community-1",
        invite_token: "invite-token",
        canceled_at: null,
        creator_name: "Owner",
        attendances_count: 0,
      },
    });
    getEventStatsAction.mockResolvedValue({
      success: true,
      data: { attending_count: 1, maybe_count: 2 },
    });
    getEventParticipantsAction.mockResolvedValue({
      success: true,
      data: { participants: [] },
    });

    const EventDetailPage = (await import("../../../../app/(app)/events/[id]/page")).default;

    await EventDetailPage({
      params: Promise.resolve({ id: "event-1" }),
      searchParams: Promise.resolve({}),
    });

    expect(getEventStatsAction).toHaveBeenCalledWith("event-1", "community-1");
    expect(getEventParticipantsAction).toHaveBeenCalledWith({
      eventId: "event-1",
      currentCommunityId: "community-1",
    });
  });
});
