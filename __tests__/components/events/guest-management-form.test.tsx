import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { GuestManagementForm } from "@/components/events/guest-management-form";
import { updateGuestAttendanceAction } from "@/app/events/actions/update-guest-attendance";
import type { GuestAttendanceData } from "@/lib/utils/guest-token";

// モック
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/app/events/actions/update-guest-attendance", () => ({
  updateGuestAttendanceAction: jest.fn(),
}));

const mockRouter = {
  refresh: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  prefetch: jest.fn(),
};

const mockAttendanceData: GuestAttendanceData = {
  id: "attendance-123",
  nickname: "テストユーザー",
  email: "test@example.com",
  status: "attending",
  guest_token: "test-guest-token-123",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  event: {
    id: "event-123",
    title: "テストイベント",
    description: "テストイベントの説明",
    date: "2024-12-31T15:00:00Z",
    location: "テスト会場",
    fee: 1000,
    capacity: 50,
    registration_deadline: "2024-12-30T15:00:00Z",
    payment_deadline: "2024-12-30T15:00:00Z",
    created_by: "organizer-123",
  },
  payment: {
    id: "payment-123",
    amount: 1000,
    method: "stripe",
    status: "pending",
    created_at: "2024-01-01T00:00:00Z",
  },
};

const mockAttendanceDataFree: GuestAttendanceData = {
  ...mockAttendanceData,
  event: {
    ...mockAttendanceData.event,
    fee: 0,
  },
  payment: null,
};

describe("GuestManagementForm", () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    jest.clearAllMocks();
  });

  describe("現在の参加状況表示", () => {
    it("参加ステータスが正しく表示される", () => {
      render(<GuestManagementForm attendance={mockAttendanceData} canModify={true} />);

      expect(screen.getByText("参加")).toBeInTheDocument();
      expect(screen.getByText("クレジットカード")).toBeInTheDocument();
      expect(screen.getByText("未完了")).toBeInTheDocument();
    });

    it("無料イベントの場合は決済情報が表示されない", () => {
      render(<GuestManagementForm attendance={mockAttendanceDataFree} canModify={true} />);

      expect(screen.queryByText("決済方法")).not.toBeInTheDocument();
      expect(screen.queryByText("決済状況")).not.toBeInTheDocument();
    });
  });

  describe("変更不可の場合", () => {
    it("変更不可の警告が表示される", () => {
      render(<GuestManagementForm attendance={mockAttendanceData} canModify={false} />);

      expect(screen.getByText(/参加状況の変更期限を過ぎているため/)).toBeInTheDocument();
    });

    it("フォームが表示されない", () => {
      render(<GuestManagementForm attendance={mockAttendanceData} canModify={false} />);

      expect(screen.queryByText("参加状況の変更")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /変更を保存/ })).not.toBeInTheDocument();
    });
  });

  describe("参加状況変更フォーム", () => {
    it("参加ステータスの選択肢が表示される", () => {
      render(<GuestManagementForm attendance={mockAttendanceData} canModify={true} />);

      expect(screen.getByLabelText("参加")).toBeInTheDocument();
      expect(screen.getByLabelText("不参加")).toBeInTheDocument();
      expect(screen.getByLabelText("未定")).toBeInTheDocument();
    });

    it("参加を選択した場合に決済方法が表示される", () => {
      render(<GuestManagementForm attendance={mockAttendanceData} canModify={true} />);

      // 参加が選択されている状態で決済方法が表示される
      expect(screen.getByText("決済方法")).toBeInTheDocument();
      expect(screen.getByLabelText("クレジットカード")).toBeInTheDocument();
      expect(screen.getByLabelText("現金")).toBeInTheDocument();
    });

    it("不参加を選択した場合に決済方法が非表示になる", () => {
      render(<GuestManagementForm attendance={mockAttendanceData} canModify={true} />);

      // 不参加を選択
      fireEvent.click(screen.getByLabelText("不参加"));

      expect(screen.queryByText("決済方法")).not.toBeInTheDocument();
    });

    it("無料イベントの場合は決済方法が表示されない", () => {
      render(<GuestManagementForm attendance={mockAttendanceDataFree} canModify={true} />);

      expect(screen.queryByText("決済方法")).not.toBeInTheDocument();
    });
  });

  describe("フォーム送信", () => {
    it("変更がない場合は送信ボタンが無効化される", () => {
      render(<GuestManagementForm attendance={mockAttendanceData} canModify={true} />);

      const submitButton = screen.getByRole("button", { name: /変更を保存/ });
      expect(submitButton).toBeDisabled();
    });

    it("変更がある場合は送信ボタンが有効化される", () => {
      render(<GuestManagementForm attendance={mockAttendanceData} canModify={true} />);

      // 不参加に変更
      fireEvent.click(screen.getByLabelText("不参加"));

      const submitButton = screen.getByRole("button", { name: /変更を保存/ });
      expect(submitButton).not.toBeDisabled();
    });

    it("成功時にページがリフレッシュされる", async () => {
      (updateGuestAttendanceAction as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          attendanceId: "attendance-123",
          status: "not_attending",
          requiresPayment: false,
        },
      });

      render(<GuestManagementForm attendance={mockAttendanceData} canModify={true} />);

      // 不参加に変更
      fireEvent.click(screen.getByLabelText("不参加"));

      // フォーム送信
      const submitButton = screen.getByRole("button", { name: /変更を保存/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(updateGuestAttendanceAction).toHaveBeenCalledWith(expect.any(FormData));
        expect(mockRouter.refresh).toHaveBeenCalled();
      });

      expect(screen.getByText("参加状況を更新しました")).toBeInTheDocument();
    });

    it("エラー時にエラーメッセージが表示される", async () => {
      (updateGuestAttendanceAction as jest.Mock).mockResolvedValue({
        success: false,
        error: "更新に失敗しました",
      });

      render(<GuestManagementForm attendance={mockAttendanceData} canModify={true} />);

      // 不参加に変更
      fireEvent.click(screen.getByLabelText("不参加"));

      // フォーム送信
      const submitButton = screen.getByRole("button", { name: /変更を保存/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("更新に失敗しました")).toBeInTheDocument();
      });
    });

    it("送信中はローディング状態が表示される", async () => {
      (updateGuestAttendanceAction as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      render(<GuestManagementForm attendance={mockAttendanceData} canModify={true} />);

      // 不参加に変更
      fireEvent.click(screen.getByLabelText("不参加"));

      // フォーム送信
      const submitButton = screen.getByRole("button", { name: /変更を保存/ });
      fireEvent.click(submitButton);

      expect(screen.getByText("更新中...")).toBeInTheDocument();
      expect(submitButton).toBeDisabled();
    });
  });

  describe("イベント詳細表示", () => {
    it("イベント情報が正しく表示される", () => {
      render(<GuestManagementForm attendance={mockAttendanceData} canModify={true} />);

      expect(screen.getByText("テストイベント")).toBeInTheDocument();
      expect(screen.getByText("テスト会場")).toBeInTheDocument();
      expect(screen.getByText("1,000円")).toBeInTheDocument();
      expect(screen.getByText("テストイベントの説明")).toBeInTheDocument();
    });

    it("参加者情報が正しく表示される", () => {
      render(<GuestManagementForm attendance={mockAttendanceData} canModify={true} />);

      expect(screen.getByText("テストユーザー")).toBeInTheDocument();
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });
  });
});
