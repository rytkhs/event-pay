/**
 * Test environment setup verification
 * このテストはテスト環境が正しく構築されていることを確認します
 */

import {
  mockUser,
  mockEvent,
  createMockUser,
  createMockSupabaseResponse,
} from "./utils/test-helpers.util";

describe("Test Environment Setup", () => {
  describe("Jest Configuration", () => {
    it("should have access to global test utilities", () => {
      expect(global.testUtils).toBeDefined();
      expect(global.testUtils.mockUser).toBeDefined();
      expect(global.testUtils.mockEvent).toBeDefined();
      expect(global.testUtils.resetAllMocks).toBeDefined();
    });

    it("should clear mocks between tests", () => {
      const mockFn = jest.fn();
      mockFn("test");
      expect(mockFn).toHaveBeenCalledWith("test");

      // This should be cleared by beforeEach
      jest.clearAllMocks();
      expect(mockFn).not.toHaveBeenCalled();
    });
  });

  describe("Test Helpers", () => {
    it("should provide mock data factories", () => {
      expect(mockUser).toBeDefined();
      expect(mockUser.id).toBe("test-user-id");
      expect(mockUser.email).toBe("test@example.com");
    });

    it("should create custom mock data", () => {
      const customUser = createMockUser({
        email: "custom@example.com",
        user_metadata: { full_name: "Custom User" },
      });

      expect(customUser.email).toBe("custom@example.com");
      expect(customUser.user_metadata.full_name).toBe("Custom User");
      expect(customUser.id).toBe(mockUser.id); // Other fields should remain
    });

    it("should create mock Supabase responses", () => {
      const response = createMockSupabaseResponse({ id: "123" }, null);
      expect(response).toEqual({
        data: { id: "123" },
        error: null,
      });

      const errorResponse = createMockSupabaseResponse(null, { message: "Error" });
      expect(errorResponse).toEqual({
        data: null,
        error: { message: "Error" },
      });
    });
  });

  describe("External Service Mocks", () => {
    it("should mock Supabase client", async () => {
      const { createServerClient } = await import("@supabase/ssr");
      const supabase = createServerClient("https://test.supabase.co", "test-key", {
        cookies: {
          get: () => undefined,
          set: () => {},
          remove: () => {},
        },
      });

      expect(createServerClient).toHaveBeenCalled();
      expect(supabase.auth.getUser).toBeDefined();
      expect(supabase.from).toBeDefined();
    });

    it("should mock Stripe", async () => {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe("test_key");

      expect(stripe.paymentIntents.create).toBeDefined();
      expect(stripe.customers.create).toBeDefined();
    });

    it("should mock Resend", async () => {
      const { Resend } = await import("resend");
      const resend = new Resend("test_key");

      expect(resend.emails.send).toBeDefined();
    });

    it("should mock Upstash Redis", async () => {
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({ url: "test", token: "test" });

      expect(redis.get).toBeDefined();
      expect(redis.set).toBeDefined();
    });

    it("should mock Upstash Rate Limit", async () => {
      const { Ratelimit } = await import("@upstash/ratelimit");
      const ratelimit = new Ratelimit({
        redis: {} as any,
        limiter: {} as any,
      });

      expect(ratelimit.limit).toBeDefined();
    });
  });

  describe("Next.js Mocks", () => {
    it("should mock next/headers", async () => {
      const { cookies, headers } = await import("next/headers");

      const cookieStore = cookies();
      expect(cookieStore.get).toBeDefined();
      expect(cookieStore.set).toBeDefined();

      const headerStore = headers();
      expect(headerStore.get).toBeDefined();
      expect(headerStore.set).toBeDefined();
    });

    it("should mock next/navigation", async () => {
      const { useRouter, usePathname } = await import("next/navigation");

      expect(useRouter).toBeDefined();
      expect(usePathname).toBeDefined();
    });
  });
});
