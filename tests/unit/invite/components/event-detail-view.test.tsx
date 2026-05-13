/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import type { InviteEventDetail } from "@core/types/invite";

import { EventDetailView } from "@features/invite/components/EventDetailView";

const baseEvent: InviteEventDetail = {
  id: "evt_1",
  community: {
    name: "Organizer Community",
    legalSlug: "legal-1",
    slug: "organizer-community",
    showCommunityLink: false,
    showLegalDisclosureLink: false,
  },
  title: "Test Event",
  date: "2099-01-01T12:00:00.000Z",
  location: "Tokyo",
  description: null,
  fee: 1000,
  capacity: 20,
  show_capacity: true,
  show_participant_count: true,
  payment_methods: ["cash"],
  registration_deadline: null,
  payment_deadline: null,
  status: "upcoming",
  invite_token: "inv_12345678901234567890123456789012",
  attendances_count: 3,
  is_capacity_reached: false,
  capacityStatus: {
    capacityVisible: true,
    participantCountVisible: true,
    attendingCount: 3,
    capacity: 20,
  },
};

describe("EventDetailView", () => {
  it("設定OFFでは主催コミュニティリンクを表示しない", () => {
    render(<EventDetailView event={baseEvent} />);

    expect(screen.queryByRole("link", { name: /コミュニティ/ })).not.toBeInTheDocument();
  });

  it("設定ONでは主催コミュニティリンクを表示する", () => {
    render(
      <EventDetailView
        event={{
          ...baseEvent,
          community: {
            ...baseEvent.community,
            showCommunityLink: true,
          },
        }}
      />
    );

    expect(screen.getByRole("link", { name: /コミュニティ/ })).toHaveAttribute(
      "href",
      "/c/organizer-community"
    );
  });

  it("定員表示ONかつ参加人数表示ONでは参加人数 / 定員を表示する", () => {
    render(<EventDetailView event={baseEvent} />);

    expect(screen.getByText("参加人数 / 定員")).toBeInTheDocument();
    expect(screen.getByText("3 / 20名")).toBeInTheDocument();
  });

  it("定員表示OFFかつ参加人数表示OFFでは定員/参加人数ブロックを表示しない", () => {
    render(
      <EventDetailView
        event={{
          ...baseEvent,
          show_capacity: false,
          show_participant_count: false,
          attendances_count: undefined,
          capacityStatus: {
            capacityVisible: false,
            participantCountVisible: false,
            capacity: 20,
          },
        }}
      />
    );

    expect(screen.queryByText("定員")).not.toBeInTheDocument();
    expect(screen.queryByText("参加人数")).not.toBeInTheDocument();
    expect(screen.queryByText("20名")).not.toBeInTheDocument();
  });

  it("定員なしで参加人数表示ONの場合は参加人数のみ表示する", () => {
    render(
      <EventDetailView
        event={{
          ...baseEvent,
          capacity: null,
          show_capacity: false,
          capacityStatus: {
            capacityVisible: false,
            participantCountVisible: true,
            attendingCount: 3,
            capacity: null,
          },
        }}
      />
    );

    expect(screen.getByText("参加人数")).toBeInTheDocument();
    expect(screen.getByText("3名")).toBeInTheDocument();
    expect(screen.queryByText("参加人数 / 定員")).not.toBeInTheDocument();
  });

  it("定員表示ONかつ参加人数表示OFFでは定員のみ表示する", () => {
    render(
      <EventDetailView
        event={{
          ...baseEvent,
          show_participant_count: false,
          attendances_count: undefined,
          capacityStatus: {
            capacityVisible: true,
            participantCountVisible: false,
            capacity: 20,
          },
        }}
      />
    );

    expect(screen.getByText("定員")).toBeInTheDocument();
    expect(screen.getByText("20名")).toBeInTheDocument();
    expect(screen.queryByText("参加人数 / 定員")).not.toBeInTheDocument();
  });
});
