/**
 * 監査ログ記録のテスト
 *
 * @module tests/unit/stripe-connect/audit-logger.test
 */

import { logStatusChange } from "@features/stripe-connect/server";
import type { StatusChangeLog } from "@features/stripe-connect/server";

// system-loggerのモック
jest.mock("@core/logging/system-logger", () => ({
  logToSystemLogs: jest.fn(),
}));

import { logToSystemLogs } from "@core/logging/system-logger";

describe("logStatusChange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should log status change with all metadata", async () => {
    const log: StatusChangeLog = {
      timestamp: "2024-01-01T00:00:00.000Z",
      user_id: "user-123",
      stripe_account_id: "acct_123",
      previous_status: "onboarding",
      new_status: "verified",
      trigger: "webhook",
      classification_metadata: {
        gate: 5,
        details_submitted: true,
        payouts_enabled: true,
        transfers_active: true,
        card_payments_active: true,
        has_due_requirements: false,
      },
    };

    await logStatusChange(log);

    expect(logToSystemLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        log_category: "stripe_connect",
        action: "connect.status_change",
        message: "Stripe Connect account status changed from onboarding to verified",
        actor_type: "webhook",
        user_id: "user-123",
        resource_type: "stripe_connect_account",
        resource_id: "acct_123",
        outcome: "success",
        metadata: expect.objectContaining({
          previous_status: "onboarding",
          new_status: "verified",
          trigger: "webhook",
          classification_metadata: expect.objectContaining({
            gate: 5,
            details_submitted: true,
            payouts_enabled: true,
            transfers_active: true,
            card_payments_active: true,
            has_due_requirements: false,
          }),
        }),
        dedupe_key: "status_change:user-123:onboarding:verified:2024-01-01T00:00:00.000Z",
      }),
      expect.objectContaining({
        alsoLogToPino: true,
        throwOnError: false,
      })
    );
  });

  it("should log initial status with null previous_status", async () => {
    const log: StatusChangeLog = {
      timestamp: "2024-01-01T00:00:00.000Z",
      user_id: "user-123",
      stripe_account_id: "acct_123",
      previous_status: null,
      new_status: "unverified",
      trigger: "manual",
      classification_metadata: {
        gate: 5,
        details_submitted: false,
        payouts_enabled: false,
        transfers_active: false,
        card_payments_active: false,
        has_due_requirements: false,
      },
    };

    await logStatusChange(log);

    expect(logToSystemLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Stripe Connect account status initialized to unverified",
        actor_type: "user",
        metadata: expect.objectContaining({
          previous_status: null,
          new_status: "unverified",
        }),
      }),
      expect.any(Object)
    );
  });

  it("should use correct actor_type for ondemand trigger", async () => {
    const log: StatusChangeLog = {
      timestamp: "2024-01-01T00:00:00.000Z",
      user_id: "user-123",
      stripe_account_id: "acct_123",
      previous_status: "unverified",
      new_status: "onboarding",
      trigger: "ondemand",
      classification_metadata: {
        gate: 3,
        details_submitted: true,
        payouts_enabled: false,
        transfers_active: false,
        card_payments_active: false,
        has_due_requirements: true,
      },
    };

    await logStatusChange(log);

    expect(logToSystemLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_type: "user",
        metadata: expect.objectContaining({
          trigger: "ondemand",
        }),
      }),
      expect.any(Object)
    );
  });

  it("should include disabled_reason in metadata when present", async () => {
    const log: StatusChangeLog = {
      timestamp: "2024-01-01T00:00:00.000Z",
      user_id: "user-123",
      stripe_account_id: "acct_123",
      previous_status: "verified",
      new_status: "restricted",
      trigger: "webhook",
      classification_metadata: {
        gate: 1,
        details_submitted: true,
        payouts_enabled: true,
        transfers_active: true,
        card_payments_active: true,
        has_due_requirements: false,
        disabled_reason: "platform_paused",
      },
    };

    await logStatusChange(log);

    expect(logToSystemLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          classification_metadata: expect.objectContaining({
            disabled_reason: "platform_paused",
          }),
        }),
      }),
      expect.any(Object)
    );
  });

  it("should generate unique dedupe_key for each status change", async () => {
    const log1: StatusChangeLog = {
      timestamp: "2024-01-01T00:00:00.000Z",
      user_id: "user-123",
      stripe_account_id: "acct_123",
      previous_status: "unverified",
      new_status: "onboarding",
      trigger: "webhook",
      classification_metadata: {
        gate: 3,
        details_submitted: true,
        payouts_enabled: false,
        transfers_active: false,
        card_payments_active: false,
        has_due_requirements: true,
      },
    };

    const log2: StatusChangeLog = {
      ...log1,
      timestamp: "2024-01-01T00:00:01.000Z", // 異なるタイムスタンプ
    };

    await logStatusChange(log1);
    await logStatusChange(log2);

    const calls = (logToSystemLogs as jest.Mock).mock.calls;
    expect(calls[0][0].dedupe_key).not.toBe(calls[1][0].dedupe_key);
  });
});
