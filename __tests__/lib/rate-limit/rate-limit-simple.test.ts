/**
 * レート制限機能の簡潔な単体テスト
 * @jest-environment node
 */

import { checkRateLimit, createRateLimitStore, resetMemoryStore } from "@/lib/rate-limit/index";
import type { RateLimitConfig } from "@/lib/rate-limit/types";

describe("Rate Limit Simple Tests", () => {
  const testConfig: RateLimitConfig = {
    windowMs: 60000, // 1分
    maxAttempts: 3, // 3回まで
    blockDurationMs: 300000, // 5分ブロック
  };

  let store: any;

  beforeEach(async () => {
    resetMemoryStore();
    store = await createRateLimitStore();
  });

  afterEach(() => {
    resetMemoryStore();
  });

  describe("基本的なレート制限", () => {
    it("初回アクセスは許可される", async () => {
      const result = await checkRateLimit(store, "user1", testConfig);
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it("制限内のアクセスは許可される", async () => {
      // 1回目
      await checkRateLimit(store, "user2", testConfig);
      // 2回目
      await checkRateLimit(store, "user2", testConfig);
      // 3回目（制限内）
      const result = await checkRateLimit(store, "user2", testConfig);

      expect(result.allowed).toBe(true);
    });

    it("制限を超えたアクセスは拒否される", async () => {
      // 制限まで実行
      await checkRateLimit(store, "user3", testConfig);
      await checkRateLimit(store, "user3", testConfig);
      await checkRateLimit(store, "user3", testConfig);

      // 制限超過
      const result = await checkRateLimit(store, "user3", testConfig);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("異なるユーザーは独立してカウントされる", async () => {
      // user4が制限に達する
      await checkRateLimit(store, "user4", testConfig);
      await checkRateLimit(store, "user4", testConfig);
      await checkRateLimit(store, "user4", testConfig);
      const blockedResult = await checkRateLimit(store, "user4", testConfig);
      expect(blockedResult.allowed).toBe(false);

      // user5は影響を受けない
      const allowedResult = await checkRateLimit(store, "user5", testConfig);
      expect(allowedResult.allowed).toBe(true);
    });
  });

  describe("エッジケース", () => {
    it("空の識別子でも動作する", async () => {
      const result = await checkRateLimit(store, "", testConfig);
      expect(result.allowed).toBe(true);
    });

    it("特殊文字を含む識別子でも動作する", async () => {
      const specialId = "user@domain.com:192.168.1.1";
      const result = await checkRateLimit(store, specialId, testConfig);
      expect(result.allowed).toBe(true);
    });

    it("非常に短いウィンドウ期間でも動作する", async () => {
      const shortConfig: RateLimitConfig = {
        windowMs: 10, // 10ms
        maxAttempts: 1,
        blockDurationMs: 100,
      };

      const result1 = await checkRateLimit(store, "shortUser", shortConfig);
      expect(result1.allowed).toBe(true);

      const result2 = await checkRateLimit(store, "shortUser", shortConfig);
      expect(result2.allowed).toBe(false);
    });
  });

  describe("ストア機能", () => {
    it("ストアが正しく作成される", async () => {
      const newStore = await createRateLimitStore();
      expect(newStore).toBeDefined();
      expect(typeof newStore.get).toBe("function");
      expect(typeof newStore.set).toBe("function");
    });

    it("メモリストアのリセットが動作する", async () => {
      // データを設定
      await checkRateLimit(store, "resetUser", testConfig);

      // リセット
      resetMemoryStore();
      const newStore = await createRateLimitStore();

      // 新しいストアでは初回アクセスとして扱われる
      const result = await checkRateLimit(newStore, "resetUser", testConfig);
      expect(result.allowed).toBe(true);
    });
  });

  describe("設定パラメータ", () => {
    it("maxAttemptsが1の場合", async () => {
      const singleConfig: RateLimitConfig = {
        windowMs: 60000,
        maxAttempts: 1,
        blockDurationMs: 300000,
      };

      const result1 = await checkRateLimit(store, "singleUser", singleConfig);
      expect(result1.allowed).toBe(true);

      const result2 = await checkRateLimit(store, "singleUser", singleConfig);
      expect(result2.allowed).toBe(false);
    });

    it("大きなmaxAttemptsでも動作する", async () => {
      const largeConfig: RateLimitConfig = {
        windowMs: 60000,
        maxAttempts: 100,
        blockDurationMs: 300000,
      };

      // 50回アクセス
      for (let i = 0; i < 50; i++) {
        const result = await checkRateLimit(store, "largeUser", largeConfig);
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe("パフォーマンス", () => {
    it("複数ユーザーの同時処理", async () => {
      const promises = [];

      // 10人のユーザーが同時にアクセス
      for (let i = 0; i < 10; i++) {
        promises.push(checkRateLimit(store, `perfUser${i}`, testConfig));
      }

      const results = await Promise.all(promises);

      // 全て許可される
      results.forEach((result) => {
        expect(result.allowed).toBe(true);
      });
    });

    it("高頻度アクセスの処理", async () => {
      const start = Date.now();

      // 同一ユーザーで100回アクセス
      for (let i = 0; i < 100; i++) {
        await checkRateLimit(store, "highFreqUser", testConfig);
      }

      const duration = Date.now() - start;

      // 1秒以内に完了することを確認
      expect(duration).toBeLessThan(1000);
    });
  });
});
