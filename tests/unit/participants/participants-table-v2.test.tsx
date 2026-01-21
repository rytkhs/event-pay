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

// next/navigation の useRouter をモック
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  usePathname: () => "/events/event-1/participants",
  useSearchParams: () => new URLSearchParams(),
}));

import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";

import type { ParticipantView } from "@core/validation/participant-management";

// テスト対象コンポーネント
import { ParticipantsTableV2 } from "@/app/(app)/events/[id]/participants/components/participants-table-v2/ParticipantsTableV2";

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

function buildParticipantsArray(count: number = 2): ParticipantView[] {
  const participants: ParticipantView[] = [
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
  ];
  return participants.slice(0, count);
}

// ページネーション用のデータ生成（100件）
function buildManyParticipants(): ParticipantView[] {
  return Array.from({ length: 100 }, (_, i) => ({
    attendance_id: `att-${i + 1}`,
    nickname: `テストユーザー${i + 1}`,
    email: `test${i + 1}@example.com`,
    status: "attending" as const,
    attendance_created_at: "2023-01-01T00:00:00Z",
    attendance_updated_at: "2023-01-01T00:00:00Z",
    payment_id: `pay-${i + 1}`,
    payment_method: i % 2 === 0 ? ("cash" as const) : ("stripe" as const),
    payment_status: i % 2 === 0 ? ("pending" as const) : ("paid" as const),
    amount: 1000,
    paid_at: i % 2 === 0 ? null : "2023-01-01T00:00:00Z",
    payment_version: 1,
    payment_created_at: "2023-01-01T00:00:00Z",
    payment_updated_at: "2023-01-01T00:00:00Z",
  }));
}

describe("ParticipantsTableV2", () => {
  const defaultProps = {
    eventId: "event-1",
    eventFee: 1000,
    allParticipants: buildParticipantsArray(),
    searchParams: {},
    onParamsChange: jest.fn(),
  };

  beforeEach(() => {
    mockLocalStorage.getItem.mockReturnValue(null);
    jest.clearAllMocks();
    mockRefresh.mockClear();
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
      render(<ParticipantsTableV2 {...defaultProps} allParticipants={[]} />);

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
      const manyParticipants = buildManyParticipants();

      render(<ParticipantsTableV2 {...defaultProps} allParticipants={manyParticipants} />);

      // ページネーション表示の確認（クライアントサイドページネーション）
      expect(screen.getByText("100件中 1-50件を表示")).toBeInTheDocument();
      expect(screen.getByText("表示件数:")).toBeInTheDocument();
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
    });

    it("ページ変更ボタンが動作する", async () => {
      const user = userEvent.setup();
      const onParamsChange = jest.fn();
      const manyParticipants = buildManyParticipants();

      render(
        <ParticipantsTableV2
          {...defaultProps}
          allParticipants={manyParticipants}
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
