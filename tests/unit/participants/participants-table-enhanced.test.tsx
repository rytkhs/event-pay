/** @jest-environment jsdom */

import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  GetParticipantsResponse,
  GetEventPaymentsResponse,
  ParticipantView,
} from "@core/validation/participant-management";

// テスト対象コンポーネント
import { ParticipantsTableEnhanced } from "@/app/events/[id]/participants/components/participants-table-enhanced";

// getPaymentActions をモック
const mockUpdateCashStatus = jest.fn();
jest.mock("@core/services", () => ({
  getPaymentActions: () => ({
    updateCashStatus: mockUpdateCashStatus,
  }),
}));

// トーストの視認性を担保するため、ToastProvider を使わずに useToast をモック
const toastSpy = jest.fn();
jest.mock("@core/contexts/toast-context", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [] }),
}));

function buildParticipantsData(
  partial?: Partial<GetParticipantsResponse>
): GetParticipantsResponse {
  const participant: ParticipantView = {
    attendance_id: "att-1",
    nickname: "太郎",
    email: "taro@example.com",
    status: "attending",
    attendance_created_at: new Date().toISOString(),
    attendance_updated_at: new Date().toISOString(),
    payment_id: "pay-1",
    payment_method: "cash",
    payment_status: "pending",
    amount: 1000,
    paid_at: null,
    payment_version: 1,
    payment_created_at: new Date().toISOString(),
    payment_updated_at: new Date().toISOString(),
  };

  const base: GetParticipantsResponse = {
    participants: [participant],
    pagination: {
      page: 1,
      limit: 50,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
    filters: {
      search: undefined,
      attendanceStatus: undefined,
      paymentMethod: undefined,
      paymentStatus: undefined,
    },
    sort: {
      field: "updated_at",
      order: "desc",
    },
  };

  return { ...base, ...partial } as GetParticipantsResponse;
}

function buildPaymentsData(): GetEventPaymentsResponse {
  return {
    payments: [],
    summary: {
      totalPayments: 0,
      totalAmount: 0,
      byMethod: [],
      byStatus: [],
      unpaidCount: 0,
      unpaidAmount: 0,
      paidCount: 0,
      paidAmount: 0,
    },
  };
}

describe("ParticipantsTableEnhanced - 現金決済の受領/免除", () => {
  const eventId = "00000000-0000-0000-0000-000000000000";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("未決済の現金決済を受領に更新し、Toastとデータリフレッシュを実行", async () => {
    mockUpdateCashStatus.mockResolvedValueOnce({
      success: true,
      data: { paymentId: "pay-1", status: "received" },
    });

    const onFiltersChange = jest.fn();

    render(
      <ParticipantsTableEnhanced
        eventId={eventId}
        eventFee={1000}
        participantsData={buildParticipantsData()}
        paymentsData={buildPaymentsData()}
        searchParams={{}}
        onFiltersChange={onFiltersChange}
      />
    );

    const receiveButton = await screen.findByRole("button", { name: /受領/i });
    await userEvent.click(receiveButton);

    await waitFor(() => {
      expect(mockUpdateCashStatus).toHaveBeenCalledTimes(1);
      expect(mockUpdateCashStatus).toHaveBeenCalledWith({ paymentId: "pay-1", status: "received" });
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "決済状況を更新しました",
          description: expect.stringContaining("受領"),
        })
      );
      expect(onFiltersChange).toHaveBeenCalledWith({});
    });
  });

  it("未決済の現金決済を免除に更新し、Toastとデータリフレッシュを実行", async () => {
    mockUpdateCashStatus.mockResolvedValueOnce({
      success: true,
      data: { paymentId: "pay-1", status: "waived" },
    });

    const onFiltersChange = jest.fn();

    render(
      <ParticipantsTableEnhanced
        eventId={eventId}
        eventFee={1000}
        participantsData={buildParticipantsData()}
        paymentsData={buildPaymentsData()}
        searchParams={{}}
        onFiltersChange={onFiltersChange}
      />
    );

    // メニューを開く
    const moreButton = screen.getByTitle("その他のアクション");
    await userEvent.click(moreButton);

    // 免除メニュー項目をクリック
    const waiveItem = await screen.findByText("支払いを免除");
    await userEvent.click(waiveItem);

    await waitFor(() => {
      expect(mockUpdateCashStatus).toHaveBeenCalledTimes(1);
      expect(mockUpdateCashStatus).toHaveBeenCalledWith({ paymentId: "pay-1", status: "waived" });
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "決済状況を更新しました",
          description: expect.stringContaining("免除"),
        })
      );
      expect(onFiltersChange).toHaveBeenCalledWith({});
    });
  });
});
