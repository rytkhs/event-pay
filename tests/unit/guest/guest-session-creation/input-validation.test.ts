/**
 * Guest Session Creation: 入力検証テスト
 */

import { describe, it, expect } from "@jest/globals";

import { createGuestStripeSessionAction } from "../../../../features/guest/actions/create-stripe-session";

describe("入力検証", () => {
  const validGuestToken = "gst_12345678901234567890123456789012";

  it("guestTokenが36文字未満の場合はVALIDATION_ERRORを返す", async () => {
    const input = {
      guestToken: "short_token", // 36文字未満
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    const result = await createGuestStripeSessionAction(input);

    expect(result).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        userMessage: "入力データが無効です。",
        details: undefined,
        correlationId: expect.any(String),
        fieldErrors: {
          guestToken: ["ゲストトークンが無効です"],
        },
        retryable: false,
      },
      needsVerification: undefined,
      redirectUrl: undefined,
    });
  });

  it("successUrlが無効なURL形式の場合はVALIDATION_ERRORを返す", async () => {
    const input = {
      guestToken: validGuestToken,
      successUrl: "invalid-url", // 無効なURL
      cancelUrl: "https://example.com/cancel",
    };

    const result = await createGuestStripeSessionAction(input);

    expect(result).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        userMessage: "入力データが無効です。",
        details: undefined,
        correlationId: expect.any(String),
        fieldErrors: {
          successUrl: expect.arrayContaining([expect.any(String)]),
        },
        retryable: false,
      },
      needsVerification: undefined,
      redirectUrl: undefined,
    });
  });

  it("cancelUrlが無効なURL形式の場合はVALIDATION_ERRORを返す", async () => {
    const input = {
      guestToken: validGuestToken,
      successUrl: "https://example.com/success",
      cancelUrl: "invalid-url", // 無効なURL
    };

    const result = await createGuestStripeSessionAction(input);

    expect(result).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        userMessage: "入力データが無効です。",
        details: undefined,
        correlationId: expect.any(String),
        fieldErrors: {
          cancelUrl: expect.arrayContaining([expect.any(String)]),
        },
        retryable: false,
      },
      needsVerification: undefined,
      redirectUrl: undefined,
    });
  });
});
