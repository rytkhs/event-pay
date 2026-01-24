import { createClient } from "@supabase/supabase-js";

import { waitUntil } from "@core/utils/cloudflare-ctx";

import { logger } from "@/core/logging/app-logger";
import { shouldLogError } from "@/core/logging/deduplication";

// Mock dependencies
jest.mock("@/core/logging/deduplication", () => ({
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
    (shouldLogError as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("U-L-01: Development Environment Behavior", () => {
    it("should only log to console and not persist to DB when NODE_ENV is development", async () => {
      process.env.NODE_ENV = "development";

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
      process.env.NODE_ENV = "production";

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
      process.env.NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      // Execute
      logger.error("Test error message", { user_id: "user_123" });

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
          message: "Test error message",
          user_id: "user_123",
        })
      );
    });
  });

  describe("U-L-04: Async Behavior", () => {
    it("should await DB persistence internally (verified via spy/mock timing)", async () => {
      process.env.NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      let resolveInsert: (value: any) => void;
      const insertPromise = new Promise((resolve) => {
        resolveInsert = resolve;
      });
      mockSupabaseInsert.mockReturnValue(insertPromise);

      // Execute
      logger.error("Async test");

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
      process.env.NODE_ENV = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      // Mock DB failure
      mockSupabaseInsert.mockRejectedValue(new Error("DB Connection Failed"));

      // Execute
      logger.error("DB error test");

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
    });
  });
});
