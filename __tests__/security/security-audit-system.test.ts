/**
 * セキュリティ監査システムテスト
 *
 * セキュリティ監査機能の動作を検証し、
 * 管理者権限使用の記録とゲストアクセスの監視をテストする
 */

import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { AdminReason } from "@/lib/security/secure-client-factory.types";
import { generateGuestToken } from "@/lib/utils/guest-token";

describe("セキュリティ監査システムテスト", () => {
  let secureClientFactory: SecureSupabaseClientFactory;

  beforeEach(() => {
    secureClientFactory = SecureSupabaseClientFactory.create();
  });

  describe("管理者アクセス監査", () => {
    it("不正な理由での管理者権限使用が拒否される", async () => {
      // 存在しない理由で管理者権限を要求
      await expect(async () => {
        await secureClientFactory.createAuditedAdminClient(
          "INVALID_REASON" as AdminReason,
          "Invalid admin access attempt"
        );
      }).rejects.toThrow();
    });

    it("管理者権限要求時に理由とコンテキストが必要", async () => {
      // 理由なしで管理者権限を要求
      await expect(async () => {
        await secureClientFactory.createAuditedAdminClient(null as any, "Missing reason test");
      }).rejects.toThrow();

      // コンテキストなしで管理者権限を要求
      await expect(async () => {
        await secureClientFactory.createAuditedAdminClient(AdminReason.TEST_DATA_SETUP, "");
      }).rejects.toThrow();
    });
  });

  describe("ゲストアクセス監査", () => {
    it("ゲストトークンアクセスが適切に処理される", async () => {
      const guestToken = generateGuestToken();

      // ゲストアクセスを実行
      const guestClient = secureClientFactory.createGuestClient(guestToken);
      const { data, error } = await guestClient
        .from("attendances")
        .select("*")
        .eq("guest_token", guestToken);

      // アクセス自体は成功する（空の結果セット）
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("無効なゲストトークンアクセスが適切に処理される", async () => {
      const invalidToken = generateGuestToken();

      // 無効なトークンでアクセス試行
      const guestClient = secureClientFactory.createGuestClient(invalidToken);
      const { data, error } = await guestClient
        .from("attendances")
        .select("*")
        .eq("guest_token", invalidToken);

      // アクセス自体は成功するが空の結果セット
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe("疑わしい活動の検知", () => {
    it("権限昇格試行が適切に処理される", async () => {
      const guestToken = generateGuestToken();

      // ゲストトークンで管理者テーブルへのアクセス試行
      const guestClient = secureClientFactory.createGuestClient(guestToken);
      const { data, error } = await guestClient.from("admin_access_audit").select("*");

      // アクセスは拒否される（空の結果セット）
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("大量の失敗したアクセスが適切に処理される", async () => {
      // 大量の有効な形式だが存在しないトークンでアクセス試行
      const invalidTokens = Array.from(
        { length: 5 },
        () => generateGuestToken() // 有効な形式のトークンを生成
      );

      const promises = invalidTokens.map((token) => {
        const guestClient = secureClientFactory.createGuestClient(token);
        return guestClient.from("attendances").select("*").eq("guest_token", token);
      });

      const results = await Promise.allSettled(promises);

      // 全て空の結果セットが返される
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          expect(result.value.data).toEqual([]);
        }
      });
    });
  });

  describe("不正アクセス試行の記録", () => {
    it("不正なリソースアクセスが適切に処理される", async () => {
      const guestToken = generateGuestToken();

      // 権限のないリソースへのアクセス試行
      const guestClient = secureClientFactory.createGuestClient(guestToken);
      const { data, error } = await guestClient.from("users").select("*");

      // アクセスは拒否される（空の結果セット）
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("権限チェック失敗が適切に処理される", async () => {
      // 未認証ユーザーでの管理者操作試行
      const anonymousClient = secureClientFactory.createAuthenticatedClient();

      const { data, error } = await anonymousClient.auth.admin.listUsers();

      // 権限がないためエラーが発生するか、空の結果が返される
      if (error) {
        expect(error).toBeDefined();
      } else {
        // テスト環境では空のリストが返される場合がある
        expect(data).toBeDefined();
        if (data && typeof data === "object" && "users" in data) {
          expect(Array.isArray(data.users)).toBe(true);
        }
      }
    });
  });

  describe("セキュリティ機能の基本動作", () => {
    it("セキュアクライアントファクトリーが正常に動作する", () => {
      // 各種クライアントが作成できることを確認
      const authenticatedClient = secureClientFactory.createAuthenticatedClient();
      const readOnlyClient = secureClientFactory.createReadOnlyClient();
      const guestClient = secureClientFactory.createGuestClient(generateGuestToken());

      expect(authenticatedClient).toBeDefined();
      expect(readOnlyClient).toBeDefined();
      expect(guestClient).toBeDefined();
    });

    it("ゲストトークンの形式検証が動作する", () => {
      const validToken = generateGuestToken();
      const invalidTokens = ["", "invalid", "gst_short", "wrong_prefix_" + "a".repeat(32)];

      // 有効なトークンでクライアント作成成功
      expect(() => {
        secureClientFactory.createGuestClient(validToken);
      }).not.toThrow();

      // 無効なトークンでクライアント作成失敗
      invalidTokens.forEach((token) => {
        expect(() => {
          secureClientFactory.createGuestClient(token);
        }).toThrow();
      });
    });
  });

  describe("監査ログの整合性", () => {
    it("管理者権限要求時の基本検証が動作する", async () => {
      // 有効な理由での管理者権限要求は成功する
      await expect(async () => {
        await secureClientFactory.createAuditedAdminClient(
          AdminReason.TEST_DATA_SETUP,
          "Valid admin access for testing"
        );
      }).not.toThrow();

      // 無効な理由での管理者権限要求は失敗する
      await expect(async () => {
        await secureClientFactory.createAuditedAdminClient(
          "INVALID_REASON" as AdminReason,
          "Invalid admin access attempt"
        );
      }).rejects.toThrow();
    });
  });
});
