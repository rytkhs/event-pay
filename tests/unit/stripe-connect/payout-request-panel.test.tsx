/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  PayoutPanelState,
  RequestPayoutPayload,
} from "@/features/stripe-connect/types/payout-request";

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

import { PayoutRequestPanel } from "@/features/stripe-connect/components/PayoutRequestPanel";

const successPayload: RequestPayoutPayload = {
  payoutRequestId: "req_recovered",
  stripePayoutId: "po_recovered",
  stripeAccountId: "acct_recovered",
  amount: 10000,
  currency: "jpy",
  status: "pending",
};

function createPayoutPanel(override: Partial<PayoutPanelState> = {}): PayoutPanelState {
  return {
    availableAmount: 10000,
    pendingAmount: 0,
    currency: "jpy",
    canRequestPayout: true,
    latestRequest: null,
    ...override,
  };
}

describe("PayoutRequestPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creation_unknown の入金リクエストは再確認として実行できる", async () => {
    const user = userEvent.setup();
    const requestPayoutAction = jest.fn(async () => ({
      success: true as const,
      data: successPayload,
    }));

    render(
      <PayoutRequestPanel
        payoutPanel={createPayoutPanel({
          canRequestPayout: false,
          disabledReason: "request_in_progress",
          latestRequest: {
            id: "req_unknown",
            amount: 10000,
            currency: "jpy",
            status: "creation_unknown",
            requestedAt: "2026-05-13T00:00:00.000Z",
            arrivalDate: null,
            failureCode: null,
            failureMessage: null,
          },
        })}
        requestPayoutAction={requestPayoutAction}
      />
    );

    const button = screen.getByRole("button", { name: "再試行" });
    expect(button).not.toBeDisabled();

    await user.click(button);

    await waitFor(() => {
      expect(requestPayoutAction).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("requesting の入金リクエストは処理中として実行できない", async () => {
    const user = userEvent.setup();
    const requestPayoutAction = jest.fn(async () => ({
      success: true as const,
      data: successPayload,
    }));

    render(
      <PayoutRequestPanel
        payoutPanel={createPayoutPanel({
          canRequestPayout: false,
          disabledReason: "request_in_progress",
          latestRequest: {
            id: "req_requesting",
            amount: 10000,
            currency: "jpy",
            status: "requesting",
            requestedAt: "2026-05-13T00:00:00.000Z",
            arrivalDate: null,
            failureCode: null,
            failureMessage: null,
          },
        })}
        requestPayoutAction={requestPayoutAction}
      />
    );

    const button = screen.getByRole("button", { name: "処理中の入金があります" });
    expect(button).toBeDisabled();

    await user.click(button);

    expect(requestPayoutAction).not.toHaveBeenCalled();
  });

  it("in_transit の入金リクエストは到着予定日と分けて表示する", () => {
    render(
      <PayoutRequestPanel
        payoutPanel={createPayoutPanel({
          latestRequest: {
            id: "req_in_transit",
            amount: 10000,
            currency: "jpy",
            status: "in_transit",
            requestedAt: "2026-05-13T00:00:00.000Z",
            arrivalDate: "2026-05-15T00:00:00.000Z",
            failureCode: null,
            failureMessage: null,
          },
        })}
        requestPayoutAction={jest.fn()}
      />
    );

    expect(screen.getByText("入金処理中")).toBeInTheDocument();
    expect(screen.getByText(/予定: 2026\/5\/15/)).toBeInTheDocument();
  });
});
