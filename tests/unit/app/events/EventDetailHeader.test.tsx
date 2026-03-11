/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { EventDetailHeader } from "@/app/(app)/events/[id]/components/EventDetailHeader";
import type { Event } from "@core/types/event";

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
  it("active tab に応じたリンクと説明文を表示する", () => {
    render(
      <EventDetailHeader
        eventDetail={baseEvent}
        activeTab="participants"
        overviewHref="/events/event-1"
        participantsHref="/events/event-1?tab=participants&search=alice"
        tabLabels={{
          overview: "概要",
          participants: "参加者管理",
        }}
      />
    );

    expect(screen.getByRole("link", { name: "概要" })).toHaveAttribute("href", "/events/event-1");
    expect(screen.getByRole("link", { name: "参加者管理" })).toHaveAttribute(
      "href",
      "/events/event-1?tab=participants&search=alice"
    );
    expect(screen.getByText("参加者の検索、絞り込み、入金管理ができます。")).toBeInTheDocument();
  });

  it("編集不可イベントでは編集リンクを出さず disabled button を表示する", () => {
    render(
      <EventDetailHeader
        eventDetail={{ ...baseEvent, status: "past" }}
        activeTab="overview"
        overviewHref="/events/event-1"
        participantsHref="/events/event-1?tab=participants"
        tabLabels={{
          overview: "概要",
          participants: "参加者管理",
        }}
      />
    );

    expect(screen.queryByRole("link", { name: "イベント設定を編集" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "イベント設定は編集できません" })).toBeDisabled();
  });
});
