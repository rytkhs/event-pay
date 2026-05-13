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
            requestedAt: new Date().toISOString(),
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

  it("creation_unknown の入金リクエストは残高0でも再確認として実行できる", async () => {
    const user = userEvent.setup();
    const requestPayoutAction = jest.fn(async () => ({
      success: true as const,
      data: successPayload,
    }));

    render(
      <PayoutRequestPanel
        payoutPanel={createPayoutPanel({
          availableAmount: 0,
          canRequestPayout: false,
          disabledReason: "request_in_progress",
          latestRequest: {
            id: "req_unknown_zero_balance",
            amount: 10000,
            currency: "jpy",
            status: "creation_unknown",
            requestedAt: new Date().toISOString(),
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
    });
  });

  it("24時間超のcreation_unknownもサーバー側の判定に委ねて再確認として実行できる", async () => {
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
            id: "req_unknown_expired",
            amount: 10000,
            currency: "jpy",
            status: "creation_unknown",
            requestedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
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

  it("manual_review_required の入金リクエストは要確認として実行できない", async () => {
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
            id: "req_manual_review",
            amount: 10000,
            currency: "jpy",
            status: "manual_review_required",
            requestedAt: "2026-05-13T00:00:00.000Z",
            arrivalDate: null,
            failureCode: null,
            failureMessage: null,
          },
        })}
        requestPayoutAction={requestPayoutAction}
      />
    );

    expect(screen.getByText("要確認")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "処理中の振込があります" });
    expect(button).toBeDisabled();

    await user.click(button);

    expect(requestPayoutAction).not.toHaveBeenCalled();
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

    const button = screen.getByRole("button", { name: "処理中の振込があります" });
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

    expect(screen.getByText("処理中")).toBeInTheDocument();
    expect(screen.getByText(/予定: 2026\/5\/15/)).toBeInTheDocument();
  });
});
