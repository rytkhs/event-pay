/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import type { EventDetail } from "@core/utils/invite-token";

import type { RegisterParticipationData } from "@features/invite/types";
import { InviteEventDetail } from "@features/invite/components/InviteEventDetail";

jest.mock("@features/invite/components/EventDetailView", () => ({
  EventDetailView: () => <div data-testid="mock-event-detail" />,
}));

jest.mock("@features/invite/components/RsvpForm", () => ({
  RsvpForm: () => <div data-testid="mock-rsvp-form" />,
}));

jest.mock("@features/invite/components/SuccessView", () => ({
  SuccessView: ({ onRegisterAnother }: { onRegisterAnother: () => Promise<void> }) => (
    <button type="button" data-testid="mock-reset-button" onClick={() => void onRegisterAnother()}>
      reset
    </button>
  ),
}));

describe("InviteEventDetail", () => {
  const mockEvent: EventDetail = {
    id: "evt_1",
    created_by: "org_1",
    organizer_name: "Organizer",
    title: "Test Event",
    date: "2099-01-01T12:00:00.000Z",
    location: null,
    description: null,
    fee: 1000,
    capacity: 10,
    payment_methods: ["cash"],
    registration_deadline: null,
    payment_deadline: null,
    status: "upcoming",
    invite_token: "inv_12345678901234567890123456789012",
    attendances_count: 0,
  };

  const mockInitialRegistration: RegisterParticipationData = {
    attendanceId: "att_1",
    guestToken: "gst_12345678901234567890123456789012",
    requiresAdditionalPayment: true,
    eventTitle: "Test Event",
    participantNickname: "Test User",
    participantEmail: "test@example.com",
    attendanceStatus: "attending",
    paymentMethod: "cash",
  };

  const createRegisterAction = (): ((
    formData: FormData
  ) => Promise<ActionResult<RegisterParticipationData>>) => {
    return jest.fn(async () => ({
      success: true,
      data: mockInitialRegistration,
    }));
  };

  it("初期登録データがある場合は成功画面を表示する", () => {
    const dismissInviteSuccessAction = jest.fn(async () => ({ success: true }));

    render(
      <InviteEventDetail
        event={mockEvent}
        inviteToken={mockEvent.invite_token}
        initialRegistrationData={mockInitialRegistration}
        registerParticipationAction={createRegisterAction()}
        dismissInviteSuccessAction={dismissInviteSuccessAction}
      />
    );

    expect(screen.getByTestId("mock-reset-button")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-rsvp-form")).not.toBeInTheDocument();
  });

  it("別参加者登録を押すとクッキー削除Actionを呼び、フォームに戻る", async () => {
    const user = userEvent.setup();
    const dismissInviteSuccessAction = jest.fn(async () => ({ success: true }));

    render(
      <InviteEventDetail
        event={mockEvent}
        inviteToken={mockEvent.invite_token}
        initialRegistrationData={mockInitialRegistration}
        registerParticipationAction={createRegisterAction()}
        dismissInviteSuccessAction={dismissInviteSuccessAction}
      />
    );

    await user.click(screen.getByTestId("mock-reset-button"));

    expect(dismissInviteSuccessAction).toHaveBeenCalledWith(mockEvent.invite_token);
    await waitFor(() => {
      expect(screen.getByTestId("mock-rsvp-form")).toBeInTheDocument();
    });
  });

  it("クッキー削除Actionが失敗してもフォームに戻る", async () => {
    const user = userEvent.setup();
    const dismissInviteSuccessAction = jest.fn(async () => {
      throw new Error("cookie failed");
    });

    render(
      <InviteEventDetail
        event={mockEvent}
        inviteToken={mockEvent.invite_token}
        initialRegistrationData={mockInitialRegistration}
        registerParticipationAction={createRegisterAction()}
        dismissInviteSuccessAction={dismissInviteSuccessAction}
      />
    );

    await user.click(screen.getByTestId("mock-reset-button"));

    expect(dismissInviteSuccessAction).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByTestId("mock-rsvp-form")).toBeInTheDocument();
    });
  });
});
