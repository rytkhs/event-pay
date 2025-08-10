import {
  SupabaseWebhookIdempotencyService,
  IdempotentWebhookProcessor,
  RedisWebhookIdempotencyService,
} from "@/lib/services/webhook/webhook-idempotency";
import * as supabaseJs from "@supabase/supabase-js";

// Supabaseクライアントのモック
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
    insert: jest.fn(),
    update: jest.fn(() => ({
      eq: jest.fn(),
    })),
    delete: jest.fn(() => ({
      eq: jest.fn(),
    })),
  })),
};

// Redisクライアントのモック
const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
};

// createClient のスパイ（このテストスイート内に限定）
let createClientSpy: jest.SpyInstance;

describe("SupabaseWebhookIdempotencyService", () => {
  let service: SupabaseWebhookIdempotencyService;

  beforeEach(() => {
    createClientSpy = jest
      .spyOn(supabaseJs, "createClient")
      .mockReturnValue(mockSupabase as any);
    service = new SupabaseWebhookIdempotencyService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    createClientSpy?.mockRestore();
  });

  describe("isEventProcessed", () => {
    it("処理済みイベントに対してtrueを返す", async () => {
      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: { processing_result: { success: true } },
                error: null,
              }),
            })),
          })),
          insert: jest.fn(),
          update: jest.fn(() => ({ eq: jest.fn() })),
          delete: jest.fn(() => ({ eq: jest.fn() })),
        } as any;
      });

      const result = await service.isEventProcessed("evt_test_123");
      expect(result).toBe(true);
    });

    it("未処理イベントに対してfalseを返す", async () => {
      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            })),
          })),
          insert: jest.fn(),
          update: jest.fn(() => ({ eq: jest.fn() })),
          delete: jest.fn(() => ({ eq: jest.fn() })),
        } as any;
      });

      const result = await service.isEventProcessed("evt_test_123");
      expect(result).toBe(false);
    });

    it("データベースエラーが発生した場合にエラーを投げる", async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: "OTHER_ERROR", message: "Database error" },
            }),
          })),
        })),
        insert: jest.fn(),
        update: jest.fn(() => ({ eq: jest.fn() })),
        delete: jest.fn(() => ({ eq: jest.fn() })),
      } as any);

      await expect(service.isEventProcessed("evt_test_123")).rejects.toThrow(
        "Failed to check event processing status: Database error"
      );
    });
  });

  describe("markEventAsProcessed", () => {
    it("イベントを処理済みとしてマークする（upsert）", async () => {
      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        return {
          upsert: jest.fn().mockResolvedValue({ error: null }),
          select: jest.fn(),
          insert: jest.fn(),
          update: jest.fn(() => ({ eq: jest.fn() })),
          delete: jest.fn(() => ({ eq: jest.fn() })),
        } as any;
      });

      await expect(
        service.markEventAsProcessed("evt_test_123", "payment_intent.succeeded", { success: true })
      ).resolves.not.toThrow();

      expect(mockSupabase.from).toHaveBeenCalledWith("webhook_events");
    });

    it("データベースエラーでエラーを投げる（upsert失敗）", async () => {
      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        return {
          upsert: jest.fn().mockResolvedValue({ error: { message: "Database error" } }),
          select: jest.fn(),
          insert: jest.fn(),
          update: jest.fn(() => ({ eq: jest.fn() })),
          delete: jest.fn(() => ({ eq: jest.fn() })),
        } as any;
      });

      await expect(
        service.markEventAsProcessed("evt_test_123", "payment_intent.succeeded", { success: true })
      ).rejects.toThrow("Failed to mark event as processed: Database error");
    });
  });

  describe("acquireProcessingLock", () => {
    it("新規ロック取得に成功する", async () => {
      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        return {
          insert: jest.fn().mockResolvedValue({ error: null }),
          select: jest.fn(),
          update: jest.fn(() => ({ eq: jest.fn() })),
          delete: jest.fn(() => ({ eq: jest.fn() })),
        } as any;
      });

      await expect(service.acquireProcessingLock("evt_lock_1", "payment_intent.succeeded")).resolves.toBe(true);
    });

    it("重複時はfalseを返す", async () => {
      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        return {
          insert: jest.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate" } }),
          select: jest.fn(),
          update: jest.fn(() => ({ eq: jest.fn() })),
          delete: jest.fn(() => ({ eq: jest.fn() })),
        } as any;
      });

      await expect(service.acquireProcessingLock("evt_lock_1", "payment_intent.succeeded")).resolves.toBe(false);
    });

    it("その他のDBエラーは例外", async () => {
      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        return {
          insert: jest.fn().mockResolvedValue({ error: { code: "OTHER", message: "db error" } }),
          select: jest.fn(),
          update: jest.fn(() => ({ eq: jest.fn() })),
          delete: jest.fn(() => ({ eq: jest.fn() })),
        } as any;
      });

      await expect(service.acquireProcessingLock("evt_lock_1", "payment_intent.succeeded")).rejects.toThrow(
        "Failed to acquire processing lock: db error"
      );
    });
  });

  describe("getProcessingResult", () => {
    it("処理結果を正常に取得する", async () => {
      const mockResult = { success: true, paymentId: "pay_test_123" };

      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: { processing_result: mockResult },
                error: null,
              }),
            })),
          })),
          insert: jest.fn(),
          update: jest.fn(() => ({ eq: jest.fn() })),
          delete: jest.fn(() => ({ eq: jest.fn() })),
        } as any;
      });

      const result = await service.getProcessingResult("evt_test_123");
      expect(result).toEqual(mockResult);
    });

    it("イベントが見つからない場合にnullを返す", async () => {
      (mockSupabase.from as jest.Mock).mockImplementation(() => {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
              maybeSingle: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            })),
          })),
          insert: jest.fn(),
          update: jest.fn(() => ({ eq: jest.fn() })),
          delete: jest.fn(() => ({ eq: jest.fn() })),
        } as any;
      });

      const result = await service.getProcessingResult("evt_test_123");
      expect(result).toBeNull();
    });
  });
});

describe("IdempotentWebhookProcessor", () => {
  let processor: IdempotentWebhookProcessor;
  let mockIdempotencyService: any;

  beforeEach(() => {
    mockIdempotencyService = {
      isEventProcessed: jest.fn(),
      markEventAsProcessed: jest.fn(),
      getProcessingResult: jest.fn(),
    };
    processor = new IdempotentWebhookProcessor(mockIdempotencyService);
    jest.clearAllMocks();
  });

  describe("processWithIdempotency", () => {
    it("新しいイベントを正常に処理する", async () => {
      const mockProcessor = jest.fn().mockResolvedValue({ success: true });

      mockIdempotencyService.isEventProcessed.mockResolvedValue(false);
      mockIdempotencyService.markEventAsProcessed.mockResolvedValue(undefined);

      const result = await processor.processWithIdempotency(
        "evt_test_123",
        "payment_intent.succeeded",
        mockProcessor,
        { shouldMark: (r: any) => r?.success === true }
      );

      expect(result.result).toEqual({ success: true });
      expect(result.wasAlreadyProcessed).toBe(false);
      expect(mockProcessor).toHaveBeenCalledTimes(1);
      expect(mockIdempotencyService.markEventAsProcessed).toHaveBeenCalledWith(
        "evt_test_123",
        "payment_intent.succeeded",
        { success: true }
      );
    });

    it("既に処理済みのイベントの場合、前回の結果を返す", async () => {
      const mockProcessor = jest.fn();
      const previousResult = { success: true, paymentId: "pay_test_123" };

      mockIdempotencyService.isEventProcessed.mockResolvedValue(true);
      mockIdempotencyService.getProcessingResult.mockResolvedValue(previousResult);

      const result = await processor.processWithIdempotency(
        "evt_test_123",
        "payment_intent.succeeded",
        mockProcessor,
        { shouldMark: (r: any) => r?.success === true }
      );

      expect(result.result).toEqual(previousResult);
      expect(result.wasAlreadyProcessed).toBe(true);
      expect(mockProcessor).not.toHaveBeenCalled();
      expect(mockIdempotencyService.markEventAsProcessed).not.toHaveBeenCalled();
    });

    it("処理中にエラーが発生した場合、処理済みとしてマークしない", async () => {
      const mockProcessor = jest.fn().mockRejectedValue(new Error("Processing failed"));

      mockIdempotencyService.isEventProcessed.mockResolvedValue(false);

      await expect(
        processor.processWithIdempotency(
          "evt_test_123",
          "payment_intent.succeeded",
          mockProcessor,
          { shouldMark: (r: any) => r?.success === true }
        )
      ).rejects.toThrow("Processing failed");

      expect(mockIdempotencyService.markEventAsProcessed).not.toHaveBeenCalled();
    });
    it("処理が失敗を返した場合は処理済みに記録しない", async () => {
      const mockProcessor = jest.fn().mockResolvedValue({ success: false, error: "temporary" });

      mockIdempotencyService.isEventProcessed.mockResolvedValue(false);

      const result = await processor.processWithIdempotency(
        "evt_test_456",
        "payment_intent.succeeded",
        mockProcessor,
        { shouldMark: (r: any) => r?.success === true }
      );

      expect(result.result).toEqual({ success: false, error: "temporary" });
      expect(result.wasAlreadyProcessed).toBe(false);
      expect(mockIdempotencyService.markEventAsProcessed).not.toHaveBeenCalled();
    });
  });
});

describe("RedisWebhookIdempotencyService", () => {
  let service: RedisWebhookIdempotencyService;

  beforeEach(() => {
    service = new RedisWebhookIdempotencyService(mockRedis);
    jest.clearAllMocks();
  });

  describe("isEventProcessed", () => {
    it("処理済みイベントに対してtrueを返す", async () => {
      mockRedis.get.mockResolvedValue('{"eventType":"payment_intent.succeeded"}');

      const result = await service.isEventProcessed("evt_test_123");
      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith("webhook:processed:evt_test_123");
    });

    it("未処理イベントに対してfalseを返す", async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.isEventProcessed("evt_test_123");
      expect(result).toBe(false);
    });

    it("Redisエラーが発生した場合にエラーを投げる", async () => {
      mockRedis.get.mockRejectedValue(new Error("Redis connection failed"));

      await expect(service.isEventProcessed("evt_test_123")).rejects.toThrow(
        "Redis error checking event processing: Redis connection failed"
      );
    });
  });

  describe("markEventAsProcessed", () => {
    it("イベントを処理済みとしてマークする", async () => {
      mockRedis.setex.mockResolvedValue("OK");

      await expect(
        service.markEventAsProcessed("evt_test_123", "payment_intent.succeeded", { success: true })
      ).resolves.not.toThrow();

      expect(mockRedis.setex).toHaveBeenCalledWith(
        "webhook:processed:evt_test_123",
        86400, // 24時間のTTL
        expect.stringContaining('"eventType":"payment_intent.succeeded"')
      );
    });
  });

  describe("getProcessingResult", () => {
    it("処理結果を正常に取得する", async () => {
      const mockData = {
        eventType: "payment_intent.succeeded",
        processingResult: { success: true },
        processedAt: "2025-01-01T00:00:00.000Z",
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockData));

      const result = await service.getProcessingResult("evt_test_123");
      expect(result).toEqual({ success: true });
    });

    it("イベントが見つからない場合にnullを返す", async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getProcessingResult("evt_test_123");
      expect(result).toBeNull();
    });
  });
});
