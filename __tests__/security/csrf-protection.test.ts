import { NextRequest } from "next/server";
import { SecurityHandler } from "@/lib/middleware/security-handler";
import { withCSRFProtection, validateCSRFRequest } from "@/lib/middleware/csrf-protection";

describe("CSRF Protection", () => {
  describe("SecurityHandler CSRF Token", () => {
    test("generateCSRFToken creates valid token", () => {
      const token = SecurityHandler.generateCSRFToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    test("validateCSRFToken validates fresh token", () => {
      const token = SecurityHandler.generateCSRFToken();
      const isValid = SecurityHandler.validateCSRFToken(token);
      expect(isValid).toBe(true);
    });

    test("validateCSRFToken rejects invalid token", () => {
      const isValid = SecurityHandler.validateCSRFToken("invalid-token");
      expect(isValid).toBe(false);
    });

    test("validateCSRFToken rejects expired token", () => {
      // 過去のタイムスタンプで古いトークンを作成
      const oldTimestamp = Date.now() - 60 * 60 * 1000; // 1時間前
      const oldToken = Buffer.from(`${oldTimestamp}-${Math.random()}`).toString("base64");
      const isValid = SecurityHandler.validateCSRFToken(oldToken, 30 * 60 * 1000); // 30分の有効期限
      expect(isValid).toBe(false);
    });
  });

  describe("CSRF Protection Validation", () => {
    const createMockRequest = (overrides: Partial<{
      origin: string;
      referer: string;
      xRequestedWith: string;
      csrfToken: string;
      method: string;
    }> = {}) => {
      const headers = new Headers();
      
      if (overrides.origin) headers.set("origin", overrides.origin);
      if (overrides.referer) headers.set("referer", overrides.referer);
      if (overrides.xRequestedWith) headers.set("x-requested-with", overrides.xRequestedWith);
      if (overrides.csrfToken) headers.set("x-csrf-token", overrides.csrfToken);

      return new NextRequest("http://localhost:3000/api/test", {
        method: overrides.method || "POST",
        headers,
      });
    };

    test("validates request with valid origin and XMLHttpRequest header", async () => {
      const validToken = SecurityHandler.generateCSRFToken();
      const request = createMockRequest({
        origin: "http://localhost:3000",
        xRequestedWith: "XMLHttpRequest",
        csrfToken: validToken,
      });

      const isValid = await SecurityHandler.validateCSRFProtection(request);
      expect(isValid).toBe(true);
    });

    test("validates request with valid referer and token", async () => {
      const validToken = SecurityHandler.generateCSRFToken();
      const request = createMockRequest({
        referer: "http://localhost:3000/auth/login",
        csrfToken: validToken,
      });

      const isValid = await SecurityHandler.validateCSRFProtection(request);
      expect(isValid).toBe(true);
    });

    test("rejects request with no protection headers", async () => {
      const request = createMockRequest({});
      const isValid = await SecurityHandler.validateCSRFProtection(request);
      expect(isValid).toBe(false);
    });

    test("rejects request with invalid origin", async () => {
      const request = createMockRequest({
        origin: "http://evil.com",
        xRequestedWith: "XMLHttpRequest",
      });

      const isValid = await SecurityHandler.validateCSRFProtection(request);
      expect(isValid).toBe(false);
    });

    test("rejects request with invalid token", async () => {
      const request = createMockRequest({
        origin: "http://localhost:3000",
        xRequestedWith: "XMLHttpRequest",
        csrfToken: "invalid-token",
      });

      const isValid = await SecurityHandler.validateCSRFProtection(request);
      expect(isValid).toBe(false);
    });
  });

  describe("withCSRFProtection Middleware", () => {
    const mockHandler = jest.fn();

    beforeEach(() => {
      mockHandler.mockClear();
    });

    test("allows GET requests without CSRF check", async () => {
      const request = new NextRequest("http://localhost:3000/api/test", {
        method: "GET",
      });

      await withCSRFProtection(request, mockHandler);
      expect(mockHandler).toHaveBeenCalledWith(request);
    });

    test("blocks POST request without valid CSRF protection", async () => {
      const request = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      const response = await withCSRFProtection(request, mockHandler);
      expect(mockHandler).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      
      const responseData = await response.json();
      expect(responseData.error).toBe("CSRF validation failed");
    });

    test("allows POST request with valid CSRF protection", async () => {
      const validToken = SecurityHandler.generateCSRFToken();
      const headers = new Headers();
      headers.set("origin", "http://localhost:3000");
      headers.set("x-requested-with", "XMLHttpRequest");
      headers.set("x-csrf-token", validToken);
      headers.set("content-type", "application/json");

      const request = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers,
      });

      await withCSRFProtection(request, mockHandler);
      expect(mockHandler).toHaveBeenCalledWith(request);
    });
  });

  describe("validateCSRFRequest helper", () => {
    test("validates request correctly", async () => {
      const validToken = SecurityHandler.generateCSRFToken();
      const headers = new Headers();
      headers.set("origin", "http://localhost:3000");
      headers.set("x-csrf-token", validToken);

      const request = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers,
      });

      const isValid = await validateCSRFRequest(request);
      expect(isValid).toBe(true);
    });

    test("rejects invalid request", async () => {
      const request = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
      });

      const isValid = await validateCSRFRequest(request);
      expect(isValid).toBe(false);
    });
  });
});