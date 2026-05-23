import { ga4Server } from "@core/analytics/ga4-server";
import { logger } from "@core/logging/app-logger";
import { PaymentAnalyticsService } from "@features/payments/services/analytics/payment-analytics";

jest.mock("@core/analytics/ga4-server", () => ({
  ga4Server: {
    sendEvent: jest.fn(),
    isMeasurementProtocolAvailable: jest.fn(),
  },
}));

jest.mock("@core/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: jest.fn(),
}));

const validParams = {
  clientId: "1234567890.0987654321",
  transactionId: "cs_test_123",
  eventId: "event-1",
  eventTitle: "Test Event",
  amount: 1000,
  sessionId: 1699999999,
};

describe("PaymentAnalyticsService", () => {
  let service: PaymentAnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentAnalyticsService();
  });

  test("GA4送信がsentの場合のみsuccess logを出す", async () => {
    (ga4Server.sendEvent as jest.Mock).mockResolvedValue({ status: "sent" });

    await service.trackPurchaseCompletion(validParams);

    expect(logger.info).toHaveBeenCalledWith(
      "[Payment Analytics] Purchase event submitted to GA4 endpoint",
      expect.objectContaining({
        transaction_id: "cs_test_123",
        event_id: "event-1",
        outcome: "success",
      })
    );
    expect(logger.warn).not.toHaveBeenCalledWith(
      "[Payment Analytics] Purchase event tracking did not complete",
      expect.any(Object)
    );
  });

  test("GA4送信がskippedの場合はsuccess logを出さない", async () => {
    (ga4Server.sendEvent as jest.Mock).mockResolvedValue({
      status: "skipped",
      reason: "invalid_or_missing_client_id",
    });

    await service.trackPurchaseCompletion(validParams);

    expect(logger.info).not.toHaveBeenCalledWith(
      "[Payment Analytics] Purchase event submitted to GA4 endpoint",
      expect.any(Object)
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "[Payment Analytics] Purchase event tracking did not complete",
      expect.objectContaining({
        transaction_id: "cs_test_123",
        event_id: "event-1",
        outcome: "failure",
        ga4_status: "skipped",
        ga4_reason: "invalid_or_missing_client_id",
      })
    );
  });

  test("GA4送信がfailedの場合はsuccess logを出さない", async () => {
    (ga4Server.sendEvent as jest.Mock).mockResolvedValue({
      status: "failed",
      code: "GA4_API_ERROR",
      error: "HTTP 400: Bad Request",
    });

    await service.trackPurchaseCompletion(validParams);

    expect(logger.info).not.toHaveBeenCalledWith(
      "[Payment Analytics] Purchase event submitted to GA4 endpoint",
      expect.any(Object)
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "[Payment Analytics] Purchase event tracking did not complete",
      expect.objectContaining({
        transaction_id: "cs_test_123",
        event_id: "event-1",
        outcome: "failure",
        ga4_status: "failed",
        ga4_error_code: "GA4_API_ERROR",
        ga4_error: "HTTP 400: Bad Request",
      })
    );
  });
});
