import { describe, expect, it } from "@jest/globals";
import Stripe from "stripe";

import {
  getRefundFromWebhookEvent,
  isRefundCreatedCompatibleEventType,
  isRefundFailedCompatibleEventType,
  isRefundUpdatedCompatibleEventType,
} from "@/features/payments/services/webhook/webhook-event-guards";

describe("webhook-event-guards", () => {
  describe("isRefundCreatedCompatibleEventType", () => {
    it("should identify refund.created event", () => {
      expect(isRefundCreatedCompatibleEventType("refund.created")).toBe(true);
    });

    it("should identify charge.refund.created event", () => {
      expect(isRefundCreatedCompatibleEventType("charge.refund.created")).toBe(true);
    });

    it("should reject non-refund-created events", () => {
      expect(isRefundCreatedCompatibleEventType("refund.updated")).toBe(false);
      expect(isRefundCreatedCompatibleEventType("refund.failed")).toBe(false);
      expect(isRefundCreatedCompatibleEventType("payment_intent.succeeded")).toBe(false);
      expect(isRefundCreatedCompatibleEventType("charge.refunded")).toBe(false);
    });
  });

  describe("isRefundUpdatedCompatibleEventType", () => {
    it("should identify refund.updated event", () => {
      expect(isRefundUpdatedCompatibleEventType("refund.updated")).toBe(true);
    });

    it("should identify charge.refund.updated event", () => {
      expect(isRefundUpdatedCompatibleEventType("charge.refund.updated")).toBe(true);
    });

    it("should reject non-refund-updated events", () => {
      expect(isRefundUpdatedCompatibleEventType("refund.created")).toBe(false);
      expect(isRefundUpdatedCompatibleEventType("refund.failed")).toBe(false);
      expect(isRefundUpdatedCompatibleEventType("payment_intent.succeeded")).toBe(false);
    });
  });

  describe("isRefundFailedCompatibleEventType", () => {
    it("should identify refund.failed event", () => {
      expect(isRefundFailedCompatibleEventType("refund.failed")).toBe(true);
    });

    it("should reject non-refund-failed events", () => {
      expect(isRefundFailedCompatibleEventType("refund.created")).toBe(false);
      expect(isRefundFailedCompatibleEventType("refund.updated")).toBe(false);
      expect(isRefundFailedCompatibleEventType("payment_intent.failed")).toBe(false);
    });
  });

  describe("getRefundFromWebhookEvent", () => {
    const createMockRefund = (id: string): Stripe.Refund => ({
      id,
      object: "refund",
      amount: 1000,
      currency: "jpy",
      balance_transaction: "bt_123",
      charge: "ch_123",
      created: 1234567890,
      metadata: {},
      status: "succeeded",
    });

    const createMockEvent = (object: unknown): Stripe.Event => ({
      id: "evt_123",
      object: "event",
      api_version: "2023-10-08",
      created: 1234567890,
      data: { object },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "refund.created",
    });

    it("should extract Refund object from valid event", () => {
      const refund = createMockRefund("re_123");
      const event = createMockEvent(refund);

      const result = getRefundFromWebhookEvent(event);

      expect(result).toEqual(refund);
    });

    it("should return null when data.object is missing", () => {
      const event = createMockEvent(undefined) as unknown as Stripe.Event;

      const result = getRefundFromWebhookEvent(event);

      expect(result).toBeNull();
    });

    it("should return null when data.object is not a refund", () => {
      const charge = {
        id: "ch_123",
        object: "charge",
      };
      const event = createMockEvent(charge);

      const result = getRefundFromWebhookEvent(event);

      expect(result).toBeNull();
    });

    it("should return null when data.object has wrong object type", () => {
      const notRefund = {
        id: "re_123",
        object: "payment_intent",
      };
      const event = createMockEvent(notRefund);

      const result = getRefundFromWebhookEvent(event);

      expect(result).toBeNull();
    });

    it("should return null when refund object has no id", () => {
      const refundWithoutId = {
        object: "refund",
        amount: 1000,
        currency: "jpy",
      };
      const event = createMockEvent(refundWithoutId);

      const result = getRefundFromWebhookEvent(event);

      expect(result).toBeNull();
    });

    it("should return null when refund object has empty string id", () => {
      const refundWithEmptyId = {
        id: "",
        object: "refund",
        amount: 1000,
        currency: "jpy",
      };
      const event = createMockEvent(refundWithEmptyId);

      const result = getRefundFromWebhookEvent(event);

      expect(result).toBeNull();
    });
  });

  describe("Type narrowing integration", () => {
    it("should narrow event type correctly for refund.created", () => {
      const eventType = "refund.created";
      if (isRefundCreatedCompatibleEventType(eventType)) {
        // TypeScript should narrow this to the union type
        // This test is primarily for type checking at compile time
        expect(eventType).toBe("refund.created");
      }
    });

    it("should narrow event type correctly for charge.refund.created", () => {
      const eventType = "charge.refund.created";
      if (isRefundCreatedCompatibleEventType(eventType)) {
        expect(eventType).toBe("charge.refund.created");
      }
    });

    it("should narrow event type correctly for refund.updated", () => {
      const eventType = "refund.updated";
      if (isRefundUpdatedCompatibleEventType(eventType)) {
        expect(eventType).toBe("refund.updated");
      }
    });

    it("should narrow event type correctly for charge.refund.updated", () => {
      const eventType = "charge.refund.updated";
      if (isRefundUpdatedCompatibleEventType(eventType)) {
        expect(eventType).toBe("charge.refund.updated");
      }
    });

    it("should narrow event type correctly for refund.failed", () => {
      const eventType = "refund.failed";
      if (isRefundFailedCompatibleEventType(eventType)) {
        expect(eventType).toBe("refund.failed");
      }
    });
  });
});
