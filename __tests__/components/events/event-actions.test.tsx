import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { EventActions } from "@/components/events/event-actions";

// Mock Next.js navigation
const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock delete action
const mockDeleteEventAction = jest.fn();

jest.mock("@/app/events/actions/delete-event", () => ({
  deleteEventAction: (...args: any[]) => mockDeleteEventAction(...args),
}));

describe("EventActions Component", () => {
  const mockEventId = "event123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Green Phase - 機能テスト", () => {
    test("EventActionsコンポーネントが正常にレンダリングされる", () => {
      render(<EventActions eventId={mockEventId} />);
      expect(screen.getByTestId("event-actions")).toBeInTheDocument();
    });

    test("空のeventIdの場合、ボタンが無効化される", () => {
      render(<EventActions eventId="" />);

      const editButton = screen.getByRole("button", { name: /編集/ });
      const deleteButton = screen.getByRole("button", { name: /削除/ });

      expect(editButton).toBeDisabled();
      expect(deleteButton).toBeDisabled();
    });

    test("編集ボタンが正しく表示される", () => {
      render(<EventActions eventId={mockEventId} />);
      expect(screen.getByRole("button", { name: /編集/ })).toBeInTheDocument();
    });

    test("削除ボタンが正しく表示される", () => {
      render(<EventActions eventId={mockEventId} />);
      expect(screen.getByRole("button", { name: /削除/ })).toBeInTheDocument();
    });

    test("編集ボタンクリック時に編集ページに遷移する", () => {
      render(<EventActions eventId={mockEventId} />);

      const editButton = screen.getByRole("button", { name: /編集/ });
      fireEvent.click(editButton);

      expect(mockPush).toHaveBeenCalledWith(`/events/${mockEventId}/edit`);
    });

    test("削除ボタンクリック時に確認ダイアログが表示される", () => {
      render(<EventActions eventId={mockEventId} />);

      const deleteButton = screen.getByRole("button", { name: /削除/ });
      fireEvent.click(deleteButton);

      expect(screen.getByText(/本当に削除しますか/)).toBeInTheDocument();
    });

    test("削除確認ダイアログでキャンセルを選択した場合、削除処理が実行されない", () => {
      render(<EventActions eventId={mockEventId} />);

      const deleteButton = screen.getByRole("button", { name: /削除/ });
      fireEvent.click(deleteButton);

      const cancelButton = screen.getByRole("button", { name: /キャンセル/ });
      fireEvent.click(cancelButton);

      // ダイアログが閉じられることを確認
      expect(screen.queryByText(/本当に削除しますか/)).not.toBeInTheDocument();
    });

    test("削除確認ダイアログで確認を選択した場合、削除処理が実行される", async () => {
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

    test("削除処理が成功した場合、イベント一覧ページにリダイレクトする", async () => {
      mockDeleteEventAction.mockResolvedValue({ success: true });

      render(<EventActions eventId={mockEventId} />);

      const deleteButton = screen.getByRole("button", { name: /削除/ });
      fireEvent.click(deleteButton);

      const confirmButton = screen.getByRole("button", { name: /削除する/ });

      await act(async () => {
        fireEvent.click(confirmButton);
        // 状態更新の完了を待つ
        await waitFor(() => {
          expect(mockPush).toHaveBeenCalledWith("/events");
        });
      });
    });

    test("削除処理が失敗した場合、エラーメッセージが表示される", async () => {
      mockDeleteEventAction.mockRejectedValue(new Error("Delete failed"));

      render(<EventActions eventId={mockEventId} />);

      const deleteButton = screen.getByRole("button", { name: /削除/ });
      fireEvent.click(deleteButton);

      const confirmButton = screen.getByRole("button", { name: /削除する/ });

      // クリックイベントを発生させる
      fireEvent.click(confirmButton);

      // エラー状態の更新を待つ
      await waitFor(() => {
        expect(screen.getByText(/削除に失敗しました/)).toBeInTheDocument();
      });
    });

    test("ローディング状態の時、ボタンが無効化される", async () => {
      // 処理が遅いことをシミュレート
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockDeleteEventAction.mockReturnValue(promise);

      render(<EventActions eventId={mockEventId} />);

      const deleteButton = screen.getByRole("button", { name: /削除/ });
      fireEvent.click(deleteButton);

      const confirmButton = screen.getByRole("button", { name: /削除する/ });

      // クリックイベントを発生させる
      fireEvent.click(confirmButton);

      // 非同期処理中はボタンが無効化される
      await waitFor(() => {
        expect(confirmButton).toBeDisabled();
      });

      // Promiseを解決して清理
      resolvePromise!({ success: true });
      await promise; // Promiseの完了を待つ
    });
  });
});
