import { Redis } from "@upstash/redis";

import { shouldLogError } from "@core/logging/deduplication";
import { hashToken } from "@core/security/crypto";

// Mock crypto dependency
jest.mock("@core/security/crypto", () => ({
  hashToken: jest.fn(),
}));

describe("shouldLogError", () => {
  let mockRedis: any;
  let shouldLogError: any;
  let mockHashToken: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";

    const redisModule = require("@upstash/redis");
    mockRedis = redisModule.Redis.fromEnv();

    const cryptoModule = require("@core/security/crypto");
    mockHashToken = cryptoModule.hashToken;

    const dedupeModule = require("@core/logging/deduplication");
    shouldLogError = dedupeModule.shouldLogError;
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("U-D-01: 同じメッセージとスタックに対して、一貫したハッシュを生成する", async () => {
    const message = "Error message";
    const stack = "Error: message\n    at func1 (file.ts:1:1)\n    at func2 (file.ts:2:2)";
    mockHashToken.mockResolvedValue("mock-hash");
    (mockRedis.get as jest.Mock).mockResolvedValue(null);

    await shouldLogError(message, stack);

    expect(mockHashToken).toHaveBeenCalledWith(expect.stringContaining(message));
    const expectedStackPart = stack.split("\n").slice(0, 3).join("\n");
    expect(mockHashToken).toHaveBeenCalledWith(message + expectedStackPart);
  });

  it("U-D-02: スタックトレースの最初の3行のみを使用する", async () => {
    const message = "Error message";
    const longStack = Array.from({ length: 100 }, (_, i) => `at line ${i}`).join("\n");
    mockHashToken.mockResolvedValue("mock-hash");
    (mockRedis.get as jest.Mock).mockResolvedValue(null);

    await shouldLogError(message, longStack);

    const expectedStackPart = longStack.split("\n").slice(0, 3).join("\n");
    expect(mockHashToken).toHaveBeenCalledWith(message + expectedStackPart);
  });

  it("U-D-03: 新しいエラーの場合、trueを返し、キーを設定する", async () => {
    const message = "New Error";
    const stack = "stack";
    mockHashToken.mockResolvedValue("new-hash");
    (mockRedis.get as jest.Mock).mockResolvedValue(null);

    const result = await shouldLogError(message, stack);

    expect(result).toBe(true);
    expect(mockRedis.get).toHaveBeenCalledWith("error_dedupe:new-hash");
    expect(mockRedis.set).toHaveBeenCalledWith("error_dedupe:new-hash", "1", { ex: 300 });
    expect(mockRedis.set).toHaveBeenCalledWith("error_count:new-hash", "1", { ex: 300 });
  });

  it("U-D-04: 重複するエラーの場合、falseを返し、カウンターを増加させる", async () => {
    const message = "Duplicate Error";
    const stack = "stack";
    mockHashToken.mockResolvedValue("dup-hash");
    (mockRedis.get as jest.Mock).mockImplementation((k) => {
      console.log("DEBUG: mockRedis.get called with:", k);
      return Promise.resolve("1");
    });

    const result = await shouldLogError(message, stack);

    expect(result).toBe(false);
    expect(mockRedis.get).toHaveBeenCalledWith("error_dedupe:dup-hash");
    expect(mockRedis.incr).toHaveBeenCalledWith("error_count:dup-hash");
    // Should NOT set the key again
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("U-D-05: Redisがエラーを返す場合、trueを返し、コンソールに出力する", async () => {
    const message = "Redis Error";
    const stack = "stack";
    mockHashToken.mockResolvedValue("redis-err-hash");
    (mockRedis.get as jest.Mock).mockRejectedValue(new Error("Redis connection failed"));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await shouldLogError(message, stack);

    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
