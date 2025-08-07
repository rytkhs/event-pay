/**
 * PaymentValidatorの単体テスト
 */

import { PaymentValidator, validateUUID, validateUrl } from "@/lib/services/payment/validation";
import { PaymentError, PaymentErrorType } from "@/lib/services/payment/types";

// Supabaseクライアントのモック
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
  })),
};

// createClientのモック
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe("PaymentValidator", () => {
  let validator: PaymentValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new PaymentValidator("mock-url", "mock-key");
  });

  describe("validateCreateStripeSessionParams", () => {
    const validParams = {
      attendanceId: "123e4567-e89b-12d3-a456-426614174000",
      amount: 1000,
      eventTitle: "テストイベント",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    it("有効なパラメータの場合は正常に処理される", async () => {
      // 参加記録の存在確認をモック
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: {
              id: validParams.attendanceId,
              event_id: "event-123",
              events: { id: "event-123", created_by: "user-123" },
            },
            error: null,
          }),
        })),
      }));

      mockSupabase.from.mockReturnValueOnce({
        select: mockSelect,
      });

      // 重複チェックをモック（重複なし）
      const mockSelectDuplicate = jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: "PGRST116" },
          }),
        })),
      }));

      mockSupabase.from.mockReturnValueOnce({
        select: mockSelectDuplicate,
      });

      await expect(validator.validateCreateStripeSessionParams(validParams)).resolves.not.toThrow();
    });

    it("無効なUUIDの場合はエラーを投げる", async () => {
      const invalidParams = {
        ...validParams,
        attendanceId: "invalid-uuid",
      };

      await expect(validator.validateCreateStripeSessionParams(invalidParams)).rejects.toThrow(
        PaymentError
      );

      try {
        await validator.validateCreateStripeSessionParams(invalidParams);
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).type).toBe(PaymentErrorType.INVALID_PAYMENT_METHOD);
      }
    });

    it("負の金額の場合はエラーを投げる", async () => {
      const invalidParams = {
        ...validParams,
        amount: -100,
      };

      await expect(validator.validateCreateStripeSessionParams(invalidParams)).rejects.toThrow(
        PaymentError
      );
    });

    it("無効なURLの場合はエラーを投げる", async () => {
      const invalidParams = {
        ...validParams,
        successUrl: "invalid-url",
      };

      await expect(validator.validateCreateStripeSessionParams(invalidParams)).rejects.toThrow(
        PaymentError
      );
    });

    it("空のイベントタイトルの場合はエラーを投げる", async () => {
      const invalidParams = {
        ...validParams,
        eventTitle: "",
      };

      await expect(validator.validateCreateStripeSessionParams(invalidParams)).rejects.toThrow(
        PaymentError
      );
    });
  });

  describe("validateCreateCashPaymentParams", () => {
    const validParams = {
      attendanceId: "123e4567-e89b-12d3-a456-426614174000",
      amount: 1000,
    };

    it("有効なパラメータの場合は正常に処理される", async () => {
      // 参加記録の存在確認をモック
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: {
              id: validParams.attendanceId,
              event_id: "event-123",
              events: { id: "event-123", created_by: "user-123" },
            },
            error: null,
          }),
        })),
      }));

      mockSupabase.from.mockReturnValueOnce({
        select: mockSelect,
      });

      // 重複チェックをモック（重複なし）
      const mockSelectDuplicate = jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: "PGRST116" },
          }),
        })),
      }));

      mockSupabase.from.mockReturnValueOnce({
        select: mockSelectDuplicate,
      });

      await expect(validator.validateCreateCashPaymentParams(validParams)).resolves.not.toThrow();
    });

    it("小数点を含む金額の場合はエラーを投げる", async () => {
      const invalidParams = {
        ...validParams,
        amount: 100.5,
      };

      await expect(validator.validateCreateCashPaymentParams(invalidParams)).rejects.toThrow(
        PaymentError
      );
    });
  });

  describe("validateUpdatePaymentStatusParams", () => {
    const validParams = {
      paymentId: "123e4567-e89b-12d3-a456-426614174000",
      status: "paid" as const,
    };

    it("有効なパラメータの場合は正常に処理される", async () => {
      // 決済レコードの存在確認をモック
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: { id: validParams.paymentId },
            error: null,
          }),
        })),
      }));

      mockSupabase.from.mockReturnValueOnce({
        select: mockSelect,
      });

      // ステータス遷移チェックをモック
      const mockSelectStatus = jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: { status: "pending", method: "stripe" },
            error: null,
          }),
        })),
      }));

      mockSupabase.from.mockReturnValueOnce({
        select: mockSelectStatus,
      });

      await expect(validator.validateUpdatePaymentStatusParams(validParams)).resolves.not.toThrow();
    });

    it("無効なステータスの場合はエラーを投げる", async () => {
      const invalidParams = {
        ...validParams,
        status: "invalid-status" as any,
      };

      await expect(validator.validateUpdatePaymentStatusParams(invalidParams)).rejects.toThrow(
        PaymentError
      );
    });
  });

  describe("validatePaymentAmount", () => {
    it("有効な金額の場合は正常に処理される", async () => {
      await expect(validator.validatePaymentAmount(1000)).resolves.not.toThrow();
    });

    it("0円の場合はエラーを投げる", async () => {
      await expect(validator.validatePaymentAmount(0)).rejects.toThrow(PaymentError);

      try {
        await validator.validatePaymentAmount(0);
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).type).toBe(PaymentErrorType.INVALID_AMOUNT);
      }
    });

    it("負の金額の場合はエラーを投げる", async () => {
      await expect(validator.validatePaymentAmount(-100)).rejects.toThrow(PaymentError);
    });

    it("小数点を含む金額の場合はエラーを投げる", async () => {
      await expect(validator.validatePaymentAmount(100.5)).rejects.toThrow(PaymentError);
    });

    it("最大金額を超える場合はエラーを投げる", async () => {
      await expect(validator.validatePaymentAmount(1000001)).rejects.toThrow(PaymentError);
    });
  });

  describe("validateAttendanceAccess", () => {
    it("存在する参加記録の場合は正常に処理される", async () => {
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: {
              id: "attendance-123",
              event_id: "event-123",
              events: { id: "event-123", created_by: "user-123" },
            },
            error: null,
          }),
        })),
      }));

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      await expect(validator.validateAttendanceAccess("attendance-123")).resolves.not.toThrow();
    });

    it("存在しない参加記録の場合はエラーを投げる", async () => {
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: "PGRST116" },
          }),
        })),
      }));

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      await expect(validator.validateAttendanceAccess("attendance-123")).rejects.toThrow(
        PaymentError
      );

      try {
        await validator.validateAttendanceAccess("attendance-123");
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).type).toBe(PaymentErrorType.ATTENDANCE_NOT_FOUND);
      }
    });
  });
});

describe("ヘルパー関数", () => {
  describe("validateUUID", () => {
    it("有効なUUIDの場合は正常に処理される", () => {
      expect(() => {
        validateUUID("123e4567-e89b-12d3-a456-426614174000", "テストID");
      }).not.toThrow();
    });

    it("無効なUUIDの場合はエラーを投げる", () => {
      expect(() => {
        validateUUID("invalid-uuid", "テストID");
      }).toThrow(PaymentError);
    });
  });

  describe("validateUrl", () => {
    it("有効なURLの場合は正常に処理される", () => {
      expect(() => {
        validateUrl("https://example.com", "テストURL");
      }).not.toThrow();
    });

    it("無効なURLの場合はエラーを投げる", () => {
      expect(() => {
        validateUrl("invalid-url", "テストURL");
      }).toThrow(PaymentError);
    });
  });
});
