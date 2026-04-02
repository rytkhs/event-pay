/**
 * RLS Policy Enforcement: Stripe Session Creation Access Control Tests
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";

import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import * as DestinationChargesModule from "@core/stripe/destination-charges";

import {
  createGuestStripeSessionAction,
  updateGuestAttendanceAction,
} from "@/app/guest/[token]/actions";

import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

describe("Stripe Session Creation Access Control", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  beforeEach(() => {
    jest.spyOn(DestinationChargesModule, "createOrRetrieveCustomer").mockResolvedValue({
      id: "cus_test_guest_rls",
      object: "customer",
    } as any);

    jest.spyOn(DestinationChargesModule, "createDestinationCheckoutSession").mockResolvedValue({
      id: "cs_test_guest_rls",
      url: "https://checkout.stripe.com/c/pay/cs_test_guest_rls",
      object: "checkout.session",
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("正しいゲストトークンでStripeセッション作成データにアクセスできる", async () => {
    // まず参加状況を「参加」に戻す
    const updateFormData = new FormData();
    updateFormData.set("guestToken", setup.testGuestToken);
    updateFormData.set("attendanceStatus", "attending");
    updateFormData.set("paymentMethod", "stripe");

    await updateGuestAttendanceAction(updateFormData);

    const input = {
      guestToken: setup.testGuestToken,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    const result = await createGuestStripeSessionAction(input);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error.userMessage);
    }

    expect(result.data.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

    const admin = await createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "verify stripe session access payment snapshot"
    );

    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("payout_profile_id, stripe_account_id, destination_account_id")
      .eq("attendance_id", setup.testAttendanceId)
      .eq("method", "stripe")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(paymentError).toBeNull();
    expect(payment?.payout_profile_id).toBe(setup.testPayoutProfileId);
    expect(payment?.stripe_account_id).toBe("acct_test_123");
    expect(payment?.destination_account_id).toBe("acct_test_123");
  });

  test("無効なゲストトークンでStripeセッション作成はできない", async () => {
    const input = {
      guestToken: "gst_invalid_token_123456789012345678",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    const result = await createGuestStripeSessionAction(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorCode = result.error.code || "UNKNOWN";
      // UNAUTHORIZEDまたはUNKNOWN（エラーハンドラーのマッピング次第）を許容
      expect(["UNAUTHORIZED", "UNKNOWN"]).toContain(errorCode);
    }
  });
});
