import Stripe from "stripe";
import { StripeWebhookSignatureVerifier } from "@/lib/services/webhook/webhook-signature-verifier";
import type { SecurityReporter } from "@/lib/security/security-reporter.types";

// Stripeのモック
const mockStripe = {
  webhooks: {
    constructEvent: jest.fn(),
  },
} as unknown as Stripe;

// SecurityReporterのモック
const mockSecurityReporter = {
  logSuspiciousActivity: jest.fn(),
  logSecurityEvent: jest.fn(),
} as unknown as SecurityReporter;

describe("StripeWebhookSignatureVerifier", () => {
  let verifier: StripeWebhookSignatureVerifier;
  const webhookSecret = "whsec_test_secret";

  beforeEach(() => {
    verifier = new StripeWebhookSignatureVerifier(mockStripe, webhookSecret, mockSecurityReporter);
    jest.clearAllMocks();
  });

  describe("verifySignature", () => {
    const validPayload = JSON.stringify({ id: "evt_test", type: "payment_intent.succeeded" });
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const buildSignature = (ts: number, variant: "valid" | "invalid" = "valid") =>
      variant === "valid" ? `t=${ts},v1=test_signature` : `t=${ts},v1=invalid_signature`;

    it("有効な署名とタイムスタンプで検証が成功する", async () => {
      const mockEvent = {
        id: "evt_test",
        type: "payment_intent.succeeded",
        data: { object: {} },
      } as Stripe.Event;

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature: buildSignature(currentTimestamp, "valid"),
        fallbackTimestamp: currentTimestamp,
      });

      expect(result.isValid).toBe(true);
      expect(result.event).toEqual(mockEvent);
      expect(result.error).toBeUndefined();
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_signature_verified",
        details: {
          eventType: "payment_intent.succeeded",
          eventId: "evt_test",
          timestamp: currentTimestamp,
        },
      });
    });

    it("古いタイムスタンプで検証が失敗する", async () => {
      const oldTimestamp = currentTimestamp - 400; // 6分40秒前

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature: buildSignature(oldTimestamp, "valid"),
        fallbackTimestamp: oldTimestamp,
      });

      expect(result.isValid).toBe(false);
      expect(result.event).toBeUndefined();
      expect(result.error).toBe("Webhook timestamp is too old");
      expect(mockSecurityReporter.logSuspiciousActivity).toHaveBeenCalledWith({
        type: "webhook_timestamp_invalid",
        details: {
          timestamp: oldTimestamp,
          currentTime: expect.any(Number),
          age: expect.any(Number),
          maxAge: 300,
        },
      });
    });

    it("無効な署名で検証が失敗する", async () => {
      const error = new Error("Invalid signature");
      (mockStripe.webhooks.constructEvent as jest.Mock).mockImplementation(() => {
        throw error;
      });

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature: buildSignature(currentTimestamp, "invalid"),
        fallbackTimestamp: currentTimestamp,
      });

      expect(result.isValid).toBe(false);
      expect(result.event).toBeUndefined();
      expect(result.error).toBe("Invalid signature");
      expect(mockSecurityReporter.logSuspiciousActivity).toHaveBeenCalledWith({
        type: "webhook_signature_invalid",
        details: {
          error: "Invalid signature",
          timestamp: currentTimestamp,
          signatureProvided: true,
        },
      });
    });

    it("署名が提供されていない場合の処理", async () => {
      const result = await verifier.verifySignature({
        payload: validPayload,
        signature: "",
        fallbackTimestamp: currentTimestamp,
      });

      expect(result.isValid).toBe(false);
      expect(mockSecurityReporter.logSuspiciousActivity).toHaveBeenCalledWith({
        type: "webhook_signature_invalid",
        details: {
          error: "Missing timestamp in Stripe-Signature",
          signatureProvided: false,
          providedTimestamp: currentTimestamp,
        },
      });
    });

    it("未来のタイムスタンプでも適切に処理される", async () => {
      const futureTimestamp = currentTimestamp + 100; // 1分40秒後
      const mockEvent = {
        id: "evt_test",
        type: "payment_intent.succeeded",
      } as Stripe.Event;

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature: buildSignature(futureTimestamp, "valid"),
        fallbackTimestamp: futureTimestamp,
      });

      expect(result.isValid).toBe(true);
      expect(result.event).toEqual(mockEvent);
    });

    it("タイムスタンプが境界値（5分ちょうど）の場合", async () => {
      const boundaryTimestamp = currentTimestamp - 300; // ちょうど5分前
      const mockEvent = {
        id: "evt_test",
        type: "payment_intent.succeeded",
      } as Stripe.Event;

      (mockStripe.webhooks.constructEvent as jest.Mock).mockReturnValue(mockEvent);

      const result = await verifier.verifySignature({
        payload: validPayload,
        signature: buildSignature(boundaryTimestamp, "valid"),
        fallbackTimestamp: boundaryTimestamp,
      });

      expect(result.isValid).toBe(true);
      expect(result.event).toEqual(mockEvent);
    });
  });
});
