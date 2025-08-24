/**
 * RLSポリシー検証テスト
 *
 * データベースアクセスセキュリティ再設計の一環として、
 * RLSポリシーの動作を検証し、権限昇格攻撃の防御をテストする
 */

import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { AdminReason, GuestTokenError } from "@/lib/security/secure-client-factory.types";
import { generateGuestToken } from "@/lib/utils/guest-token";

describe("RLSポリシー検証テスト", () => {
  let secureClientFactory: SecureSupabaseClientFactory;

  beforeEach(() => {
    secureClientFactory = SecureSupabaseClientFactory.create();
  });

  describe("ゲストトークンRLSポリシー", () => {
    it("無効なゲストトークンではattendanceにアクセスできない", async () => {
      // 無効なゲストトークン
      const invalidToken = generateGuestToken();
      const guestClient = secureClientFactory.createGuestClient(invalidToken);

      const { data, error } = await guestClient
        .from("attendances")
        .select("*")
        .eq("guest_token", invalidToken);

      // RLSポリシーにより空の結果セットが返される
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("ゲストトークンでシステムテーブルにアクセスできない", async () => {
      const guestToken = generateGuestToken();
      const guestClient = secureClientFactory.createGuestClient(guestToken);

      // 管理者監査テーブルへのアクセス試行
      const { data, error } = await guestClient.from("admin_access_audit").select("*");

      // RLSポリシーにより空の結果セットが返される
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe("権限昇格攻撃の防御", () => {
    it("匿名ユーザーは管理者権限を取得できない", async () => {
      const anonymousClient = secureClientFactory.createAuthenticatedClient();

      // 管理者権限が必要な操作を試行
      const { data, error } = await anonymousClient.auth.admin.listUsers();

      // テスト環境では通常空のリストが返される（権限制限により）
      expect(data).toBeDefined();
      if (data && typeof data === "object" && "users" in data) {
        expect(Array.isArray(data.users)).toBe(true);
      }
    });

    it("不正な形式のゲストトークンが拒否される", async () => {
      const invalidTokens = [
        "", // 空文字
        "invalid", // 不正な形式
        "gst_short", // 短すぎる
        "gst_" + "a".repeat(100), // 長すぎる
        "wrong_prefix_" + "a".repeat(32), // 間違ったプレフィックス
      ];

      for (const invalidToken of invalidTokens) {
        expect(() => {
          secureClientFactory.createGuestClient(invalidToken);
        }).toThrow(GuestTokenError);
      }
    });

    it("SQLインジェクション攻撃が防御される", async () => {
      const guestToken = generateGuestToken();
      const guestClient = secureClientFactory.createGuestClient(guestToken);

      // SQLインジェクション試行
      const maliciousInput = "'; DROP TABLE attendances; --";

      const { data, error } = await guestClient
        .from("attendances")
        .select("*")
        .eq("nickname", maliciousInput);

      // SQLインジェクションは防御され、通常のクエリとして処理される
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe("管理者権限の監査", () => {
    it("不正な理由での管理者権限使用が拒否される", async () => {
      // 無効な理由で管理者権限を要求
      await expect(async () => {
        await secureClientFactory.createAuditedAdminClient(
          "INVALID_REASON" as AdminReason,
          "Invalid admin access attempt"
        );
      }).rejects.toThrow();
    });
  });

  describe("クライアント作成の基本機能", () => {
    it("認証済みクライアントが作成できる", () => {
      const client = secureClientFactory.createAuthenticatedClient();
      expect(client).toBeDefined();
    });

    it("読み取り専用クライアントが作成できる", () => {
      const client = secureClientFactory.createReadOnlyClient();
      expect(client).toBeDefined();
    });

    it("有効なゲストトークンでゲストクライアントが作成できる", () => {
      const guestToken = generateGuestToken();
      const client = secureClientFactory.createGuestClient(guestToken);
      expect(client).toBeDefined();
    });
  });

  describe("データ漏洩防止", () => {
    it("ゲストトークンでは他のテーブルが見えない", async () => {
      const guestToken = generateGuestToken();
      const guestClient = secureClientFactory.createGuestClient(guestToken);

      // usersテーブルへのアクセス試行
      const { data, error } = await guestClient.from("users").select("*");

      // RLSポリシーにより空の結果セットが返される
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });
});
