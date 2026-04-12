/** @jest-environment jsdom */

// モック定義（importより前に配置）
const mockUpdateCashStatus = jest.fn();
const mockBulkUpdateCashStatus = jest.fn();
const mockDeleteMistakenAttendance = jest.fn();
const mockToast = jest.fn();
const mockConditionalSmartSort = jest.fn((participants) => participants);

jest.mock("@core/contexts/toast-context", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

jest.mock("@core/utils/participant-smart-sort", () => ({
  conditionalSmartSort: mockConditionalSmartSort,
}));

jest.mock("@/components/layout/mobile-chrome-context", () => ({
  useMobileBottomOverlay: jest.fn(),
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

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

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
      can_delete_mistaken_attendance: true,
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
      can_delete_mistaken_attendance: false,
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
    can_delete_mistaken_attendance: i % 2 === 0,
  }));
}

describe("ParticipantsTableV2", () => {
  const defaultProps = {
    eventId: "event-1",
    eventFee: 1000,
    allParticipants: buildParticipantsArray(),
    query: {
      tab: "participants" as const,
      search: "",
      attendance: "all" as const,
      smart: true,
      page: 1,
      limit: 150,
    },
    onParamsChange: jest.fn(),
    deleteMistakenAttendanceAction: mockDeleteMistakenAttendance,
    updateCashStatusAction: mockUpdateCashStatus,
    bulkUpdateCashStatusAction: mockBulkUpdateCashStatus,
  };

  beforeEach(() => {
    setViewportWidth(1280);
    mockLocalStorage.getItem.mockReturnValue(null);
    jest.clearAllMocks();
    mockRefresh.mockClear();
    mockDeleteMistakenAttendance.mockResolvedValue({
      success: true,
      data: { attendanceId: "att-1" },
    });
  });

  describe("基本表示", () => {
    it("参加者一覧が正しく表示される", () => {
      render(<ParticipantsTableV2 {...defaultProps} />);

      expect(screen.getByText("2名を表示中")).toBeInTheDocument();
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
        smart: false,
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
        smart: false,
        sort: "status",
        order: "asc",
      });
    });

    it("manual sort が実際の表示順に反映される", () => {
      const participants = [
        {
          ...buildParticipantsArray(2)[1],
          nickname: "Bさん",
          attendance_id: "att-b",
          payment_id: "pay-b",
        },
        {
          ...buildParticipantsArray(2)[0],
          nickname: "Aさん",
          attendance_id: "att-a",
          payment_id: "pay-a",
        },
      ];

      render(
        <ParticipantsTableV2
          {...defaultProps}
          allParticipants={participants}
          query={{
            ...defaultProps.query,
            smart: false,
            sort: "nickname",
            order: "asc",
          }}
        />
      );

      const nicknames = screen
        .getAllByText(/さん/)
        .map((element) => element.textContent)
        .filter(Boolean);

      expect(nicknames.slice(0, 2)).toEqual(["Aさん", "Bさん"]);
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

    it("誤登録取り消し不可の参加者には誤登録取り消しUIを表示しない", async () => {
      const user = userEvent.setup();
      const participants = buildParticipantsArray(2);

      render(<ParticipantsTableV2 {...defaultProps} allParticipants={participants} />);

      // テストユーザー1: 取り消し可能
      await user.click(screen.getByLabelText("テストユーザー1の操作メニューを開く"));
      expect(screen.getByText("誤登録を取り消す")).toBeInTheDocument();
      await user.keyboard("{Escape}"); // メニューを閉じる

      // テストユーザー2: 取り消し不可、かつ他にアクションがないためメニュー自体が表示されない
      expect(
        screen.queryByLabelText("テストユーザー2の操作メニューを開く")
      ).not.toBeInTheDocument();
    });
  });

  describe("ページネーション", () => {
    it("ページネーションが表示される", () => {
      const manyParticipants = buildManyParticipants();

      render(
        <ParticipantsTableV2
          {...defaultProps}
          allParticipants={manyParticipants}
          query={{ ...defaultProps.query, limit: 50 }}
        />
      );

      // ページネーション表示の確認（クライアントサイドページネーション）
      expect(screen.getByText("SHOWING 1 – 50 OF 100")).toBeInTheDocument();
      expect(screen.getByText("表示件数:")).toBeInTheDocument();
      expect(
        screen.getAllByText(
          (_, element) => element?.textContent?.replace(/\s+/g, " ").includes("1 / 2") ?? false
        ).length
      ).toBeGreaterThan(0);
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
          query={{ ...defaultProps.query, limit: 50 }}
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

      expect(onParamsChange).toHaveBeenCalledWith({ page: 2 });
    });
  });

  describe("ビュー切替", () => {
    it("desktop 初回表示はテーブルビューになる", async () => {
      setViewportWidth(1280);

      render(<ParticipantsTableV2 {...defaultProps} />);

      await waitFor(() => {
        const tableButton = screen.getByLabelText("テーブル表示");
        expect(tableButton).toHaveAttribute("data-state", "on");
      });
    });

    it("mobile 初回表示はカードビューになる", async () => {
      setViewportWidth(375);

      render(<ParticipantsTableV2 {...defaultProps} />);

      await waitFor(() => {
        const cardsButton = screen.getByLabelText("カード表示");
        expect(cardsButton).toHaveAttribute("data-state", "on");
      });
    });

    it("desktop 保存値があれば desktop で復元する", async () => {
      setViewportWidth(1280);
      mockLocalStorage.getItem.mockImplementation((key: string) =>
        key === "event-participants-view-mode-desktop" ? "cards" : null
      );

      render(<ParticipantsTableV2 {...defaultProps} />);

      await waitFor(() => {
        const cardsButton = screen.getByLabelText("カード表示");
        expect(cardsButton).toHaveAttribute("data-state", "on");
      });
    });

    it("mobile では desktop 保存値を引き継がず mobile デフォルトを使う", async () => {
      setViewportWidth(375);
      mockLocalStorage.getItem.mockImplementation((key: string) =>
        key === "event-participants-view-mode-desktop" ? "table" : null
      );

      render(<ParticipantsTableV2 {...defaultProps} />);

      await waitFor(() => {
        const cardsButton = screen.getByLabelText("カード表示");
        expect(cardsButton).toHaveAttribute("data-state", "on");
      });
    });

    it("カードビューに切り替えられる", async () => {
      const user = userEvent.setup();
      setViewportWidth(1280);

      render(<ParticipantsTableV2 {...defaultProps} />);

      const cardViewButton = screen.getByLabelText("カード表示");
      await user.click(cardViewButton);

      // setTimeoutによる非同期処理を待つ
      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          "event-participants-view-mode-desktop",
          "cards"
        );
      });
    });

    it("mobile でテーブルビューに切り替えると mobile 用キーに保存する", async () => {
      const user = userEvent.setup();
      setViewportWidth(375);

      render(<ParticipantsTableV2 {...defaultProps} />);

      const tableViewButton = await screen.findByLabelText("テーブル表示");
      await user.click(tableViewButton);

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          "event-participants-view-mode-mobile",
          "table"
        );
      });
    });
  });

  describe("無料イベント", () => {
    it("無料イベントでは決済関連の列が表示されない", () => {
      render(<ParticipantsTableV2 {...defaultProps} eventFee={0} />);

      expect(screen.queryByText("決済方法")).not.toBeInTheDocument();
      expect(screen.queryByText("決済状況")).not.toBeInTheDocument();
    });
  });
});
