/**
 * Verify Session API: レート制限テスト
 */

import { NextRequest, NextResponse } from "next/server";

import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";

// モックは他のインポートより前に宣言する必要がある
jest.mock("@core/security/security-logger");
jest.mock("@core/rate-limit");

import { POLICIES } from "@core/rate-limit";

import { GET as verifySessionHandler } from "@/app/api/payments/verify-session/route";

import {
  setupVerifySessionTest,
  setupBeforeEach,
  cleanupAfterEach,
  cleanupAfterAll,
  type VerifySessionTestContext,
} from "./verify-session-test-setup";

describe("⚡ レート制限テスト", () => {
  let context: VerifySessionTestContext;

  beforeAll(async () => {
    context = await setupVerifySessionTest();
  });

  afterAll(async () => {
    await cleanupAfterAll(context);
  });

  beforeEach(() => {
    setupBeforeEach(context);
  });

  afterEach(async () => {
    await cleanupAfterEach(context);
  });

  test("レート制限超過 → 429 Too Many Requests（仕様書準拠）", async () => {
    // レート制限を発生させる
    context.mockWithRateLimit.mockImplementation((_policy, _keyBuilder) => {
      return async (_request: NextRequest) => {
        return NextResponse.json(
          {
            type: "https://api.eventpay.app/errors/rate_limited",
            title: "Rate Limit Exceeded",
            status: 429,
            code: "RATE_LIMITED",
            detail: "リクエスト回数の上限に達しました。しばらく待ってから再試行してください",
            retryable: true,
            instance: "/api/payments/verify-session",
            correlation_id: "req_test_correlation_id",
          },
          {
            status: 429,
            headers: {
              "Content-Type": "application/problem+json",
              "Retry-After": "120",
            },
          }
        );
      };
    });

    const request = context.testHelper.createRequest({});
    const response = await verifySessionHandler(request);
    const result = await response.json();

    // 仕様書エラーレスポンス: RATE_LIMITED
    expect(response.status).toBe(429);
    expect(result).toMatchObject({
      type: "https://api.eventpay.app/errors/rate_limited",
      title: "Rate Limit Exceeded",
      status: 429,
      code: "RATE_LIMITED",
      retryable: true,
    });
    expect(response.headers.get("Retry-After")).toBe("120");
  });

  test("レート制限ポリシー確認 → stripe.checkout適用", async () => {
    const request = context.testHelper.createRequest({});
    await verifySessionHandler(request);

    // 正しいポリシーでレート制限チェック
    expect(context.mockWithRateLimit).toHaveBeenCalledWith(
      POLICIES["stripe.checkout"],
      expect.any(Function)
    );
  });
});
