/**
 * Stripe Connect Port Interface
 * Core層からStripe Connect機能にアクセスするためのポートインターフェース
 */

import type { StripeAccountStatus } from "@core/types/statuses";

// Stripe Account Status Type
export type StripeAccountStatusLike = StripeAccountStatus | "unknown";

export interface StripeConnectPort {
  // webhook処理で必要なメソッド群
  getConnectAccountByUser(userId: string): Promise<{ status: StripeAccountStatusLike } | null>;

  getAccountInfo(accountId: string): Promise<{
    status: StripeAccountStatusLike;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    requirements?: {
      disabled_reason?: string;
      currently_due?: string[];
      past_due?: string[];
    };
    classificationMetadata?: {
      gate: 1 | 2 | 3 | 4 | 5;
      details_submitted: boolean;
      payouts_enabled: boolean;
      transfers_active: boolean;
      card_payments_active: boolean;
      has_due_requirements: boolean;
      disabled_reason?: string;
    };
  }>;

  updateAccountStatus(input: {
    userId: string;
    status: StripeAccountStatus;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    stripeAccountId?: string;
    classificationMetadata?: {
      gate: 1 | 2 | 3 | 4 | 5;
      details_submitted: boolean;
      payouts_enabled: boolean;
      transfers_active: boolean;
      card_payments_active: boolean;
      has_due_requirements: boolean;
      disabled_reason?: string;
    };
    trigger?: "webhook" | "ondemand" | "manual";
  }): Promise<void>;
}

// Port Registration System
let stripeConnectPort: StripeConnectPort | null = null;

export function registerStripeConnectPort(impl: StripeConnectPort): void {
  stripeConnectPort = impl;
}

export function getStripeConnectPort(): StripeConnectPort {
  if (!stripeConnectPort) {
    throw new Error(
      "StripeConnectPort not registered. Please register stripe-connect adapters first."
    );
  }
  return stripeConnectPort;
}

export function isStripeConnectPortRegistered(): boolean {
  return stripeConnectPort !== null;
}
