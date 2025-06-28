/**
 * @file 実際のAPI統合テスト - ユーザー登録
 * @description 実際の /api/auth/register エンドポイントをテスト
 */

import { POST } from "@/app/api/auth/register/route";
import { NextRequest } from "next/server";

// テストリクエスト作成ヘルパー
const createTestRequest = (body: any, headers: Record<string, string> = {}) => {
  return new NextRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `192.168.1.${Math.floor(Math.random() * 255)}`, // ランダムIP
      ...headers,
    },
    body: JSON.stringify(body),
  });
};

describe("実際のAPI統合テスト - /api/auth/register", () => {
  describe("レート制限テスト", () => {
    test("連続5回で制限、6回目で429エラー", async () => {
      const testIP = `192.168.100.${Date.now() % 255}`; // ユニークなIPを生成

      // 5回連続実行
      for (let i = 0; i < 6; i++) {
        const testData = {
          name: "レート制限テストユーザー",
          email: `ratetest-${Date.now()}-${i}@example.com`, // 毎回ユニークなメール
          password: "SecurePass123!",
        };

        const request = createTestRequest(testData, { "x-forwarded-for": testIP });
        const response = await POST(request);

        const responseText = await response.text();
        console.log(`Request ${i + 1}: Status ${response.status}, Body:`, responseText);

        if (i < 5) {
          // 1-5回目は成功かバリデーションエラー
          if (![200, 201, 400, 500].includes(response.status)) {
            console.log(
              `Unexpected status ${response.status} on request ${i + 1}, body:`,
              responseText
            );
          }
          expect([200, 201, 400, 500].includes(response.status)).toBe(true);
        } else {
          // 6回目はレート制限
          expect(response.status).toBe(429);
          const result = JSON.parse(responseText);
          expect(result.error).toContain("レート制限");
        }
      }
    });

    test("異なるIPは独立してカウント", async () => {
      const testData = {
        name: "IP独立テストユーザー",
        email: `iptest-${Date.now()}@example.com`,
        password: "SecurePass123!",
      };

      // IP1から1回
      const request1 = createTestRequest(testData, { "x-forwarded-for": "192.168.100.10" });
      const response1 = await POST(request1);
      expect([200, 201, 400, 500].includes(response1.status)).toBe(true);

      // IP2から1回（独立してカウント）
      const request2 = createTestRequest(testData, { "x-forwarded-for": "192.168.100.11" });
      const response2 = await POST(request2);
      expect([200, 201, 400, 500].includes(response2.status)).toBe(true);
    });
  });

  describe("バリデーションテスト", () => {
    test("無効なメールアドレスで400エラー", async () => {
      const invalidData = {
        name: "テストユーザー",
        email: "invalid-email",
        password: "SecurePass123!",
      };

      const request = createTestRequest(invalidData);
      const response = await POST(request);

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.details?.email).toBeDefined();
    });

    test("短すぎるパスワードで400エラー", async () => {
      const shortPasswordData = {
        name: "テストユーザー",
        email: "test@example.com",
        password: "123",
      };

      const request = createTestRequest(shortPasswordData);
      const response = await POST(request);

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.details?.password).toBeDefined();
    });

    test("必須フィールド欠損で400エラー", async () => {
      const incompleteData = {
        email: "test@example.com",
        // name と password が不足
      };

      const request = createTestRequest(incompleteData);
      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });
});
