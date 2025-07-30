import { registerParticipationDirectAction } from "@/app/events/actions/register-participation";
import { createClient } from "@/lib/supabase/server";
import { validateInviteToken, checkEventCapacity, checkDuplicateEmail } from "@/lib/utils/invite-token";
import type { ParticipationFormData } from "@/lib/validations/participation";

// Supabaseクライアントのモック
jest.mock("@/lib/supabase/server");
jest.mock("@/lib/utils/invite-token");

const mockSupabase = {
  from: jest.fn(),
};

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockValidateInviteToken = validateInviteToken as jest.MockedFunction<typeof validateInviteToken>;
const mockCheckEventCapacity = checkEventCapacity as jest.MockedFunction<typeof checkEventCapacity>;
const mockCheckDuplicateEmail = checkDuplicateEmail as jest.MockedFunction<typeof checkDuplicateEmail>;

describe("決済レコード作成のテスト", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
    mockCheckEventCapacity.mockResolvedValue(false);
    mockCheckDuplicateEmail.mockResolvedValue(false);
  });

  const baseParticipationData: ParticipationFormData = {
    inviteToken: "abcdefghijklmnopqrstuvwxyz123456", // 32文字の有効なトークン
    nickname: "テストユーザー",
    email: "test@example.com",
    attendanceStatus: "attending",
    paymentMethod: undefined,
  };

  const mockEvent = {
    id: "test-event-id",
    title: "テストイベント",
    fee: 1000,
    capacity: 10,
    payment_methods: ["stripe", "cash"],
  };

  it("Stripe決済選択時にpendingステータスの決済レコードが作成される", async () => {
    const participationData = {
      ...baseParticipationData,
      paymentMethod: "stripe" as const,
    };

    // モックの設定
    mockValidateInviteToken.mockResolvedValue({
      isValid: true,
      canRegister: true,
      event: mockEvent,
    });

    const mockAttendanceInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: "attendance-id" },
          error: null,
        }),
      }),
    });

    const mockPaymentInsert = jest.fn().mockResolvedValue({
      data: { id: "payment-id" },
      error: null,
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "attendances") {
        return {
          insert: mockAttendanceInsert,
        };
      }
      if (table === "payments") {
        return {
          insert: mockPaymentInsert,
        };
      }
      return {};
    });

    const result = await registerParticipationDirectAction(participationData);

    expect(result.success).toBe(true);
    expect(mockPaymentInsert).toHaveBeenCalledWith({
      attendance_id: "attendance-id",
      amount: 1000,
      method: "stripe",
      status: "pending",
    });
  });

  it("Cash決済選択時にpendingステータスの決済レコードが作成される", async () => {
    const participationData = {
      ...baseParticipationData,
      paymentMethod: "cash" as const,
    };

    // モックの設定
    mockValidateInviteToken.mockResolvedValue({
      isValid: true,
      canRegister: true,
      event: mockEvent,
    });

    const mockAttendanceInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: "attendance-id" },
          error: null,
        }),
      }),
    });

    const mockPaymentInsert = jest.fn().mockResolvedValue({
      data: { id: "payment-id" },
      error: null,
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "attendances") {
        return {
          insert: mockAttendanceInsert,
        };
      }
      if (table === "payments") {
        return {
          insert: mockPaymentInsert,
        };
      }
      return {};
    });

    const result = await registerParticipationDirectAction(participationData);

    expect(result.success).toBe(true);
    expect(mockPaymentInsert).toHaveBeenCalledWith({
      attendance_id: "attendance-id",
      amount: 1000,
      method: "cash",
      status: "pending",
    });
  });

  it("無料イベントの場合は決済レコードが作成されない", async () => {
    const participationData = {
      ...baseParticipationData,
      paymentMethod: undefined,
    };

    const freeEvent = {
      ...mockEvent,
      fee: 0,
      payment_methods: ["free"],
    };

    // モックの設定
    mockValidateInviteToken.mockResolvedValue({
      isValid: true,
      canRegister: true,
      event: freeEvent,
    });

    const mockAttendanceInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: "attendance-id" },
          error: null,
        }),
      }),
    });

    const mockPaymentInsert = jest.fn().mockResolvedValue({
      data: { id: "payment-id" },
      error: null,
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "attendances") {
        return {
          insert: mockAttendanceInsert,
        };
      }
      if (table === "payments") {
        return {
          insert: mockPaymentInsert,
        };
      }
      return {};
    });

    const result = await registerParticipationDirectAction(participationData);

    expect(result.success).toBe(true);
    expect(mockPaymentInsert).not.toHaveBeenCalled();
  });

  it("決済レコード作成失敗時に参加記録がロールバックされる", async () => {
    const participationData = {
      ...baseParticipationData,
      paymentMethod: "stripe" as const,
    };

    // モックの設定
    mockValidateInviteToken.mockResolvedValue({
      isValid: true,
      canRegister: true,
      event: mockEvent,
    });

    const mockAttendanceDelete = jest.fn().mockResolvedValue({
      data: null,
      error: null,
    });

    const mockAttendanceInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: "attendance-id" },
          error: null,
        }),
      }),
    });

    const mockPaymentInsert = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "Payment creation failed" },
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "attendances") {
        return {
          insert: mockAttendanceInsert,
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue(mockAttendanceDelete),
          }),
        };
      }
      if (table === "payments") {
        return {
          insert: mockPaymentInsert,
        };
      }
      return {};
    });

    const result = await registerParticipationDirectAction(participationData);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("DATABASE_ERROR");
    expect(result.error?.message).toBe("決済記録の作成中にエラーが発生しました");
    expect(mockAttendanceDelete).toHaveBeenCalled();
  });

  it("不参加選択時は決済レコードが作成されない", async () => {
    const participationData = {
      ...baseParticipationData,
      attendanceStatus: "not_attending" as const,
      paymentMethod: undefined,
    };

    // モックの設定
    mockValidateInviteToken.mockResolvedValue({
      isValid: true,
      canRegister: true,
      event: mockEvent,
    });

    const mockAttendanceInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: "attendance-id" },
          error: null,
        }),
      }),
    });

    const mockPaymentInsert = jest.fn().mockResolvedValue({
      data: { id: "payment-id" },
      error: null,
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "attendances") {
        return {
          insert: mockAttendanceInsert,
        };
      }
      if (table === "payments") {
        return {
          insert: mockPaymentInsert,
        };
      }
      return {};
    });

    const result = await registerParticipationDirectAction(participationData);

    expect(result.success).toBe(true);
    expect(mockPaymentInsert).not.toHaveBeenCalled();
  });
});