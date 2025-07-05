import { jest } from "@jest/globals";
import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

describe("Penetration Testing Suite", () => {
  describe("Input Validation Bypass Attempts", () => {
    test("should handle unicode normalization attacks", async () => {
      const unicodePayloads = [
        "admin\u0000",
        "admin\u00A0",
        "admin\u200B",
        "admin\uFEFF",
        "admin\u180E",
      ];

      for (const payload of unicodePayloads) {
        const response = await fetch("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: payload,
            password: "test",
          }),
        });

        expect(response.status).toBe(400);
      }
    });

    test("should prevent polyglot payloads", async () => {
      const polyglotPayloads = [
        "javascript:/*--></title></style></textarea></script></xmp><svg/onload=alert(1)>",
        '"><svg/onload=alert(1)>',
        "'-alert(1)-'",
        "${alert(1)}",
        "{{alert(1)}}",
        "<%=alert(1)%>",
      ];

      for (const payload of polyglotPayloads) {
        const response = await fetch("http://localhost:3000/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: payload,
            email: "test@example.com",
            password: "SecurePass123!",
          }),
        });

        expect(response.status).toBe(400);
      }
    });

    test("should handle encoding bypass attempts", async () => {
      const encodedPayloads = [
        "%3Cscript%3Ealert(1)%3C/script%3E",
        "&lt;script&gt;alert(1)&lt;/script&gt;",
        "\\u003cscript\\u003ealert(1)\\u003c/script\\u003e",
        "\\x3cscript\\x3ealert(1)\\x3c/script\\x3e",
      ];

      for (const payload of encodedPayloads) {
        const response = await fetch("http://localhost:3000/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: payload,
            email: "test@example.com",
            password: "SecurePass123!",
          }),
        });

        expect(response.status).toBe(400);
      }
    });
  });

  describe("Authentication Bypass Attempts", () => {
    test("should prevent JWT manipulation", async () => {
      const maliciousJWTs = [
        "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.",
        "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid",
        "null",
        "",
        "undefined",
      ];

      for (const jwt of maliciousJWTs) {
        const response = await fetch("http://localhost:3000/api/protected", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        });

        expect(response.status).toBe(401);
      }
    });

    test("should prevent session fixation", async () => {
      // セッションIDを事前設定
      const fixedSessionId = "fixed-session-id";

      const response = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session=${fixedSessionId}`,
        },
        body: JSON.stringify({
          email: "test@example.com",
          password: "correct-password",
        }),
      });

      const cookies = response.headers.get("set-cookie");
      if (cookies) {
        expect(cookies).not.toContain(fixedSessionId);
      }
    });

    test("should prevent timing attacks", async () => {
      const validUser = "valid@example.com";
      const invalidUser = "invalid@example.com";

      // 複数回実行して平均時間を計測
      const validUserTimes = [];
      const invalidUserTimes = [];

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await fetch("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: validUser,
            password: "wrong-password",
          }),
        });
        validUserTimes.push(Date.now() - startTime);
      }

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await fetch("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: invalidUser,
            password: "wrong-password",
          }),
        });
        invalidUserTimes.push(Date.now() - startTime);
      }

      const avgValidTime = validUserTimes.reduce((a, b) => a + b, 0) / validUserTimes.length;
      const avgInvalidTime = invalidUserTimes.reduce((a, b) => a + b, 0) / invalidUserTimes.length;

      // 時間差が50ms以下であることを確認
      expect(Math.abs(avgValidTime - avgInvalidTime)).toBeLessThan(50);
    });
  });

  describe("Authorization Bypass Attempts", () => {
    test("should prevent horizontal privilege escalation", async () => {
      // User A がUser B のデータにアクセスしようとする
      const userAToken = "user-a-token";
      const userBId = "user-b-id";

      const response = await fetch(`http://localhost:3000/api/users/${userBId}/profile`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${userAToken}`,
        },
      });

      expect(response.status).toBe(403);
    });

    test("should prevent vertical privilege escalation", async () => {
      // 一般ユーザーが管理者機能にアクセスしようとする
      const userToken = "user-token";

      const response = await fetch("http://localhost:3000/api/admin/users", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.status).toBe(403);
    });

    test("should prevent parameter pollution", async () => {
      const response = await fetch("http://localhost:3000/api/users/search?role=user&role=admin", {
        method: "GET",
        headers: {
          Authorization: "Bearer valid-token",
        },
      });

      const data = await response.json();
      expect(data.results).not.toContain("admin");
    });
  });

  describe("Business Logic Bypass Attempts", () => {
    test("should prevent price manipulation", async () => {
      const maliciousPayments = [
        { amount: -1000, description: "Negative amount" },
        { amount: 0, description: "Zero amount" },
        { amount: 0.001, description: "Fraction amount" },
        { amount: 999999999, description: "Extremely large amount" },
      ];

      for (const payment of maliciousPayments) {
        const response = await fetch("http://localhost:3000/api/payments/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer valid-token",
          },
          body: JSON.stringify({
            eventId: "test-event",
            amount: payment.amount,
          }),
        });

        expect(response.status).toBe(400);
      }
    });

    test("should prevent race conditions", async () => {
      const eventId = "limited-event";
      const promises = [];

      // 同時に複数のリクエストを送信
      for (let i = 0; i < 10; i++) {
        promises.push(
          fetch("http://localhost:3000/api/events/attend", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer user-${i}-token`,
            },
            body: JSON.stringify({
              eventId: eventId,
            }),
          })
        );
      }

      const results = await Promise.all(promises);
      const successfulRequests = results.filter((r) => r.status === 200);

      // 定員制限が適切に機能することを確認
      expect(successfulRequests.length).toBeLessThanOrEqual(5);
    });

    test("should prevent workflow bypass", async () => {
      // 下書き状態のイベントでの支払い処理
      const response = await fetch("http://localhost:3000/api/payments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({
          eventId: "draft-event",
          amount: 1000,
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("公開");
    });
  });

  describe("Data Exfiltration Attempts", () => {
    test("should prevent sensitive data exposure", async () => {
      const response = await fetch("http://localhost:3000/api/users/profile", {
        method: "GET",
        headers: {
          Authorization: "Bearer valid-token",
        },
      });

      const data = await response.json();

      // 機密データが含まれていないことを確認
      expect(data).not.toHaveProperty("password");
      expect(data).not.toHaveProperty("password_hash");
      expect(data).not.toHaveProperty("salt");
      expect(data).not.toHaveProperty("internal_id");
    });

    test("should prevent information disclosure through errors", async () => {
      const response = await fetch("http://localhost:3000/api/users/nonexistent", {
        method: "GET",
        headers: {
          Authorization: "Bearer valid-token",
        },
      });

      expect(response.status).toBe(404);
      const data = await response.json();

      // 詳細なエラー情報が含まれていないことを確認
      expect(data.error).not.toContain("database");
      expect(data.error).not.toContain("sql");
      expect(data.error).not.toContain("table");
      expect(data.error).not.toContain("column");
    });

    test("should prevent mass assignment", async () => {
      const response = await fetch("http://localhost:3000/api/users/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({
          name: "Updated Name",
          email: "updated@example.com",
          role: "admin", // 変更すべきでないフィールド
          is_verified: true, // 変更すべきでないフィールド
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // 許可されていないフィールドが更新されていないことを確認
      expect(data.role).not.toBe("admin");
      expect(data.is_verified).not.toBe(true);
    });
  });

  describe("Denial of Service Attempts", () => {
    test("should handle large payloads", async () => {
      const largePayload = "a".repeat(10 * 1024 * 1024); // 10MB

      const response = await fetch("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: largePayload,
          email: "test@example.com",
          password: "SecurePass123!",
        }),
      });

      expect(response.status).toBe(413);
    });

    test("should handle nested JSON attacks", async () => {
      // 深くネストされたJSONオブジェクト
      let nestedObject = {};
      let current = nestedObject;

      for (let i = 0; i < 1000; i++) {
        current.nested = {};
        current = current.nested;
      }

      const response = await fetch("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test",
          email: "test@example.com",
          password: "SecurePass123!",
          metadata: nestedObject,
        }),
      });

      expect(response.status).toBe(400);
    });

    test("should handle rapid request attempts", async () => {
      const promises = [];

      // 短時間で大量のリクエストを送信
      for (let i = 0; i < 100; i++) {
        promises.push(
          fetch("http://localhost:3000/api/auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: "test@example.com",
              password: "wrong-password",
            }),
          })
        );
      }

      const results = await Promise.all(promises);
      const rateLimitedRequests = results.filter((r) => r.status === 429);

      // レート制限が適切に機能することを確認
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });
  });

  describe("Advanced Evasion Techniques", () => {
    test("should handle HTTP method override", async () => {
      const response = await fetch("http://localhost:3000/api/users/123", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-HTTP-Method-Override": "DELETE",
        },
        body: JSON.stringify({}),
      });

      // メソッドオーバーライドが無効化されていることを確認
      expect(response.status).toBe(405);
    });

    test("should handle content-type confusion", async () => {
      const response = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password",
        }),
      });

      expect(response.status).toBe(400);
    });

    test("should handle host header injection", async () => {
      const response = await fetch("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Host: "evil.com",
        },
        body: JSON.stringify({
          email: "test@example.com",
        }),
      });

      // リセットリンクが悪意のあるホストを含まないことを確認
      expect(response.status).toBe(400);
    });
  });

  describe("Cryptographic Attacks", () => {
    test("should prevent weak session tokens", async () => {
      const loginResponse = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "test@example.com",
          password: "correct-password",
        }),
      });

      const cookies = loginResponse.headers.get("set-cookie");
      if (cookies) {
        const sessionToken = cookies.match(/session=([^;]+)/)?.[1];

        if (sessionToken) {
          // セッショントークンが十分にランダムであることを確認
          expect(sessionToken.length).toBeGreaterThan(32);
          expect(sessionToken).toMatch(/^[a-zA-Z0-9+/=]+$/);
        }
      }
    });

    test("should prevent hash collision attacks", async () => {
      const collisionInputs = ["MD5 collision input 1", "MD5 collision input 2"];

      for (const input of collisionInputs) {
        const response = await fetch("http://localhost:3000/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: input,
          }),
        });

        expect(response.status).toBe(400);
      }
    });
  });
});
