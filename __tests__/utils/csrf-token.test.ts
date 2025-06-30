/**
 * @jest-environment jsdom
 */
import { CSRFTokenManager } from "@/lib/utils/csrf-token";

// fetchのモック
global.fetch = jest.fn();

describe("CSRFTokenManager", () => {
  beforeEach(() => {
    document.cookie = "";
    jest.spyOn(window.location, 'reload').mockImplementation(() => {});
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getToken", () => {
    test("returns null when no csrf token in cookies", () => {
      document.cookie = "other=value";
      const token = CSRFTokenManager.getToken();
      expect(token).toBeNull();
    });

    test("extracts csrf token from cookies", () => {
      document.cookie = "csrf-token=test-token-123; other=value";
      const token = CSRFTokenManager.getToken();
      expect(token).toBe("test-token-123");
    });

    test("handles multiple cookies correctly", () => {
      document.cookie = "first=one; csrf-token=my-token; last=end";
      const token = CSRFTokenManager.getToken();
      expect(token).toBe("my-token");
    });
  });

  describe("hasToken", () => {
    test("returns false when no token", () => {
      document.cookie = "";
      expect(CSRFTokenManager.hasToken()).toBe(false);
    });

    test("returns true when token exists", () => {
      document.cookie = "csrf-token=test-token";
      expect(CSRFTokenManager.hasToken()).toBe(true);
    });
  });

  describe("getHeaders", () => {
    test("includes basic headers without token", () => {
      document.cookie = "";
      const headers = CSRFTokenManager.getHeaders();
      
      expect(headers).toEqual({
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      });
    });

    test("includes CSRF token in headers when available", () => {
      document.cookie = "csrf-token=my-csrf-token";
      const headers = CSRFTokenManager.getHeaders();
      
      expect(headers).toEqual({
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": "my-csrf-token",
      });
    });
  });

  describe("validateBeforeCall", () => {
    test("returns true when token exists", () => {
      document.cookie = "csrf-token=test-token";
      const reloadSpy = jest.spyOn(window.location, 'reload');
      const isValid = CSRFTokenManager.validateBeforeCall();
      expect(isValid).toBe(true);
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    test("reloads page and returns false when no token", () => {
      document.cookie = "";
      const reloadSpy = jest.spyOn(window.location, 'reload');
      const isValid = CSRFTokenManager.validateBeforeCall();
      expect(isValid).toBe(false);
      expect(reloadSpy).toHaveBeenCalled();
    });
  });

  describe("safeFetch", () => {
    test("calls fetch with CSRF headers", async () => {
      document.cookie = "csrf-token=test-token";
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      await CSRFTokenManager.safeFetch("/api/test", {
        method: "POST",
        body: JSON.stringify({ data: "test" }),
      });

      expect(global.fetch).toHaveBeenCalledWith("/api/test", {
        method: "POST",
        body: JSON.stringify({ data: "test" }),
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-Token": "test-token",
        },
      });
    });

    test("handles CSRF validation failure response", async () => {
      document.cookie = "csrf-token=test-token";
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "CSRF validation failed" }),
      });

      const reloadSpy = jest.spyOn(window.location, 'reload');

      await expect(CSRFTokenManager.safeFetch("/api/test", { method: "POST" }))
        .rejects.toThrow("CSRF validation failed. Page reloaded for token refresh.");
      
      expect(reloadSpy).toHaveBeenCalled();
    });

    test("merges custom headers with CSRF headers", async () => {
      document.cookie = "csrf-token=test-token";
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      await CSRFTokenManager.safeFetch("/api/test", {
        method: "POST",
        headers: {
          "Custom-Header": "custom-value",
          "Authorization": "Bearer token",
        },
      });

      expect(global.fetch).toHaveBeenCalledWith("/api/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-Token": "test-token",
          "Custom-Header": "custom-value",
          "Authorization": "Bearer token",
        },
      });
    });

    test("returns response for successful requests", async () => {
      document.cookie = "csrf-token=test-token";
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const response = await CSRFTokenManager.safeFetch("/api/test");
      expect(response).toBe(mockResponse);
    });
  });
});