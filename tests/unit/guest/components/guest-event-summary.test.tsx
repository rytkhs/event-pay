/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import React from "react";

import { render, screen } from "@testing-library/react";

import type { GuestAttendanceData } from "@core/types/guest";

import { GuestEventSummary } from "@features/guest/components/GuestEventSummary";

describe("GuestEventSummary", () => {
  it("主催コミュニティ名を表示する", () => {
    const attendance: GuestAttendanceData = {
      id: "att_1",
      nickname: "テストゲスト",
      email: "guest@example.com",
      status: "attending",
      guest_token: "gst_12345678901234567890123456789012",
      created_at: "2099-01-01T00:00:00.000Z",
      updated_at: "2099-01-01T00:00:00.000Z",
      event: {
        id: "evt_1",
        title: "テストイベント",
        description: "イベント説明",
        date: "2099-01-01T12:00:00.000Z",
        location: "東京",
        fee: 1000,
        capacity: 10,
        registration_deadline: null,
        payment_deadline: null,
        payment_methods: ["cash"],
        allow_payment_after_deadline: false,
        grace_period_days: 0,
        community: {
          name: "テストコミュニティ",
          legalSlug: "legal-test-community",
        },
        canceled_at: null,
      },
      payment: null,
    };

    render(<GuestEventSummary attendance={attendance} />);

    expect(screen.getByText("作成: テストコミュニティ")).toBeInTheDocument();
  });
});
