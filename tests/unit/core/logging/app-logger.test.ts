import { createClient } from "@supabase/supabase-js";

import { waitUntil } from "@core/utils/cloudflare-ctx";

import { logger } from "@core/logging/app-logger";
import {
  createErrorDedupeHash,
  releaseErrorDedupeHash,
  shouldLogError,
} from "@core/logging/deduplication";

// Mock dependencies
jest.mock("@core/logging/deduplication", () => ({
  createErrorDedupeHash: jest.fn(),
  releaseErrorDedupeHash: jest.fn(),
  shouldLogError: jest.fn(),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

jest.mock("@core/utils/cloudflare-ctx", () => ({
  waitUntil: jest.fn((p) => p),
}));

describe("AppLogger", () => {
  const originalEnv = process.env;
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let mockSupabaseInsert: jest.Mock;
  let mockSupabaseFrom: jest.Mock;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();

    // Reset console spies
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    // Setup Supabase mock
    mockSupabaseInsert = jest.fn().mockResolvedValue({ error: null });
    mockSupabaseFrom = jest.fn().mockReturnValue({ insert: mockSupabaseInsert });
    (createClient as jest.Mock).mockReturnValue({
      from: mockSupabaseFrom,
    });

    // Default deduplication mock (allow logging)
    (createErrorDedupeHash as jest.Mock).mockResolvedValue("test-dedupe-hash");
    (releaseErrorDedupeHash as jest.Mock).mockResolvedValue(undefined);
    (shouldLogError as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("U-L-01: Development Environment Behavior", () => {
    it("should only log to console and not persist to DB when NODE_ENV is development", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";

      // Execute
      logger.error("Test error message");

      // Wait for any async operations (though none should happen for DB in dev)
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify console output
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logCall = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logCall).toMatchObject({
        level: "error",
        msg: "Test error message",
        env: "development",
      });

      // Verify NO DB interaction
      expect(createClient).not.toHaveBeenCalled();
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });
  });

  describe("U-L-02: Production Environment - Info Level", () => {
    it("should only log to console and not persist to DB for info level logs", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";

      // Execute
      logger.info("Test info message");

      // Verify console output
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      const logCall = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(logCall).toMatchObject({
        level: "info",
        msg: "Test info message",
        env: "production",
      });

      // Verify NO DB interaction
      expect(createClient).not.toHaveBeenCalled();
    });
  });

  describe("U-L-03: Production Environment - Error Level", () => {
    it("should log to console AND persist to DB for error level logs", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      // Execute
      logger.error("Test error message", {
        category: "system",
        action: "unit_test_error",
        user_id: "user_123",
      });

      // Verify console output
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      // Verify DB interaction
      // Since persistErrorToSupabase is async and not awaited by logger.error,
      // we need to wait for the promise chain to complete.
      // However, we can't easily await the internal promise.
      // We rely on the fact that the mock is called.
      // In a real unit test for a fire-and-forget function, we might need to sleep or spy on the internal function if possible.
      // But here we can just wait a tick.
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(createClient).toHaveBeenCalledWith(
        "https://example.supabase.co",
        "service-role-key",
        expect.any(Object)
      );
      expect(mockSupabaseFrom).toHaveBeenCalledWith("system_logs");
      expect(mockSupabaseInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          log_level: "error",
          log_category: "system",
          action: "unit_test_error",
          message: "Test error message",
          user_id: "user_123",
          outcome: "failure",
          dedupe_key: "test-dedupe-hash",
        })
      );
      expect(createErrorDedupeHash).toHaveBeenCalledWith("Test error message", undefined);
      expect(shouldLogError).toHaveBeenCalledWith(
        "Test error message",
        undefined,
        expect.any(Object)
      );
    });
  });

  describe("U-L-04: Async Behavior", () => {
    it("should await DB persistence internally (verified via spy/mock timing)", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      let resolveInsert: (value: any) => void;
      const insertPromise = new Promise((resolve) => {
        resolveInsert = resolve;
      });
      mockSupabaseInsert.mockReturnValue(insertPromise);

      // Execute
      logger.error("Async test", {
        category: "system",
        action: "unit_test_async",
      });

      // Console should happen immediately
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Get the promise passed to waitUntil
      const persistPromise = (waitUntil as jest.Mock).mock.results[0].value;

      // We need to wait for the first part of persistPromise (up to shouldLogError await)
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSupabaseFrom).toHaveBeenCalled();

      // Resolve the insert
      resolveInsert!({ error: null });

      // Wait for promise chain
      await persistPromise;
    });
  });

  describe("U-L-05: DB Save Error Handling", () => {
    it("should handle DB save errors gracefully without crashing", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      // Mock DB failure
      mockSupabaseInsert.mockRejectedValue(new Error("DB Connection Failed"));

      // Execute
      logger.error("DB error test", {
        category: "system",
        action: "unit_test_db_error",
      });

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should verify that a console error was logged for the failure
      // The logger.error calls console.error once for the log, and then catch block calls console.error again
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      // First call is the actual log
      expect(JSON.parse(consoleErrorSpy.mock.calls[0][0])).toMatchObject({
        msg: "DB error test",
      });

      // Second call is the error handling log
      expect(consoleErrorSpy.mock.calls[1][0]).toContain(
        "[AppLogger] Failed to persist to Supabase:"
      );
      expect(releaseErrorDedupeHash).toHaveBeenCalledWith(
        "test-dedupe-hash",
        expect.objectContaining({
          redisUrl: process.env.UPSTASH_REDIS_REST_URL,
          redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
        })
      );
    });

    it("should handle Supabase insert response errors gracefully", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      mockSupabaseInsert.mockResolvedValue({
        error: { message: "insert failed" },
      });

      logger.error("DB response error test", {
        category: "system",
        action: "unit_test_db_response_error",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy.mock.calls[1][0]).toContain(
        "[AppLogger] Failed to persist to Supabase:"
      );
      expect(releaseErrorDedupeHash).toHaveBeenCalledWith(
        "test-dedupe-hash",
        expect.objectContaining({
          redisUrl: process.env.UPSTASH_REDIS_REST_URL,
          redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
        })
      );
    });

    it("should treat dedupe_key unique violations as a no-op", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      mockSupabaseInsert.mockResolvedValue({
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "idx_system_logs_dedupe_key"',
        },
      });

      logger.error("Duplicate key test", {
        category: "system",
        action: "unit_test_dedupe_violation",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // エラーとして扱わず、通常ログ1回のみ
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(releaseErrorDedupeHash).not.toHaveBeenCalled();
    });
  });

  describe("U-L-06: Critical/Warn Outcome Defaults", () => {
    it("should persist critical logs to DB with failure outcome", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      logger.critical("Critical test", {
        category: "system",
        action: "unit_test_critical",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSupabaseInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          log_level: "critical",
          log_category: "system",
          action: "unit_test_critical",
          message: "Critical test",
          outcome: "failure",
          dedupe_key: "test-dedupe-hash",
        })
      );
      expect(shouldLogError).toHaveBeenCalledWith("Critical test", undefined, expect.any(Object));
    });

    it("should keep warn outcome default as success", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      logger.warn("Warn test", {
        category: "system",
        action: "unit_test_warn",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSupabaseInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          log_level: "warn",
          log_category: "system",
          action: "unit_test_warn",
          message: "Warn test",
          outcome: "success",
        })
      );
    });
  });

  describe("U-L-07: Required Fields Validation", () => {
    it("should skip persistence when category/action are missing", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      logger.error("Missing fields");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(shouldLogError).not.toHaveBeenCalled();
      expect(createClient).not.toHaveBeenCalled();
      expect(mockSupabaseInsert).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(JSON.parse(consoleErrorSpy.mock.calls[1][0])).toMatchObject({
        msg: "[AppLogger] Missing required log fields for persistence",
        target_log_level: "error",
        original_message: "Missing fields",
      });
    });

    it("should skip persistence when action is whitespace only", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      logger.error("Whitespace action", {
        category: "system",
        action: "   ",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(shouldLogError).not.toHaveBeenCalled();
      expect(createClient).not.toHaveBeenCalled();
      expect(mockSupabaseInsert).not.toHaveBeenCalled();
      expect(JSON.parse(consoleErrorSpy.mock.calls[1][0])).toMatchObject({
        msg: "[AppLogger] Missing required log fields for persistence",
        has_action: false,
      });
    });
  });

  describe("U-L-08: Safe Serialization", () => {
    it("should handle circular references and bigint without throwing", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";

      const circular: Record<string, unknown> = { name: "circular" };
      circular.self = circular;

      expect(() => {
        logger.error("Serialization test", {
          category: "system",
          action: "unit_test_serialization",
          circular,
          large_id: BigInt(42),
        });
      }).not.toThrow();

      const logCall = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logCall.circular.self).toBe("[Circular]");
      expect(logCall.large_id).toBe("42");
    });

    it("should persist JSON-safe metadata even with non-JSON values", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      const circular: Record<string, unknown> = { name: "circular" };
      circular.self = circular;
      const circularArray: unknown[] = [];
      circularArray.push(circularArray);
      const circularMap = new Map<string, unknown>();
      circularMap.set("self", circularMap);
      const circularSet = new Set<unknown>();
      circularSet.add(circularSet);

      logger.error("JSON safe metadata", {
        category: "system",
        action: "unit_test_json_safe_metadata",
        large_id: BigInt(42),
        circular,
        circularArray,
        circularMap,
        circularSet,
        error: new Error("metadata error"),
        fn: () => "skip",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      const insertPayload = mockSupabaseInsert.mock.calls[0][0];
      expect(insertPayload.metadata.large_id).toBe("42");
      expect(insertPayload.metadata.circular.self).toBe("[Circular]");
      expect(insertPayload.metadata.circularArray).toEqual(["[Circular]"]);
      expect(insertPayload.metadata.circularMap).toEqual({ self: "[Circular]" });
      expect(insertPayload.metadata.circularSet).toEqual(["[Circular]"]);
      expect(insertPayload.metadata.error).toMatchObject({
        name: "Error",
        message: "metadata error",
      });
      expect(insertPayload.metadata.fn).toBeUndefined();
    });
  });
});
