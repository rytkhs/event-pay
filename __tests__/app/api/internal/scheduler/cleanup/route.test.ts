/**
 * スケジューラーロック削除API のテスト
 */

import { POST, GET } from "@/app/api/internal/scheduler/cleanup/route";
import { NextRequest } from "next/server";

// Supabaseクライアントをモック
jest.mock("@/lib/supabase/service", () => ({
  createServiceClient: jest.fn(() => ({
    rpc: jest.fn(),
  })),
}));

const { createServiceClient } = require("@/lib/supabase/service");

describe("/api/internal/scheduler/cleanup", () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = {
      rpc: jest.fn(),
    };
    createServiceClient.mockReturnValue(mockSupabase);

    // 環境変数をモック
    process.env.INTERNAL_API_TOKEN = "test-internal-token";
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_TOKEN;
  });

  describe("POST /api/internal/scheduler/cleanup", () => {
    it("認証なしの場合は401を返す", async () => {
      const request = new NextRequest("http://localhost:3000/api/internal/scheduler/cleanup", {
        method: "POST",
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("無効なトークンの場合は401を返す", async () => {
      const request = new NextRequest("http://localhost:3000/api/internal/scheduler/cleanup", {
        method: "POST",
        headers: {
          authorization: "Bearer invalid-token",
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("正しいトークンで期限切れロック削除に成功", async () => {
      const mockCleanupResult = {
        deleted_count: 2,
        expired_locks: [
          {
            lock_name: "payout_scheduler",
            acquired_at: "2025-01-01T10:00:00Z",
            expires_at: "2025-01-01T10:30:00Z",
            process_id: "scheduler-123-abc",
          },
          {
            lock_name: "payout_scheduler",
            acquired_at: "2025-01-01T11:00:00Z",
            expires_at: "2025-01-01T11:30:00Z",
            process_id: "scheduler-456-def",
          },
        ],
      };

      mockSupabase.rpc.mockImplementation((fnName: string) => {
        if (fnName === "cleanup_expired_scheduler_locks") {
          return {
            single: jest.fn().mockResolvedValue({
              data: mockCleanupResult,
              error: null,
            }),
          };
        }
        return Promise.resolve({ data: null, error: null });
      });

      const request = new NextRequest("http://localhost:3000/api/internal/scheduler/cleanup", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-token",
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.deletedCount).toBe(2);
      expect(data.expiredLocks).toHaveLength(2);
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      // RPCが正しく呼ばれることを確認
      expect(mockSupabase.rpc).toHaveBeenCalledWith("cleanup_expired_scheduler_locks");
    });

    it("RPCエラーの場合は500を返す", async () => {
      mockSupabase.rpc.mockImplementation((fnName: string) => {
        if (fnName === "cleanup_expired_scheduler_locks") {
          return {
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "Database connection failed" },
            }),
          };
        }
        return Promise.resolve({ data: null, error: null });
      });

      const request = new NextRequest("http://localhost:3000/api/internal/scheduler/cleanup", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-token",
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Cleanup failed");
      expect(data.details).toBe("Database connection failed");
    });

    it("INTERNAL_API_TOKEN未設定の場合は500を返す", async () => {
      delete process.env.INTERNAL_API_TOKEN;

      const request = new NextRequest("http://localhost:3000/api/internal/scheduler/cleanup", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-token",
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Internal API not configured");
    });
  });

  describe("GET /api/internal/scheduler/cleanup", () => {
    it("ロック状態取得に成功", async () => {
      const mockLockStatus = [
        {
          lock_name: "payout_scheduler",
          acquired_at: "2025-01-01T12:00:00Z",
          expires_at: "2025-01-01T12:30:00Z",
          time_remaining_minutes: 25,
          process_id: "scheduler-789-ghi",
          metadata: { startTime: "2025-01-01T12:00:00Z" },
          is_expired: false,
        },
      ];

      mockSupabase.rpc.mockImplementation((fnName: string) => {
        if (fnName === "get_scheduler_lock_status") {
          return Promise.resolve({
            data: mockLockStatus,
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      });

      const request = new NextRequest("http://localhost:3000/api/internal/scheduler/cleanup", {
        method: "GET",
        headers: {
          authorization: "Bearer test-internal-token",
        },
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.locks).toEqual(mockLockStatus);
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      // RPCが正しく呼ばれることを確認
      expect(mockSupabase.rpc).toHaveBeenCalledWith("get_scheduler_lock_status");
    });

    it("認証なしの場合は401を返す", async () => {
      const request = new NextRequest("http://localhost:3000/api/internal/scheduler/cleanup", {
        method: "GET",
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });
  });
});
