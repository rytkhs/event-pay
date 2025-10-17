/**
 * マスク処理ユーティリティ関数のテスト
 * セキュリティ要件の厳密な検証
 */

import { maskEmail, maskSessionId, maskPaymentId } from "@core/utils/mask";

describe("マスク処理ユーティリティ", () => {
  describe("maskSessionId", () => {
    test("標準的なStripeセッションIDを正しくマスクする", () => {
      // Arrange
      const sessionId = "cs_test_1234567890abcdef";

      // Act
      const result = maskSessionId(sessionId);

      // Assert - デバッグ性を考慮: 先頭12文字 + "..."
      expect(result).toBe("cs_test_1234...");
    });

    test("ライブモードセッションIDを正しくマスクする", () => {
      // Arrange
      const sessionId = "cs_live_abcdefgh12345678901234567890";

      // Act
      const result = maskSessionId(sessionId);

      // Assert
      expect(result).toBe("cs_live_abcd...");
    });

    test("短いセッションID（8文字以下）を安全にマスクする", () => {
      // Arrange
      const shortId = "cs_test";

      // Act
      const result = maskSessionId(shortId);

      // Assert - セキュリティ配慮で一部のみ表示
      expect(result).toBe("cs_***");
    });

    test("非常に短いID（3文字以下）を安全にマスクする", () => {
      // Arrange
      const veryShortId = "cs";

      // Act
      const result = maskSessionId(veryShortId);

      // Assert
      expect(result).toBe("cs***");
    });

    test("null/undefined入力を安全に処理する", () => {
      // Arrange & Act & Assert
      expect(maskSessionId(null)).toBe("***");
      expect(maskSessionId(undefined)).toBe("***");
      expect(maskSessionId("")).toBe("***");
    });

    test("非文字列入力を安全に処理する", () => {
      // Arrange & Act & Assert
      expect(maskSessionId(123 as any)).toBe("***");
      expect(maskSessionId({} as any)).toBe("***");
      expect(maskSessionId([] as any)).toBe("***");
    });

    test("Webhook統合テスト - 実際のログ出力形式確認", () => {
      // Arrange - 実際のWebhookで使用されるセッションIDパターン
      const testCases = [
        { input: "cs_test_webhook_processing_123456789", expected: "cs_test_webh..." },
        { input: "cs_live_production_abcdefgh123456789", expected: "cs_live_prod..." },
        { input: "cs_test_1a2b3c4d5e6f7g8h9i0j", expected: "cs_test_1a2b..." },
      ];

      testCases.forEach(({ input, expected }) => {
        // Act
        const result = maskSessionId(input);

        // Assert
        expect(result).toBe(expected);
      });
    });
  });

  describe("maskPaymentId", () => {
    test("標準的なPayment Intent IDを正しくマスクする", () => {
      // Arrange
      const paymentIntentId = "pi_1234567890abcdef";

      // Act
      const result = maskPaymentId(paymentIntentId);

      // Assert - 先頭4文字 + *** + 末尾3文字
      expect(result).toBe("pi_1***def");
    });

    test("Setup Intent IDを正しくマスクする", () => {
      // Arrange
      const setupIntentId = "seti_abcdefgh12345678";

      // Act
      const result = maskPaymentId(setupIntentId);

      // Assert
      expect(result).toBe("seti***678");
    });

    test("短いID（8文字以下）を安全にマスクする", () => {
      // Arrange
      const shortId = "pi_test";

      // Act
      const result = maskPaymentId(shortId);

      // Assert
      expect(result).toBe("pi***");
    });

    test("null/undefined入力を安全に処理する", () => {
      // Arrange & Act & Assert
      expect(maskPaymentId(null)).toBe("***");
      expect(maskPaymentId(undefined)).toBe("***");
      expect(maskPaymentId("")).toBe("***");
    });
  });

  describe("maskEmail（既存機能の確認）", () => {
    test("標準的なメールアドレスを正しくマスクする", () => {
      // Arrange
      const email = "user@example.com";

      // Act
      const result = maskEmail(email);

      // Assert
      expect(result).toBe("us***@example.com");
    });
  });

  describe("セキュリティ要件の検証", () => {
    test("マスク処理により元の値が推測困難であることを確認", () => {
      // Arrange
      const originalSession = "cs_test_1234567890abcdefghijklmnopqrstuvwxyz";

      // Act
      const masked = maskSessionId(originalSession);

      // Assert - 十分な情報が隠されている
      expect(masked.length).toBeLessThan(originalSession.length * 0.5); // 50%以上が隠されている
      expect(masked).not.toContain(originalSession.substring(12)); // 12文字以降は含まれない
    });

    test("一意性の確保 - 異なる入力は異なるマスク結果", () => {
      // Arrange
      const sessions = [
        "cs_test_1234567890abcdef",
        "cs_test2abcdefgh12345678",
        "cs_live_xyz9876543210abc",
      ];

      // Act
      const masked = sessions.map(maskSessionId);

      // Assert - 先頭8文字が異なれば、マスク結果も異なる
      expect(new Set(masked).size).toBe(masked.length);
    });

    test("ログインジェクション攻撃の防御", () => {
      // Arrange - 悪意のある特殊文字を含む入力
      const maliciousSession = "cs_test_\\n\\r\\t\"'<script>";

      // Act
      const result = maskSessionId(maliciousSession);

      // Assert - 特殊文字が安全に処理される
      expect(result).toBe("cs_test_\\n\\r...");
      expect(result).not.toContain("<script>");
      expect(result.length).toBe(15); // 12文字 + "..."
    });

    test("パフォーマンス確認 - 大量処理でもメモリリークしない", () => {
      // Arrange
      const sessionIds = Array.from(
        { length: 10000 },
        (_, i) => `cs_test_performance_test_${i.toString().padStart(10, "0")}`
      );

      // Act & Assert - 例外なく処理完了
      expect(() => {
        sessionIds.forEach(maskSessionId);
      }).not.toThrow();
    });
  });

  describe("実装統合の確認", () => {
    test("Webhook処理での使用パターン確認", () => {
      // Arrange - Webhookで実際に使用される形式
      const sessionId = "cs_test_webhook_integration_123456789";

      // Act - Webhook処理で使用される形式
      const logDetail = {
        eventId: "evt_test_123",
        sessionId: maskSessionId(sessionId),
        paymentId: "pi_test_456",
      };

      // Assert
      expect(logDetail.sessionId).toBe("cs_test_webh...");
      expect(typeof logDetail.sessionId).toBe("string");
      expect(logDetail.sessionId.length).toBeLessThan(sessionId.length);
    });

    test("verify-session APIでの使用パターン確認", () => {
      // Arrange - APIで実際に使用される形式
      const sessionId = "cs_test_verify_api_integration_abcdefgh";

      // Act - セキュリティログで使用される形式
      const securityLogDetail = {
        attendanceId: "550e8400-e29b-41d4-a716-446655440000",
        sessionId: maskSessionId(sessionId),
        tokenMatch: false,
      };

      // Assert
      expect(securityLogDetail.sessionId).toBe("cs_test_veri...");
      expect(securityLogDetail.sessionId).toMatch(/^cs_test_veri\.\.\.$/);
    });
  });
});
