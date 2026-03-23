/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import React from "react";

import { render, screen } from "@testing-library/react";

import type { InviteEventDetail } from "@core/types/invite";

import { EventDetailView } from "@features/invite/components/EventDetailView";

describe("EventDetailView", () => {
  it("主催コミュニティ名を表示する", () => {
    const event: InviteEventDetail = {
      id: "evt_1",
      community: {
        name: "テストコミュニティ",
        legalSlug: "legal-test-community",
      },
      title: "テストイベント",
      date: "2099-01-01T12:00:00.000Z",
      location: "東京",
      description: "説明",
      fee: 1000,
      capacity: 10,
      payment_methods: ["cash"],
      registration_deadline: null,
      payment_deadline: null,
      status: "upcoming",
      invite_token: "inv_12345678901234567890123456789012",
      attendances_count: 3,
    };

    render(<EventDetailView event={event} />);

    expect(screen.getByText("主催コミュニティ: テストコミュニティ")).toBeInTheDocument();
    expect(screen.queryByText(/^作成者:/)).not.toBeInTheDocument();
  });
});
