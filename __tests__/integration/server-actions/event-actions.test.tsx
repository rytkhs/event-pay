/**
 * @file EventActions統合テスト - 進化版
 * @description Server Actions統合テストでのイベント操作コンポーネントテスト
 * @version 2.0.0 - ハイブリッド統合テスト（実バリデーション + 外部依存モック）
 */

import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { EventActions } from "@/components/events/event-actions";

// Next.js router のモック設定（統合テスト用）
const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: mockRefresh,
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

// Server Actions のモック（外部依存のみモック）
const mockDeleteEventAction = jest.fn();
jest.mock("@/app/events/actions/delete-event", () => ({
  deleteEventAction: (...args: any[]) => mockDeleteEventAction(...args),
}));

describe("EventActions - 統合テスト（進化版）", () => {
  const mockEventId = "event123";

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockRefresh.mockClear();
    mockDeleteEventAction.mockClear();
  });

  describe("Green Phase - 機能テスト", () => {
    it("EventActionsコンポーネントが正常にレンダリングされる", () => {
      render(<EventActions eventId={mockEventId} />);

      expect(screen.getByRole("button", { name: /編集/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /削除/ })).toBeInTheDocument();
    });

    it("空のeventIdの場合、ボタンが無効化される", () => {
      render(<EventActions eventId="" />);

      const editButton = screen.getByRole("button", { name: /編集/ });
      const deleteButton = screen.getByRole("button", { name: /削除/ });

      expect(editButton).toBeDisabled();
      expect(deleteButton).toBeDisabled();
    });

    it("編集ボタンが正しく表示される", () => {
      render(<EventActions eventId={mockEventId} />);
      expect(screen.getByRole("button", { name: /編集/ })).toBeInTheDocument();
    });

    it("削除ボタンが正しく表示される", () => {
      render(<EventActions eventId={mockEventId} />);
      expect(screen.getByRole("button", { name: /削除/ })).toBeInTheDocument();
    });

    it("編集ボタンクリック時に編集ページに遷移する", () => {
      render(<EventActions eventId={mockEventId} />);

      const editButton = screen.getByRole("button", { name: /編集/ });
      fireEvent.click(editButton);

      expect(mockPush).toHaveBeenCalledWith(`/events/${mockEventId}/edit`);
    });

    it("削除ボタンクリック時に確認ダイアログが表示される", () => {
      render(<EventActions eventId={mockEventId} />);

      const deleteButton = screen.getByRole("button", { name: /削除/ });
      fireEvent.click(deleteButton);

      expect(screen.getByText(/本当に削除しますか/)).toBeInTheDocument();
    });

    it("削除確認ダイアログでキャンセルを選択した場合、削除処理が実行されない", () => {
      render(<EventActions eventId={mockEventId} />);

      const deleteButton = screen.getByRole("button", { name: /削除/ });
      fireEvent.click(deleteButton);

      const cancelButton = screen.getByRole("button", { name: /キャンセル/ });
      fireEvent.click(cancelButton);

      expect(mockDeleteEventAction).not.toHaveBeenCalled();
    });

    it("削除確認ダイアログで確認を選択した場合、削除処理が実行される", async () => {
      // Server Actionの成功レスポンスをモック
      mockDeleteEventAction.mockResolvedValue({ success: true });

      render(<EventActions eventId={mockEventId} />);

      const deleteButton = screen.getByRole("button", { name: /削除/ });
      fireEvent.click(deleteButton);

      const confirmButton = screen.getByRole("button", { name: /削除する/ });

      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(mockDeleteEventAction).toHaveBeenCalledWith(mockEventId);
      });
    });

    it("削除処理が成功した場合、イベント一覧ページにリダイレクトする", async () => {
      // Server Actionの成功レスポンスをモック
      mockDeleteEventAction.mockResolvedValue({ success: true });

      render(<EventActions eventId={mockEventId} />);

      const deleteButton = screen.getByRole("button", { name: /削除/ });
      fireEvent.click(deleteButton);

      const confirmButton = screen.getByRole("button", { name: /削除する/ });

      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/events");
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it("削除処理が失敗した場合、エラーメッセージが表示される", async () => {
      // Server Actionの失敗レスポンスをモック
      const errorMessage = "削除に失敗しました";
      mockDeleteEventAction.mockResolvedValue({
        success: false,
        error: { message: errorMessage },
      });

      render(<EventActions eventId={mockEventId} />);

      const deleteButton = screen.getByRole("button", { name: /削除/ });
      fireEvent.click(deleteButton);

      const confirmButton = screen.getByRole("button", { name: /削除する/ });

      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it("ローディング状態の時、ボタンが無効化される", async () => {
      // Server Actionを遅延させる
      mockDeleteEventAction.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      render(<EventActions eventId={mockEventId} />);

      const deleteButton = screen.getByRole("button", { name: /削除/ });
      fireEvent.click(deleteButton);

      const confirmButton = screen.getByRole("button", { name: /削除する/ });

      act(() => {
        fireEvent.click(confirmButton);
      });

      // ローディング中はボタンが無効化される
      expect(confirmButton).toBeDisabled();

      await waitFor(() => {
        expect(confirmButton).not.toBeDisabled();
      });
    });
  });
});
