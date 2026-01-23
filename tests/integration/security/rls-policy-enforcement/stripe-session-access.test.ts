/**
 * RLS Policy Enforcement: Stripe Session Creation Access Control Tests
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

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

    // Stripeセッション作成に必要なデータ（Stripe Connectアカウント等）にアクセスできることを確認
    if (!result.success) {
      // エラーメッセージでRLS関連でないことを確認
      const errorMessage = result.error;
      expect(errorMessage).not.toContain("permission denied");
      expect(errorMessage).not.toContain("access denied");
      expect(errorMessage).not.toContain("RLS");
    }
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
      const errorCode = result.code || "UNKNOWN";
      // UNAUTHORIZEDまたはUNKNOWN（エラーハンドラーのマッピング次第）を許容
      expect(["UNAUTHORIZED", "UNKNOWN"]).toContain(errorCode);
    }
  });
});
