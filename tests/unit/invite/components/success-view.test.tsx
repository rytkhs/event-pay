/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { RegisterParticipationData } from "@features/invite/types";
import { SuccessView } from "@features/invite/components/SuccessView";

const mockToast = jest.fn();

jest.mock("@core/contexts/toast-context", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("SuccessView", () => {
  const data: RegisterParticipationData = {
    attendanceId: "att_1",
    guestToken: "gst_12345678901234567890123456789012",
    requiresAdditionalPayment: false,
    eventTitle: "Test Event",
    participantNickname: "Test User",
    participantEmail: "test@example.com",
    attendanceStatus: "attending",
    paymentMethod: "cash",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: jest.fn(),
      },
    });
  });

  it("別参加者登録ボタンが表示され、クリックでコールバックが呼ばれる", async () => {
    const user = userEvent.setup();
    const onRegisterAnother = jest.fn(async () => undefined);

    render(<SuccessView data={data} onRegisterAnother={onRegisterAnother} />);

    const button = screen.getByRole("button", { name: "別の参加者を登録する" });
    await user.click(button);

    expect(onRegisterAnother).toHaveBeenCalledTimes(1);
  });

  it("処理中は別参加者登録ボタンが無効化される", async () => {
    const user = userEvent.setup();
    let resolvePromise: (() => void) | null = null;
    const onRegisterAnother = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        })
    );

    render(<SuccessView data={data} onRegisterAnother={onRegisterAnother} />);

    const button = screen.getByRole("button", { name: "別の参加者を登録する" });
    await user.click(button);

    expect(button).toBeDisabled();

    resolvePromise?.();

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it("コールバック失敗時もボタン状態を復帰する", async () => {
    const user = userEvent.setup();
    const onRegisterAnother = jest.fn(async () => {
      throw new Error("failed");
    });

    render(<SuccessView data={data} onRegisterAnother={onRegisterAnother} />);

    const button = screen.getByRole("button", { name: "別の参加者を登録する" });
    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });
});
