/**
 * Payment Events System
 * Webhook処理での境界違反を解消するためのEvent-Driven Architecture
 */

import { handleServerError } from "@core/utils/error-handler";

// Event Types
export interface PaymentWebhookEvent {
  type: "payment.completed" | "payment.failed" | "payment.refunded";
  paymentId: string;
  paymentIntentId: string;
  amount: number;
  attendanceId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface StripeAccountEvent {
  type: "account.updated" | "account.restricted" | "account.enabled";
  accountId: string;
  status: string;
  timestamp: string;
  eventData?: Record<string, unknown>;
}

// Event Handler Types
export type PaymentEventHandler = (event: PaymentWebhookEvent) => Promise<void>;
export type StripeAccountEventHandler = (event: StripeAccountEvent) => Promise<void>;

// Event Registry
class EventRegistry {
  private paymentHandlers: PaymentEventHandler[] = [];
  private accountHandlers: StripeAccountEventHandler[] = [];

  // Payment Event Registration
  onPaymentEvent(handler: PaymentEventHandler): void {
    this.paymentHandlers.push(handler);
  }

  // Account Event Registration
  onStripeAccountEvent(handler: StripeAccountEventHandler): void {
    this.accountHandlers.push(handler);
  }

  // Event Emission
  async emitPaymentEvent(event: PaymentWebhookEvent): Promise<void> {
    const results = await Promise.allSettled(this.paymentHandlers.map((handler) => handler(event)));

    // Log failures but don't throw (fail-soft approach)
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        handleServerError("EVENT_DISPATCH_ERROR", {
          category: "payment",
          action: "event_dispatch",
          actorType: "system",
          additionalData: {
            handler_index: index,
            event_type: event.type,
            payment_id: event.paymentId,
            error_reason: String(result.reason),
          },
        });
      }
    });
  }

  async emitStripeAccountEvent(event: StripeAccountEvent): Promise<void> {
    const results = await Promise.allSettled(this.accountHandlers.map((handler) => handler(event)));

    // Log failures but don't throw (fail-soft approach)
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        handleServerError("EVENT_DISPATCH_ERROR", {
          category: "stripe_connect",
          action: "event_dispatch",
          actorType: "system",
          additionalData: {
            handler_index: index,
            event_type: event.type,
            account_id: event.accountId,
            error_reason: String(result.reason),
          },
        });
      }
    });
  }

  // For testing/cleanup
  clear(): void {
    this.paymentHandlers = [];
    this.accountHandlers = [];
  }
}

// Singleton instance
let eventRegistry: EventRegistry | null = null;

export function getEventRegistry(): EventRegistry {
  if (!eventRegistry) {
    eventRegistry = new EventRegistry();
  }
  return eventRegistry;
}

// Convenience functions for emitting events
export function emitPaymentCompleted(data: {
  paymentId: string;
  paymentIntentId: string;
  amount: number;
  attendanceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return getEventRegistry().emitPaymentEvent({
    type: "payment.completed",
    timestamp: new Date().toISOString(),
    ...data,
  });
}

export function emitPaymentFailed(data: {
  paymentId: string;
  paymentIntentId: string;
  amount: number;
  attendanceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return getEventRegistry().emitPaymentEvent({
    type: "payment.failed",
    timestamp: new Date().toISOString(),
    ...data,
  });
}

export function emitStripeAccountUpdated(data: {
  accountId: string;
  status: string;
  eventData?: Record<string, unknown>;
}): Promise<void> {
  return getEventRegistry().emitStripeAccountEvent({
    type: "account.updated",
    timestamp: new Date().toISOString(),
    ...data,
  });
}
