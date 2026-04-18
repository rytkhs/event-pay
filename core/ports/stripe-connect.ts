/**
 * Stripe Connect Port Interface
 * Core層からStripe Connect機能にアクセスするためのポートインターフェース
 */

import type { StripeAccountStatus } from "@core/types/statuses";

// Stripe Account Status Type
export type StripeAccountStatusLike = StripeAccountStatus | "unknown";

export type StripeConnectReviewState = "none" | "pending_review" | "under_review";

export interface StripeConnectRequirementsStateSummary {
  currently_due: string[];
  past_due: string[];
  eventually_due: string[];
  pending_verification: string[];
  disabled_reason?: string;
  current_deadline?: number | null;
}

export interface StripeConnectRequirementsSummary {
  account: StripeConnectRequirementsStateSummary;
  transfers: StripeConnectRequirementsStateSummary;
  review_state: StripeConnectReviewState;
}

export interface StripeConnectClassificationMetadata {
  gate: 1 | 2 | 3 | 4 | 5;
  details_submitted: boolean;
  payouts_enabled: boolean;
  collection_ready: boolean;
  transfers_active: boolean;
  transfers_status?: string;
  has_currently_due_requirements: boolean;
  has_past_due_requirements: boolean;
  has_eventually_due_requirements: boolean;
  has_pending_verification: boolean;
  has_due_requirements: boolean;
  review_state: StripeConnectReviewState;
  disabled_reason?: string;
}

export interface StripeConnectPort {
  // webhook処理で必要なメソッド群
  getConnectAccountByUser(userId: string): Promise<{ status: StripeAccountStatusLike } | null>;

  getAccountInfo(accountId: string): Promise<{
    status: StripeAccountStatusLike;
    collectionReady: boolean;
    payoutsEnabled: boolean;
    transfersStatus?: string;
    requirementsDisabledReason?: string;
    requirementsSummary: StripeConnectRequirementsSummary;
    requirements?: {
      disabled_reason?: string;
      currently_due?: string[];
      past_due?: string[];
    };
    classificationMetadata?: StripeConnectClassificationMetadata;
  }>;

  updateAccountStatus(input: {
    userId?: string;
    payoutProfileId?: string;
    status: StripeAccountStatus;
    payoutsEnabled: boolean;
    stripeAccountId?: string;
    classificationMetadata?: StripeConnectClassificationMetadata;
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
