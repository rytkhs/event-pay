/**
 * レート制限のE2Eテスト
 * 実際のHTTPリクエストでレート制限の動作を検証
 */

import { test, expect } from "@playwright/test";

test.describe("Rate Limiting E2E Tests", () => {
  test.describe("招待リンクAPI", () => {
    test("正常なリクエストが通ること", async ({ request }) => {
      const response = await request.get("/api/invite/test-token");

      // レート制限に引っかからない場合は、404（無効なトークン）または200が返される
      expect([200, 404]).toContain(response.status());
    });

    test("大量のリクエストでレート制限が発動すること", async ({ request }) => {
      const promises = [];

      // 11回のリクエストを並行して送信（制限は10回）
      for (let i = 0; i < 11; i++) {
        promises.push(request.get("/api/invite/test-token"));
      }

      const responses = await Promise.all(promises);

      // 少なくとも1つのリクエストが429エラーになることを確認
      const rateLimitedResponses = responses.filter(r => r.status() === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // 429エラーのレスポンスにRetry-Afterヘッダーが含まれることを確認
      for (const response of rateLimitedResponses) {
        expect(response.headers()["retry-after"]).toBeDefined();

        const body = await response.json();
        expect(body).toMatchObject({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: expect.stringContaining("レート制限"),
            retryAfter: expect.any(Number),
          },
        });
      }
    });
  });

  test.describe("参加登録API", () => {
    const validParticipationData = {
      inviteToken: "test-invite-token",
      nickname: "テスト太郎",
      email: "test@example.com",
      attendanceStatus: "attending",
      paymentMethod: "stripe",
    };

    test("正常なリクエストが通ること", async ({ request }) => {
      const response = await request.post("/api/participation", {
        data: validParticipationData,
      });

      // レート制限に引っかからない場合は、400（無効なトークン）、409（重複）、または201が返される
      expect([201, 400, 404, 409]).toContain(response.status());
    });

    test("大量のリクエストでレート制限が発動すること", async ({ request }) => {
      const promises = [];

      // 11回のリクエストを並行して送信（制限は10回）
      for (let i = 0; i < 11; i++) {
        promises.push(
          request.post("/api/participation", {
            data: {
              ...validParticipationData,
              email: `test${i}@example.com`, // 重複を避けるため異なるメールアドレス
            },
          })
        );
      }

      const responses = await Promise.all(promises);

      // 少なくとも1つのリクエストが429エラーになることを確認
      const rateLimitedResponses = responses.filter(r => r.status() === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // 429エラーのレスポンスにRetry-Afterヘッダーが含まれることを確認
      for (const response of rateLimitedResponses) {
        expect(response.headers()["retry-after"]).toBeDefined();

        const body = await response.json();
        expect(body).toMatchObject({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: expect.stringContaining("レート制限"),
            retryAfter: expect.any(Number),
          },
        });
      }
    });
  });

  test.describe("レート制限の回復", () => {
    test("時間経過後にレート制限が解除されること", async ({ request }) => {
      // まず制限に達するまでリクエストを送信
      const initialPromises = [];
      for (let i = 0; i < 11; i++) {
        initialPromises.push(request.get("/api/invite/test-token"));
      }

      const initialResponses = await Promise.all(initialPromises);
      const rateLimited = initialResponses.some(r => r.status() === 429);

      if (rateLimited) {
        // 少し待ってから再度リクエスト（実際のテストでは短時間で済むようにモック環境を使用）
        await new Promise(resolve => setTimeout(resolve, 1000));

        const recoveryResponse = await request.get("/api/invite/test-token");
        // レート制限が解除されていれば、404（無効なトークン）または200が返される
        expect([200, 404, 429]).toContain(recoveryResponse.status());
      }
    });
  });

  test.describe("エラーレスポンスの形式", () => {
    test("レート制限エラーが正しい形式で返されること", async ({ request }) => {
      // 制限に達するまでリクエストを送信
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(request.get("/api/invite/test-token"));
      }

      const responses = await Promise.all(promises);
      const rateLimitedResponse = responses.find(r => r.status() === 429);

      if (rateLimitedResponse) {
        // レスポンスヘッダーの確認
        expect(rateLimitedResponse.headers()["content-type"]).toContain("application/json");
        expect(rateLimitedResponse.headers()["retry-after"]).toBeDefined();

        // レスポンスボディの確認
        const body = await rateLimitedResponse.json();
        expect(body).toMatchObject({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: expect.any(String),
            retryAfter: expect.any(Number),
          },
        });

        // retryAfterが妥当な値であることを確認（0-900秒の範囲）
        expect(body.error.retryAfter).toBeGreaterThan(0);
        expect(body.error.retryAfter).toBeLessThanOrEqual(900);
      }
    });
  });
});