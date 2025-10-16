/** @jest-environment jsdom */

// モック定義（importより前に配置）
const mockUpdateCashStatus = jest.fn();
const mockToast = jest.fn();
const mockConditionalSmartSort = jest.fn((participants) => participants);

jest.mock("@/features/payments/actions/update-cash-status", () => ({
  updateCashStatusAction: mockUpdateCashStatus,
}));

jest.mock("@core/contexts/toast-context", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

jest.mock("@core/utils/participant-smart-sort", () => ({
  conditionalSmartSort: mockConditionalSmartSort,
}));

import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";

import type {
  GetParticipantsResponse,
  ParticipantView,
} from "@core/validation/participant-management";

// テスト対象コンポーネント
import { ParticipantsTableV2 } from "@/app/events/[id]/participants/components/participants-table-v2/participants-table";

// LocalStorage をモック
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
});

// ResizeObserver をモック
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

function buildParticipantsData(
  partial?: Partial<GetParticipantsResponse>
): GetParticipantsResponse {
  return {
    participants: [
      {
        attendance_id: "att-1",
        nickname: "テストユーザー1",
        email: "test1@example.com",
        status: "attending",
        attendance_created_at: "2023-01-01T00:00:00Z",
        attendance_updated_at: "2023-01-01T00:00:00Z",
        payment_id: "pay-1",
        payment_method: "cash",
        payment_status: "pending",
        amount: 1000,
        paid_at: null,
        payment_version: 1,
        payment_created_at: "2023-01-01T00:00:00Z",
        payment_updated_at: "2023-01-01T00:00:00Z",
      },
      {
        attendance_id: "att-2",
        nickname: "テストユーザー2",
        email: "test2@example.com",
        status: "attending",
        attendance_created_at: "2023-01-01T00:00:00Z",
        attendance_updated_at: "2023-01-01T00:00:00Z",
        payment_id: "pay-2",
        payment_method: "stripe",
        payment_status: "paid",
        amount: 1000,
        paid_at: "2023-01-01T00:00:00Z",
        payment_version: 1,
        payment_created_at: "2023-01-01T00:00:00Z",
        payment_updated_at: "2023-01-01T00:00:00Z",
      },
    ],
    pagination: {
      page: 1,
      limit: 50,
      total: 2,
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
    ...partial,
  };
}

describe("ParticipantsTableV2", () => {
  const defaultProps = {
    eventId: "event-1",
    eventFee: 1000,
    initialData: buildParticipantsData(),
    searchParams: {},
    onParamsChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("基本表示", () => {
    it("参加者一覧が正しく表示される", () => {
      render(<ParticipantsTableV2 {...defaultProps} />);

      expect(screen.getByText("参加者一覧 (2件)")).toBeInTheDocument();
      expect(screen.getByText("テストユーザー1")).toBeInTheDocument();
      expect(screen.getByText("テストユーザー2")).toBeInTheDocument();
    });

    it("ビュー切替ボタンが表示される", () => {
      render(<ParticipantsTableV2 {...defaultProps} />);

      expect(screen.getByLabelText("テーブル表示")).toBeInTheDocument();
      expect(screen.getByLabelText("カード表示")).toBeInTheDocument();
    });

    it("参加者がいない場合の表示", () => {
      const emptyData = buildParticipantsData({
        participants: [],
        pagination: { ...buildParticipantsData().pagination, total: 0 },
      });

      render(<ParticipantsTableV2 {...defaultProps} initialData={emptyData} />);

      expect(screen.getByText("参加者が見つかりません")).toBeInTheDocument();
    });
  });

  describe("ソート機能", () => {
    it("ニックネーム列でソートできる", async () => {
      const user = userEvent.setup();
      const onParamsChange = jest.fn();

      render(<ParticipantsTableV2 {...defaultProps} onParamsChange={onParamsChange} />);

      const nicknameHeader = screen.getByRole("button", { name: /ニックネームでソート/ });
      await user.click(nicknameHeader);

      expect(onParamsChange).toHaveBeenCalledWith({
        sort: "nickname",
        order: "asc",
      });
    });

    it("参加状況列でソートできる", async () => {
      const user = userEvent.setup();
      const onParamsChange = jest.fn();

      render(<ParticipantsTableV2 {...defaultProps} onParamsChange={onParamsChange} />);

      const statusHeader = screen.getByRole("button", { name: /参加状況でソート/ });
      await user.click(statusHeader);

      expect(onParamsChange).toHaveBeenCalledWith({
        sort: "status",
        order: "asc",
      });
    });
  });

  describe("アクション機能", () => {
    it("現金決済の受領ボタンが動作する", async () => {
      const user = userEvent.setup();
      mockUpdateCashStatus.mockResolvedValue({ success: true });

      render(<ParticipantsTableV2 {...defaultProps} />);

      const receiveButton = screen.getByTitle("受領済みにする");
      await user.click(receiveButton);

      expect(mockUpdateCashStatus).toHaveBeenCalledWith({
        paymentId: "pay-1",
        status: "received",
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "決済状況を更新しました",
          description: "ステータスを「受領」に変更しました。",
        });
      });
    });

    it("現金決済の免除ボタンが動作する", async () => {
      const user = userEvent.setup();
      mockUpdateCashStatus.mockResolvedValue({ success: true });

      render(<ParticipantsTableV2 {...defaultProps} />);

      const waiveButton = screen.getByTitle("支払いを免除");
      await user.click(waiveButton);

      expect(mockUpdateCashStatus).toHaveBeenCalledWith({
        paymentId: "pay-1",
        status: "waived",
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "決済状況を更新しました",
          description: "ステータスを「免除」に変更しました。",
        });
      });
    });

    it("アクション失敗時にエラートーストが表示される", async () => {
      const user = userEvent.setup();
      const errorMessage = "決済の更新に失敗しました";
      mockUpdateCashStatus.mockRejectedValue(new Error(errorMessage));

      render(<ParticipantsTableV2 {...defaultProps} />);

      const receiveButton = screen.getByTitle("受領済みにする");
      await user.click(receiveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: "更新に失敗しました",
          description: errorMessage,
          variant: "destructive",
        });
      });
    });
  });

  describe("ページネーション", () => {
    it("ページネーションが表示される", () => {
      // ページネーションが表示されるように総件数を多くする
      const paginatedData = buildParticipantsData({
        pagination: { ...buildParticipantsData().pagination, total: 100, totalPages: 2 },
      });

      render(<ParticipantsTableV2 {...defaultProps} initialData={paginatedData} />);

      // ページネーション表示の確認
      expect(screen.getByText("100件中 1-50件を表示")).toBeInTheDocument();
      expect(screen.getByText("表示件数:")).toBeInTheDocument();
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
    });

    it("ページ変更ボタンが動作する", async () => {
      const user = userEvent.setup();
      const onParamsChange = jest.fn();

      // 複数ページのデータ
      const paginatedData = buildParticipantsData({
        pagination: {
          ...buildParticipantsData().pagination,
          total: 100,
          totalPages: 2,
          hasNext: true,
        },
      });

      render(
        <ParticipantsTableV2
          {...defaultProps}
          initialData={paginatedData}
          onParamsChange={onParamsChange}
        />
      );

      // 次のページボタンを取得（disabled属性がないものを選択）
      const paginationButtons = screen
        .getAllByRole("button")
        .filter(
          (button) =>
            !button.hasAttribute("disabled") && button.querySelector('svg[class*="chevron-right"]')
        );
      const nextButton = paginationButtons[0];
      await user.click(nextButton);

      expect(onParamsChange).toHaveBeenCalledWith({ page: "2" });
    });
  });

  describe("ビュー切替", () => {
    it("カードビューに切り替えられる", async () => {
      const user = userEvent.setup();

      render(<ParticipantsTableV2 {...defaultProps} />);

      const cardViewButton = screen.getByLabelText("カード表示");
      await user.click(cardViewButton);

      // setTimeoutによる非同期処理を待つ
      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          "event-participants-view-mode",
          "cards"
        );
      });
    });
  });

  describe("無料イベント", () => {
    it("無料イベントでは決済関連の列が表示されない", () => {
      render(<ParticipantsTableV2 {...defaultProps} eventFee={0} />);

      expect(screen.getByText("決済方法")).toBeInTheDocument();
      expect(screen.getByText("決済状況")).toBeInTheDocument();

      // 無料イベントでは決済状況は "-" で表示される
      const statusCells = screen.getAllByText("-");
      expect(statusCells.length).toBeGreaterThan(0);
    });
  });
});
