/**
 * Guest Session Creation: 入力検証テスト
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { createGuestStripeSessionAction } from "../../../../features/guest/actions/create-stripe-session";

import {
  setupGuestSessionCreationTest,
  setupBeforeEach,
  cleanupAfterAll,
  type GuestSessionCreationTestContext,
} from "./guest-session-creation-test-setup";

describe("入力検証", () => {
  let context: GuestSessionCreationTestContext;

  beforeAll(async () => {
    context = await setupGuestSessionCreationTest();
  });

  afterAll(async () => {
    await cleanupAfterAll(context);
  });

  beforeEach(() => {
    setupBeforeEach(context);
  });

  it("guestTokenが36文字未満の場合はVALIDATION_ERRORを返す", async () => {
    const input = {
      guestToken: "short_token", // 36文字未満
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    const result = await createGuestStripeSessionAction(input);

    expect(result).toEqual({
      success: false,
      code: "VALIDATION_ERROR",
      error: "入力データが無効です。",
      details: {
        zodErrors: expect.arrayContaining([
          expect.objectContaining({
            path: ["guestToken"],
            message: "ゲストトークンが無効です",
          }),
        ]),
      },
      correlationId: expect.any(String),
      fieldErrors: undefined,
      retryable: false,
    });
  });

  it("successUrlが無効なURL形式の場合はVALIDATION_ERRORを返す", async () => {
    const input = {
      guestToken: context.testAttendance.guest_token,
      successUrl: "invalid-url", // 無効なURL
      cancelUrl: "https://example.com/cancel",
    };

    const result = await createGuestStripeSessionAction(input);

    expect(result).toEqual({
      success: false,
      code: "VALIDATION_ERROR",
      error: "入力データが無効です。",
      details: {
        zodErrors: expect.arrayContaining([
          expect.objectContaining({
            path: ["successUrl"],
            code: "invalid_string",
            validation: "url",
          }),
        ]),
      },
      correlationId: expect.any(String),
      fieldErrors: undefined,
      retryable: false,
    });
  });

  it("cancelUrlが無効なURL形式の場合はVALIDATION_ERRORを返す", async () => {
    const input = {
      guestToken: context.testAttendance.guest_token,
      successUrl: "https://example.com/success",
      cancelUrl: "invalid-url", // 無効なURL
    };

    const result = await createGuestStripeSessionAction(input);

    expect(result).toEqual({
      success: false,
      code: "VALIDATION_ERROR",
      error: "入力データが無効です。",
      details: {
        zodErrors: expect.arrayContaining([
          expect.objectContaining({
            path: ["cancelUrl"],
            code: "invalid_string",
            validation: "url",
          }),
        ]),
      },
      correlationId: expect.any(String),
      fieldErrors: undefined,
      retryable: false,
    });
  });
});
