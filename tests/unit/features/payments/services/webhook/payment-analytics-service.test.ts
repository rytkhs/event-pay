import { PaymentAnalyticsWebhookService } from "@features/payments/services/webhook/services/payment-analytics-service";
import { paymentAnalytics } from "@features/payments/services/analytics/payment-analytics";

jest.mock("@features/payments/services/analytics/payment-analytics", () => ({
  paymentAnalytics: {
    trackPurchaseCompletion: jest.fn(),
  },
}));

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: jest.fn(),
}));

describe("PaymentAnalyticsWebhookService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("ga_session_id metadataをpurchase送信まで渡す", async () => {
    const single = jest.fn().mockResolvedValue({
      data: {
        event: {
          id: "event-1",
          title: "Test Event",
        },
      },
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ select });

    const service = new PaymentAnalyticsWebhookService({
      supabase: { from } as never,
      logger: { warn: jest.fn() } as never,
    });

    await service.trackCheckoutCompletion({
      paymentId: "payment-1",
      attendanceId: "attendance-1",
      sessionId: "cs_test_123",
      gaClientId: "1234567890.0987654321",
      gaSessionId: "1699999999",
      amount: 1000,
    });

    expect(paymentAnalytics.trackPurchaseCompletion).toHaveBeenCalledWith({
      clientId: "1234567890.0987654321",
      transactionId: "cs_test_123",
      eventId: "event-1",
      eventTitle: "Test Event",
      amount: 1000,
      sessionId: 1699999999,
    });
  });
});
