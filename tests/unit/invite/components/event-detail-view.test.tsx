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
  payment_methods: ["cash"],
  registration_deadline: null,
  payment_deadline: null,
  status: "upcoming",
  invite_token: "inv_12345678901234567890123456789012",
  attendances_count: 3,
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
});
