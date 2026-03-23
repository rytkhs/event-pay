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
});
