// Mock crypto dependency
jest.mock("@core/security/crypto", () => ({
  hashToken: jest.fn(),
}));

describe("deduplication", () => {
  let mockRedis: {
    set: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
  };
  let RedisMock: jest.Mock & { fromEnv: jest.Mock };
  let mockHashToken: jest.Mock;
  let shouldLogError: (
    message: string,
    stack?: string,
    envVars?: { redisUrl?: string; redisToken?: string },
    ttlSeconds?: number
  ) => Promise<boolean>;
  let createErrorDedupeHash: (message: string, stack?: string) => Promise<string>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    process.env.UPSTASH_REDIS_REST_URL = "https://mock-redis.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";

    const redisModule = require("@upstash/redis");
    RedisMock = redisModule.Redis;
    mockRedis = redisModule.Redis.fromEnv();

    const cryptoModule = require("@core/security/crypto");
    mockHashToken = cryptoModule.hashToken;

    const dedupeModule = require("@core/logging/deduplication");
    shouldLogError = dedupeModule.shouldLogError;
    createErrorDedupeHash = dedupeModule.createErrorDedupeHash;
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("U-D-01: 同じ入力に対して一貫したハッシュを生成する", async () => {
    const message = "Error message";
    const stack = "Error: message\n    at func1 (file.ts:1:1)\n    at func2 (file.ts:2:2)";
    mockHashToken.mockResolvedValue("mock-hash");

    const hash = await createErrorDedupeHash(message, stack);

    expect(hash).toBe("mock-hash");
    expect(mockHashToken).toHaveBeenCalledWith(
      "Error message\nError: message\n    at func1 (file.ts)\n    at func2 (file.ts)"
    );
  });

  it("U-D-02: スタックトレースは最初の3行のみを使用する", async () => {
    const message = "Error message";
    const longStack = [
      "Error: failed",
      "    at first (file.ts:1:1)",
      "    at second (file.ts:2:2)",
      "    at third (file.ts:3:3)",
      "    at fourth (file.ts:4:4)",
    ].join("\n");
    mockHashToken.mockResolvedValue("mock-hash");

    await createErrorDedupeHash(message, longStack);

    expect(mockHashToken).toHaveBeenCalledWith(
      "Error message\nError: failed\n    at first (file.ts)\n    at second (file.ts)"
    );
  });

  it("U-D-03: 新しいエラーの場合、trueを返し、キーを設定する", async () => {
    mockHashToken.mockResolvedValue("new-hash");
    mockRedis.set.mockResolvedValue("OK");

    const result = await shouldLogError("New Error", "stack");

    expect(result).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith("error_dedupe:new-hash", "1", {
      ex: 300,
      nx: true,
    });
    expect(mockRedis.set).toHaveBeenCalledWith("error_count:new-hash", "1", { ex: 300 });
  });

  it("U-D-04: 重複エラーの場合、falseを返し、カウンタを増加する", async () => {
    mockHashToken.mockResolvedValue("dup-hash");
    mockRedis.set.mockResolvedValueOnce(null);

    const result = await shouldLogError("Duplicate Error", "stack");

    expect(result).toBe(false);
    expect(mockRedis.incr).toHaveBeenCalledWith("error_count:dup-hash");
    expect(mockRedis.expire).toHaveBeenCalledWith("error_count:dup-hash", 300);
  });

  it("U-D-05: Redis エラー時は true を返し、コンソールに出力する", async () => {
    mockHashToken.mockResolvedValue("redis-err-hash");
    mockRedis.set.mockRejectedValue(new Error("Redis connection failed"));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const result = await shouldLogError("Redis Error", "stack");

    expect(result).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("U-D-06: 同一 URL/token では Redis クライアントを再利用する", async () => {
    mockHashToken.mockResolvedValue("same-hash");
    mockRedis.set.mockResolvedValue("OK");

    await shouldLogError("Error One", "stack", {
      redisUrl: "https://mock-redis.upstash.io",
      redisToken: "mock-token",
    });
    await shouldLogError("Error Two", "stack", {
      redisUrl: "https://mock-redis.upstash.io",
      redisToken: "mock-token",
    });

    expect(RedisMock).toHaveBeenCalledTimes(1);
  });
});
