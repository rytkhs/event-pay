/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import type { Event } from "@core/types/event";

import { EventDetailHeader } from "@/app/(app)/events/[id]/components/EventDetailHeader";

const baseEvent: Event = {
  id: "event-1",
  title: "春合宿",
  description: "description",
  date: "2026-03-20T10:00:00.000Z",
  location: "Tokyo",
  fee: 3000,
  capacity: 30,
  payment_methods: ["cash"],
  registration_deadline: "2026-03-15T10:00:00.000Z",
  payment_deadline: null,
  allow_payment_after_deadline: false,
  grace_period_days: 0,
  invite_token: "invite-token",
  created_at: "2026-03-01T10:00:00.000Z",
  updated_at: "2026-03-02T10:00:00.000Z",
  created_by: "user-1",
  creator_name: "tester",
  status: "upcoming",
};

describe("EventDetailHeader", () => {
  it("イベント情報と編集リンクを表示する", () => {
    render(<EventDetailHeader eventDetail={baseEvent} />);

    expect(screen.getByRole("heading", { name: "春合宿" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "イベントを編集" })).toHaveAttribute(
      "href",
      "/events/event-1/edit"
    );
  });

  it("編集不可イベントでは編集リンクを出さず disabled button を表示する", () => {
    render(<EventDetailHeader eventDetail={{ ...baseEvent, status: "past" }} />);

    expect(screen.queryByRole("link", { name: "イベントを編集" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "編集不可" })).toBeDisabled();
  });
});
