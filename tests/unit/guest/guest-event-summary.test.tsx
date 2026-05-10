/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import type { GuestAttendanceData } from "@core/types/guest";

import { GuestEventSummary } from "@features/guest/components/GuestEventSummary";

const baseAttendance: GuestAttendanceData = {
  id: "att_1",
  nickname: "Guest",
  email: "guest@example.com",
  status: "attending",
  guest_token: "gst_12345678901234567890123456789012",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  event: {
    id: "evt_1",
    title: "Test Event",
    description: null,
    date: "2099-01-01T12:00:00.000Z",
    location: "Tokyo",
    fee: 1000,
    capacity: 20,
    show_capacity: true,
    show_participant_count: false,
    registration_deadline: null,
    payment_deadline: null,
    payment_methods: ["cash"],
    allow_payment_after_deadline: false,
    grace_period_days: 0,
    community: {
      name: "Organizer Community",
      legalSlug: "legal-1",
      slug: "organizer-community",
      showCommunityLink: false,
      showLegalDisclosureLink: false,
    },
    canceled_at: null,
  },
  payment: null,
};

describe("GuestEventSummary", () => {
  it("設定OFFでは主催コミュニティリンクを表示しない", () => {
    render(<GuestEventSummary attendance={baseAttendance} />);

    expect(screen.queryByRole("link", { name: /コミュニティ/ })).not.toBeInTheDocument();
  });

  it("設定ONでは主催コミュニティリンクを表示する", () => {
    render(
      <GuestEventSummary
        attendance={{
          ...baseAttendance,
          event: {
            ...baseAttendance.event,
            community: {
              ...baseAttendance.event.community,
              showCommunityLink: true,
            },
          },
        }}
      />
    );

    expect(screen.getByRole("link", { name: /コミュニティ/ })).toHaveAttribute(
      "href",
      "/c/organizer-community"
    );
  });

  it("定員表示ONかつ定員ありでは定員を表示する", () => {
    render(<GuestEventSummary attendance={baseAttendance} />);

    expect(screen.getByText("定員")).toBeInTheDocument();
    expect(screen.getByText("20名")).toBeInTheDocument();
  });

  it("定員表示OFFでは定員ありでも定員を表示しない", () => {
    render(
      <GuestEventSummary
        attendance={{
          ...baseAttendance,
          event: {
            ...baseAttendance.event,
            show_capacity: false,
          },
        }}
      />
    );

    expect(screen.queryByText("定員")).not.toBeInTheDocument();
    expect(screen.queryByText("20名")).not.toBeInTheDocument();
  });

  it("定員なしでは定員表示ONでも定員を表示しない", () => {
    render(
      <GuestEventSummary
        attendance={{
          ...baseAttendance,
          event: {
            ...baseAttendance.event,
            capacity: null,
            show_capacity: true,
          },
        }}
      />
    );

    expect(screen.queryByText("定員")).not.toBeInTheDocument();
  });
});
