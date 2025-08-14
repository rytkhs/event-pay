/**
 * PaymentServiceの単体テスト
 */

import { PaymentService, PaymentErrorHandler } from "@/lib/services/payment/service";
import { PaymentError, PaymentErrorType } from "@/lib/services/payment/types";

// Supabaseクライアントのモック
const mockSupabase = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(),
        maybeSingle: jest.fn(),
      })),
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(),
          maybeSingle: jest.fn(),
        })),
      })),
    })),
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
        maybeSingle: jest.fn(),
      })),
    })),
    delete: jest.fn(() => ({
      eq: jest.fn(),
    })),
  })),
};

// createClientのモック
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe("PaymentService", () => {
  let paymentService: PaymentService;
  let errorHandler: PaymentErrorHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    errorHandler = new PaymentErrorHandler();
    paymentService = new PaymentService(mockSupabase as any, errorHandler);
  });

  describe("createCashPayment", () => {
    it("現金決済レコードを正常に作成できる", async () => {
      const mockPayment = {
        id: "payment-123",
        attendance_id: "attendance-123",
        method: "cash",
        amount: 1000,
        status: "pending",
      };

      const mockSingle = jest.fn().mockResolvedValue({ data: mockPayment, error: null });
      const mockInsert = jest.fn(() => ({ select: jest.fn(() => ({ single: mockSingle, maybeSingle: mockSingle })) }));

      mockSupabase.from.mockReturnValue({
        insert: mockInsert,
        update: jest.fn(),
        select: jest.fn(),
        delete: jest.fn(),
      });

      const result = await paymentService.createCashPayment({
        attendanceId: "attendance-123",
        amount: 1000,
      });

      expect(result).toEqual({
        paymentId: "payment-123",
      });

      expect(mockSupabase.from).toHaveBeenCalledWith("payments");
      expect(mockInsert).toHaveBeenCalledWith({
        attendance_id: "attendance-123",
        method: "cash",
        amount: 1000,
        status: "pending",
      });
    });

    it("重複エラーの場合は適切なエラーを投げる", async () => {
      const mockError = {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      };

      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: mockError });
      const mockInsert = jest.fn(() => ({ select: jest.fn(() => ({ single: mockSingle, maybeSingle: mockSingle })) }));

      mockSupabase.from.mockReturnValue({
        insert: mockInsert,
        update: jest.fn(),
        select: jest.fn(),
        delete: jest.fn(),
      });

      await expect(
        paymentService.createCashPayment({
          attendanceId: "attendance-123",
          amount: 1000,
        })
      ).rejects.toThrow(PaymentError);

      try {
        await paymentService.createCashPayment({
          attendanceId: "attendance-123",
          amount: 1000,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).type).toBe(PaymentErrorType.PAYMENT_ALREADY_EXISTS);
      }
    });

    it("データベースエラーの場合は適切なエラーを投げる", async () => {
      const mockError = {
        code: "42P01",
        message: 'relation "payments" does not exist',
      };

      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: mockError });
      const mockInsert = jest.fn(() => ({ select: jest.fn(() => ({ single: mockSingle, maybeSingle: mockSingle })) }));

      mockSupabase.from.mockReturnValue({
        insert: mockInsert,
        update: jest.fn(),
        select: jest.fn(),
        delete: jest.fn(),
      });

      await expect(
        paymentService.createCashPayment({
          attendanceId: "attendance-123",
          amount: 1000,
        })
      ).rejects.toThrow(PaymentError);

      try {
        await paymentService.createCashPayment({
          attendanceId: "attendance-123",
          amount: 1000,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).type).toBe(PaymentErrorType.DATABASE_ERROR);
      }
    });
  });

  describe("updatePaymentStatus", () => {
    it("決済ステータスを正常に更新できる", async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: { id: "payment-123" }, error: null });
      const mockSelect = jest.fn(() => ({ single: mockSingle, maybeSingle: mockSingle }));
      const mockEq = jest.fn(() => ({ select: mockSelect }));
      const mockUpdate = jest.fn(() => ({ eq: mockEq }));

      mockSupabase.from.mockReturnValue({ update: mockUpdate, insert: jest.fn(), select: jest.fn(), delete: jest.fn() });

      await paymentService.updatePaymentStatus({
        paymentId: "payment-123",
        status: "paid",
        paidAt: new Date("2024-01-01T00:00:00Z"),
        stripePaymentIntentId: "pi_123",
      });

      expect(mockSupabase.from).toHaveBeenCalledWith("payments");
      expect(mockUpdate).toHaveBeenCalledWith({
        status: "paid",
        updated_at: expect.any(String),
        paid_at: "2024-01-01T00:00:00.000Z",
        stripe_payment_intent_id: "pi_123",
      });
      expect(mockEq).toHaveBeenCalledWith("id", "payment-123");
      expect(mockSelect).toHaveBeenCalledWith("id");
      expect(mockSingle).toHaveBeenCalled();
    });

    it("対象が存在しない場合はPAYMENT_NOT_FOUNDを投げる", async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: null });
      const mockSelect = jest.fn(() => ({ single: mockSingle, maybeSingle: mockSingle }));
      const mockEq = jest.fn(() => ({ select: mockSelect }));
      const mockUpdate = jest.fn(() => ({ eq: mockEq }));

      mockSupabase.from.mockReturnValue({ update: mockUpdate, insert: jest.fn(), select: jest.fn(), delete: jest.fn() });

      await expect(
        paymentService.updatePaymentStatus({ paymentId: "payment-404", status: "paid" })
      ).rejects.toThrow(PaymentError);

      try {
        await paymentService.updatePaymentStatus({ paymentId: "payment-404", status: "paid" });
      } catch (error) {
        expect((error as PaymentError).type).toBe(PaymentErrorType.PAYMENT_NOT_FOUND);
      }
    });

    it("データベースエラーの場合は適切なエラーを投げる", async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { code: "XXERR", message: "update failed" } });
      const mockSelect = jest.fn(() => ({ single: mockSingle, maybeSingle: mockSingle }));
      const mockEq = jest.fn(() => ({ select: mockSelect }));
      const mockUpdate = jest.fn(() => ({ eq: mockEq }));

      mockSupabase.from.mockReturnValue({ update: mockUpdate, insert: jest.fn(), select: jest.fn(), delete: jest.fn() });

      await expect(
        paymentService.updatePaymentStatus({ paymentId: "payment-123", status: "paid" })
      ).rejects.toThrow(PaymentError);
    });
  });

  describe("getPaymentByAttendance", () => {
    it("参加記録IDから決済情報を正常に取得できる", async () => {
      const mockPayment = {
        id: "payment-123",
        attendance_id: "attendance-123",
        method: "cash",
        amount: 1000,
        status: "pending",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const mockSingle = jest.fn().mockResolvedValue({ data: mockPayment, error: null });
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => ({
          single: mockSingle,
          maybeSingle: mockSingle,
        })),
      }));

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      });

      const result = await paymentService.getPaymentByAttendance("attendance-123");

      expect(result).toEqual(mockPayment);
      expect(mockSupabase.from).toHaveBeenCalledWith("payments");
      expect(mockSelect).toHaveBeenCalledWith("*");
    });

    it("レコードが見つからない場合はnullを返す", async () => {
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      }));

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      });

      const result = await paymentService.getPaymentByAttendance("attendance-123");

      expect(result).toBeNull();
    });

    it("データベースエラーの場合は適切なエラーを投げる", async () => {
      const mockError = {
        code: "42P01",
        message: 'relation "payments" does not exist',
      };

      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: mockError });
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => ({
          single: mockSingle,
          maybeSingle: mockSingle,
        })),
      }));

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      });

      await expect(paymentService.getPaymentByAttendance("attendance-123")).rejects.toThrow(
        PaymentError
      );
    });
  });

  describe("deletePayment", () => {
    it("決済レコードを正常に削除できる", async () => {
      const mockDelete = jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      }));

      mockSupabase.from.mockReturnValue({
        delete: mockDelete,
        insert: jest.fn(),
        select: jest.fn(),
        update: jest.fn(),
      });

      await paymentService.deletePayment("payment-123");

      expect(mockSupabase.from).toHaveBeenCalledWith("payments");
      expect(mockDelete).toHaveBeenCalled();
    });

    it("データベースエラーの場合は適切なエラーを投げる", async () => {
      const mockError = {
        message: "delete failed",
      };

      const mockDelete = jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({
          error: mockError,
        }),
      }));

      mockSupabase.from.mockReturnValue({
        delete: mockDelete,
        insert: jest.fn(),
        select: jest.fn(),
        update: jest.fn(),
      });

      await expect(paymentService.deletePayment("payment-123")).rejects.toThrow(PaymentError);
    });
  });
});

describe("PaymentErrorHandler", () => {
  let errorHandler: PaymentErrorHandler;

  beforeEach(() => {
    errorHandler = new PaymentErrorHandler();
  });

  describe("handlePaymentError", () => {
    it("INVALID_STATUS_TRANSITIONエラーを適切に処理する", async () => {
      const error = new PaymentError(
        PaymentErrorType.INVALID_STATUS_TRANSITION,
        "Invalid status transition"
      );

      const result = await errorHandler.handlePaymentError(error);

      expect(result).toEqual({
        userMessage: "指定の状態に変更できません。操作内容をご確認ください。",
        shouldRetry: false,
        logLevel: "warn",
      });
    });
    it("INVALID_PAYMENT_METHODエラーを適切に処理する", async () => {
      const error = new PaymentError(
        PaymentErrorType.INVALID_PAYMENT_METHOD,
        "Invalid payment method"
      );

      const result = await errorHandler.handlePaymentError(error);

      expect(result).toEqual({
        userMessage: "入力内容に誤りがあります。確認して再度お試しください。",
        shouldRetry: false,
        logLevel: "warn",
      });
    });

    it("PAYMENT_ALREADY_EXISTSエラーを適切に処理する", async () => {
      const error = new PaymentError(
        PaymentErrorType.PAYMENT_ALREADY_EXISTS,
        "Payment already exists"
      );

      const result = await errorHandler.handlePaymentError(error);

      expect(result).toEqual({
        userMessage: "この参加に対する決済は既に作成されています。",
        shouldRetry: false,
        logLevel: "info",
      });
    });

    it("STRIPE_API_ERRORエラーを適切に処理する", async () => {
      const error = new PaymentError(PaymentErrorType.STRIPE_API_ERROR, "Stripe API error");

      const result = await errorHandler.handlePaymentError(error);

      expect(result).toEqual({
        userMessage: "決済処理中にエラーが発生しました。しばらく待ってから再度お試しください。",
        shouldRetry: true,
        logLevel: "error",
      });
    });

    it("DATABASE_ERRORエラーを適切に処理する", async () => {
      const error = new PaymentError(PaymentErrorType.DATABASE_ERROR, "Database error");

      const result = await errorHandler.handlePaymentError(error);

      expect(result).toEqual({
        userMessage: "システムエラーが発生しました。管理者にお問い合わせください。",
        shouldRetry: false,
        logLevel: "error",
      });
    });
  });

  describe("logError", () => {
    it("エラーログを正常に記録する", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const error = new PaymentError(PaymentErrorType.DATABASE_ERROR, "Test error");

      const context = { userId: "user-123", eventId: "event-123" };

      await errorHandler.logError(error, context);

      expect(consoleSpy).toHaveBeenCalledWith("PaymentError:", {
        timestamp: expect.any(String),
        errorType: PaymentErrorType.DATABASE_ERROR,
        message: "Test error",
        stack: expect.any(String),
        cause: undefined,
        context,
      });

      consoleSpy.mockRestore();
    });
  });
});
