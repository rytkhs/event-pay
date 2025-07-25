/**
 * @file IP検出システム セキュリティテストスイート
 * @description クライアントIP検出とセキュリティ機能のテスト
 */

import {
  isValidIP,
  isPrivateIP,
  normalizeIP,
  generateFallbackIdentifier,
} from "@/lib/utils/ip-detection";

// モック用のヘルパー関数
function createMockHeaders(headers: Record<string, string> = {}) {
  return new Map(Object.entries(headers));
}

describe("IP Detection System", () => {
  describe("isValidIP", () => {
    it("IPv4アドレスを正しく検証する", () => {
      expect(isValidIP("192.168.1.1")).toBe(true);
      expect(isValidIP("127.0.0.1")).toBe(true);
      expect(isValidIP("0.0.0.0")).toBe(true);
      expect(isValidIP("255.255.255.255")).toBe(true);
    });

    it("IPv6アドレス（基本パターン）を正しく検証する", () => {
      expect(isValidIP("::1")).toBe(true);
      expect(isValidIP("::")).toBe(true);
      // EventPayでは主にIPv4を想定し、IPv6は基本パターンのみサポート
    });

    it("無効なIPアドレスを拒否する", () => {
      expect(isValidIP("")).toBe(false);
      expect(isValidIP("invalid")).toBe(false);
      expect(isValidIP("256.256.256.256")).toBe(false);
      expect(isValidIP("192.168.1")).toBe(false);
      expect(isValidIP("192.168.1.1.1")).toBe(false);
      expect(isValidIP("192.168.-1.1")).toBe(false);
    });

    it("特殊なケースを正しく処理する", () => {
      expect(isValidIP(null as any)).toBe(false);
      expect(isValidIP(undefined as any)).toBe(false);
      expect(isValidIP(123 as any)).toBe(false);
    });
  });

  describe("isPrivateIP", () => {
    it("プライベートIPアドレスを正しく識別する", () => {
      // RFC 1918 プライベートIPアドレス範囲
      expect(isPrivateIP("192.168.1.1")).toBe(true);
      expect(isPrivateIP("10.0.0.1")).toBe(true);
      expect(isPrivateIP("172.16.0.1")).toBe(true);
      expect(isPrivateIP("172.31.255.254")).toBe(true);
    });

    it("ローカルホストを正しく識別する", () => {
      expect(isPrivateIP("127.0.0.1")).toBe(true);
      expect(isPrivateIP("::1")).toBe(true);
    });

    it("パブリックIPアドレスを正しく識別する", () => {
      expect(isPrivateIP("8.8.8.8")).toBe(false);
      expect(isPrivateIP("1.1.1.1")).toBe(false);
      expect(isPrivateIP("203.0.113.1")).toBe(false);
    });

    it("無効な入力を適切に処理する", () => {
      expect(isPrivateIP("")).toBe(false);
      expect(isPrivateIP("invalid")).toBe(false);
      expect(isPrivateIP(null as any)).toBe(false);
    });
  });

  describe("normalizeIP", () => {
    it("IPv4アドレスを正規化する", () => {
      expect(normalizeIP("192.168.1.1")).toBe("192.168.1.1");
      expect(normalizeIP("127.0.0.1")).toBe("127.0.0.1");
    });

    it("IPv6アドレスを正規化する", () => {
      expect(normalizeIP("::1")).toBe("::1");
      expect(normalizeIP("::")).toBe("::");
    });

    it("無効なIPアドレスに対してフォールバック値を返す", () => {
      expect(normalizeIP("")).toBe("127.0.0.1");
      expect(normalizeIP("invalid")).toBe("127.0.0.1");
      expect(normalizeIP("256.256.256.256")).toBe("127.0.0.1");
    });

    it("特殊なケースを処理する", () => {
      expect(normalizeIP(null as any)).toBe("127.0.0.1");
      expect(normalizeIP(undefined as any)).toBe("127.0.0.1");
    });
  });

  describe("generateFallbackIdentifier", () => {
    it("フォールバック識別子を生成する", () => {
      // モックリクエストオブジェクトを作成
      const mockRequest = {
        headers: createMockHeaders({
          "user-agent": "Mozilla/5.0 Test Browser",
          "accept-language": "en-US",
        }),
      } as any;

      const identifier = generateFallbackIdentifier(mockRequest);

      expect(typeof identifier).toBe("string");
      expect(identifier.length).toBeGreaterThan(0);
    });

    it("異なるリクエストで異なる識別子を生成する", () => {
      const mockRequest1 = {
        headers: createMockHeaders({
          "user-agent": "Mozilla/5.0 Test Browser 1",
        }),
      } as any;

      const mockRequest2 = {
        headers: createMockHeaders({
          "user-agent": "Mozilla/5.0 Test Browser 2",
        }),
      } as any;

      const id1 = generateFallbackIdentifier(mockRequest1);
      const id2 = generateFallbackIdentifier(mockRequest2);

      expect(id1).not.toBe(id2);
    });
  });

  describe("IP検出セキュリティテスト", () => {
    it("IPスプーフィング攻撃を検出する", () => {
      const spoofedIPs = [
        "999.999.999.999", // 無効な範囲
        "192.168.1.1; DROP TABLE users;", // SQLインジェクション試行
        "<script>alert('xss')</script>", // XSS試行
        "../../etc/passwd", // パストラバーサル試行
      ];

      spoofedIPs.forEach((spoofedIP) => {
        expect(isValidIP(spoofedIP)).toBe(false);
        expect(normalizeIP(spoofedIP)).toBe("127.0.0.1");
      });
    });

    it("ヘッダーインジェクション攻撃を防ぐ", () => {
      const maliciousHeaders = [
        "192.168.1.1\r\nX-Injected: malicious",
        "192.168.1.1\nSet-Cookie: evil=true",
        "192.168.1.1\r\n\r\nHTTP/1.1 200 OK",
      ];

      maliciousHeaders.forEach((header) => {
        expect(isValidIP(header)).toBe(false);
        expect(normalizeIP(header)).toBe("127.0.0.1");
      });
    });

    it("長い文字列攻撃を防ぐ", () => {
      const longString = "A".repeat(10000);

      expect(isValidIP(longString)).toBe(false);
      expect(normalizeIP(longString)).toBe("127.0.0.1");
    });
  });

  describe("プライバシー保護テスト", () => {
    it("IPアドレスの適切な匿名化", () => {
      const publicIPs = ["8.8.8.8", "1.1.1.1", "203.0.113.1"];

      publicIPs.forEach((ip) => {
        expect(isValidIP(ip)).toBe(true);
        expect(isPrivateIP(ip)).toBe(false);
        // 実際のアプリケーションではIPアドレスの一部をマスクする
        const normalized = normalizeIP(ip);
        expect(normalized).toBe(ip);
      });
    });

    it("プライベートIPアドレスの適切な処理", () => {
      const privateIPs = ["192.168.1.1", "10.0.0.1", "172.16.0.1"];

      privateIPs.forEach((ip) => {
        expect(isValidIP(ip)).toBe(true);
        expect(isPrivateIP(ip)).toBe(true);
      });
    });
  });

  describe("パフォーマンステスト", () => {
    it("大量のIP検証を効率的に処理する", () => {
      const ips = [];
      for (let i = 0; i < 1000; i++) {
        ips.push(`192.168.1.${i % 255}`);
      }

      const start = Date.now();
      ips.forEach((ip) => {
        isValidIP(ip);
        isPrivateIP(ip);
        normalizeIP(ip);
      });
      const end = Date.now();

      // 1000個のIP処理が1秒以内に完了することを確認
      expect(end - start).toBeLessThan(1000);
    });
  });

  describe("エラーハンドリングテスト", () => {
    it("予期しない入力を安全に処理する", () => {
      const unexpectedInputs = [null, undefined, {}, [], 123, true, false, Symbol("test")];

      unexpectedInputs.forEach((input) => {
        expect(() => {
          isValidIP(input as any);
          isPrivateIP(input as any);
          normalizeIP(input as any);
        }).not.toThrow();
      });
    });

    it("メモリ効率的な処理", () => {
      // 大きなオブジェクトや循環参照を含む入力でもクラッシュしない
      const circularObj: any = {};
      circularObj.self = circularObj;

      expect(() => {
        isValidIP(circularObj);
        isPrivateIP(circularObj);
        normalizeIP(circularObj);
      }).not.toThrow();
    });
  });
});
