import { updateGuestAttendanceAction } from "@/app/events/actions/update-guest-attendance";
import { validateGuestToken } from "@/lib/utils/guest-token";
import { createClient } from "@/lib/supabase/server";

// モック
jest.mock("@/lib/utils/guest-token", () => ({
  validateGuestToken: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

const mockSupabase = {
  rpc: jest.fn(),
  from: jest.fn(),
};

const mockAttendanceData = {
  id: "attendance-123",
  nickname: "テストユーザー",
  email: "test@example.com",
  status: "attending",
  guest_token: "testguesttoken123456789012345678",
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
    organizer_id: "organizer-123",
  },
  payment: {
    id: "payment-123",
    amount: 1000,
    method: "stripe",
    status: "pending",
    created_at: "2024-01-01T00:00:00Z",
  },
};

describe("updateGuestAttendanceAction", () => {
  beforeEach(() => {
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    jest.clearAllMocks();
  });

  describe("基本検証", () => {
    it("ゲストトークンが必要", async () => {
      const formData = new FormData();
      formData.append("attendanceStatus", "attending");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("ゲストトークンが必要です");
    });

    it("無効なゲストトークンの場合はエラー", async () => {
      (validateGuestToken as jest.Mock).mockResolvedValue({
        isValid: false,
        errorMessage: "無効なゲストトークンです",
        canModify: false,
      });

      const formData = new FormData();
      formData.append("guestToken", "invalid-token");
      formData.append("attendanceStatus", "attending");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("無効なゲストトークンです");
    });

    it("変更不可の場合はエラー", async () => {
      (validateGuestToken as jest.Mock).mockResolvedValue({
        isValid: true,
        attendance: mockAttendanceData,
        canModify: false,
      });

      const formData = new FormData();
      formData.append("guestToken", "test-guest-token-123456789012");
      formData.append("attendanceStatus", "attending");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("参加状況の変更期限を過ぎています");
    });
  });

  describe("参加ステータス検証", () => {
    beforeEach(() => {
      (validateGuestToken as jest.Mock).mockResolvedValue({
        isValid: true,
        attendance: mockAttendanceData,
        canModify: true,
      });
    });

    it("無効な参加ステータスはエラー", async () => {
      const formData = new FormData();
      formData.append("guestToken", "test-guest-token-123456789012");
      formData.append("attendanceStatus", "invalid-status");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("有効な参加ステータスを選択してください");
    });

    it("参加の場合で有料イベントの場合は決済方法が必須", async () => {
      const formData = new FormData();
      formData.append("guestToken", "test-guest-token-123456789012");
      formData.append("attendanceStatus", "attending");
      // paymentMethodを設定しない

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("参加を選択した場合は決済方法を選択してください");
    });

    it("無効な決済方法はエラー", async () => {
      const formData = new FormData();
      formData.append("guestToken", "test-guest-token-123456789012");
      formData.append("attendanceStatus", "attending");
      formData.append("paymentMethod", "invalid-method");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("有効な決済方法を選択してください");
    });
  });

  describe("定員チェック", () => {
    beforeEach(() => {
      (validateGuestToken as jest.Mock).mockResolvedValue({
        isValid: true,
        attendance: {
          ...mockAttendanceData,
          status: "maybe", // 未定から参加に変更する場合
        },
        canModify: true,
      });
    });

    it("定員に達している場合は参加不可", async () => {
      // イベント情報の取得をモック
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { capacity: 2 },
            error: null,
          }),
        }),
      });

      // 参加者数の取得をモック（定員に達している）
      const mockCount = jest.fn().mockResolvedValue({
        count: 2,
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "events") {
          return { select: mockSelect };
        } else if (table === "attendances") {
          return { select: mockCount };
        }
        return {};
      });

      const formData = new FormData();
      formData.append("guestToken", "test-guest-token-123456789012");
      formData.append("attendanceStatus", "attending");
      formData.append("paymentMethod", "stripe");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("イベントの定員に達しているため参加できません");
    });
  });

  describe("正常な更新", () => {
    beforeEach(() => {
      (validateGuestToken as jest.Mock).mockResolvedValue({
        isValid: true,
        attendance: mockAttendanceData,
        canModify: true,
      });

      // 定員チェックのモック（定員に余裕がある）
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { capacity: 50 },
            error: null,
          }),
        }),
      });

      const mockCount = jest.fn().mockResolvedValue({
        count: 10,
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "events") {
          return { select: mockSelect };
        } else if (table === "attendances") {
          return { select: mockCount };
        }
        return {};
      });

      mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    });

    it("参加ステータスの更新が成功する", async () => {
      const formData = new FormData();
      formData.append("guestToken", "test-guest-token-123456789012");
      formData.append("attendanceStatus", "not_attending");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("not_attending");
      expect(result.data?.requiresPayment).toBe(false);

      expect(mockSupabase.rpc).toHaveBeenCalledWith("update_guest_attendance_with_payment", {
        p_attendance_id: "attendance-123",
        p_status: "not_attending",
        p_payment_method: null,
        p_event_fee: 1000,
      });
    });

    it("参加ステータスと決済方法の更新が成功する", async () => {
      const formData = new FormData();
      formData.append("guestToken", "test-guest-token-123456789012");
      formData.append("attendanceStatus", "attending");
      formData.append("paymentMethod", "cash");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("attending");
      expect(result.data?.paymentMethod).toBe("cash");
      expect(result.data?.requiresPayment).toBe(true);

      expect(mockSupabase.rpc).toHaveBeenCalledWith("update_guest_attendance_with_payment", {
        p_attendance_id: "attendance-123",
        p_status: "attending",
        p_payment_method: "cash",
        p_event_fee: 1000,
      });
    });

    it("無料イベントの場合は決済不要", async () => {
      (validateGuestToken as jest.Mock).mockResolvedValue({
        isValid: true,
        attendance: {
          ...mockAttendanceData,
          event: {
            ...mockAttendanceData.event,
            fee: 0, // 無料イベント
          },
        },
        canModify: true,
      });

      const formData = new FormData();
      formData.append("guestToken", "test-guest-token-123456789012");
      formData.append("attendanceStatus", "attending");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("attending");
      expect(result.data?.requiresPayment).toBe(false);

      expect(mockSupabase.rpc).toHaveBeenCalledWith("update_guest_attendance_with_payment", {
        p_attendance_id: "attendance-123",
        p_status: "attending",
        p_payment_method: null,
        p_event_fee: 0,
      });
    });
  });

  describe("エラーハンドリング", () => {
    beforeEach(() => {
      (validateGuestToken as jest.Mock).mockResolvedValue({
        isValid: true,
        attendance: mockAttendanceData,
        canModify: true,
      });
    });

    it("データベースエラー時は適切なエラーメッセージを返す", async () => {
      mockSupabase.rpc.mockRejectedValue(new Error("Database error"));

      const formData = new FormData();
      formData.append("guestToken", "test-guest-token-123456789012");
      formData.append("attendanceStatus", "not_attending");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("参加状況の更新中にエラーが発生しました");
    });

    it("予期しないエラー時は適切なエラーメッセージを返す", async () => {
      (validateGuestToken as jest.Mock).mockRejectedValue(new Error("Unexpected error"));

      const formData = new FormData();
      formData.append("guestToken", "test-guest-token-123456789012");
      formData.append("attendanceStatus", "attending");

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe("参加状況の更新中にエラーが発生しました");
    });
  });
});