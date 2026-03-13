/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";

import { EventManagementTabsShell } from "@/app/(app)/events/[id]/components/EventManagementTabsShell";

const replaceMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

describe("EventManagementTabsShell", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    window.history.replaceState({}, "", "/events/event-1");
  });

  it("タブ切替を即時反映しつつ URL を同期する", async () => {
    const user = userEvent.setup();

    render(
      <EventManagementTabsShell
        eventId="event-1"
        initialTab="overview"
        headerContent={<div>Header</div>}
        overviewContent={<div>Overview Content</div>}
        participantsContent={<div>Participants Content</div>}
        tabLabels={{
          overview: "概要",
          participants: "参加者管理",
        }}
      />
    );

    expect(screen.getByText("Overview Content")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "参加者管理" }));

    expect(screen.getByText("Participants Content")).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/events/event-1?tab=participants", {
      scroll: false,
    });
  });
});
