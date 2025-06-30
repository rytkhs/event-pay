import { NextRequest } from "next/server";
import {
  getClientIP,
  getClientIdentifier,
  getClientInfo,
  isValidIP,
  isPrivateIP,
  normalizeIP,
  generateFallbackIdentifier,
} from "@/lib/utils/ip-detection";

// NextRequestのモック作成ヘルパー
function createMockRequest(headers: Record<string, string> = {}, ip?: string): NextRequest {
  const url = "http://localhost:3000/api/test";
  const request = new NextRequest(url, {
    method: "POST",
    headers: new Headers(headers),
  });
  
  // request.ipをモック
  if (ip !== undefined) {
    Object.defineProperty(request, "ip", {
      value: ip,
      writable: true,
    });
  }
  
  return request;
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
      expect(isValidIP("test@example.com")).toBe(false);
    });

    it("null/undefinedを安全に処理する", () => {
      expect(isValidIP(null as any)).toBe(false);
      expect(isValidIP(undefined as any)).toBe(false);
      expect(isValidIP(123 as any)).toBe(false);
    });
  });

  describe("isPrivateIP", () => {
    it("プライベートIPを正しく識別する", () => {
      expect(isPrivateIP("127.0.0.1")).toBe(true);
      expect(isPrivateIP("10.0.0.1")).toBe(true);
      expect(isPrivateIP("172.16.0.1")).toBe(true);
      expect(isPrivateIP("192.168.1.1")).toBe(true);
      expect(isPrivateIP("169.254.1.1")).toBe(true);
      expect(isPrivateIP("::1")).toBe(true);
    });

    it("パブリックIPを正しく識別する", () => {
      expect(isPrivateIP("8.8.8.8")).toBe(false);
      expect(isPrivateIP("1.1.1.1")).toBe(false);
      expect(isPrivateIP("173.255.255.255")).toBe(false);
    });
  });

  describe("normalizeIP", () => {
    it("有効なIPアドレスを正規化する", () => {
      expect(normalizeIP("  192.168.1.1  ")).toBe("192.168.1.1");
      expect(normalizeIP("127.0.0.1")).toBe("127.0.0.1");
      expect(normalizeIP("::1")).toBe("::1");
    });

    it("無効なIPアドレスにフォールバックする", () => {
      expect(normalizeIP("invalid")).toBe("127.0.0.1");
      expect(normalizeIP("")).toBe("127.0.0.1");
      expect(normalizeIP("256.256.256.256")).toBe("127.0.0.1");
    });
  });

  describe("generateFallbackIdentifier", () => {
    it("一意な識別子を生成する", () => {
      const request1 = createMockRequest({
        "user-agent": "Mozilla/5.0 Test Browser",
        "accept-language": "en-US,en;q=0.9",
      });
      
      const request2 = createMockRequest({
        "user-agent": "Mozilla/5.0 Different Browser",
        "accept-language": "ja-JP,ja;q=0.9",
      });

      const id1 = generateFallbackIdentifier(request1);
      const id2 = generateFallbackIdentifier(request2);

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      expect(id2).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    });

    it("同じリクエスト情報で一定期間内は同じ識別子を生成する", () => {
      const headers = {
        "user-agent": "Mozilla/5.0 Test Browser",
        "accept-language": "en-US,en;q=0.9",
      };
      
      const request1 = createMockRequest(headers);
      const request2 = createMockRequest(headers);

      const id1 = generateFallbackIdentifier(request1);
      const id2 = generateFallbackIdentifier(request2);

      // 1秒以内なら同じ識別子
      expect(id1).toBe(id2);
    });
  });

  describe("getClientIP", () => {
    it("Vercelヘッダーを最優先で使用する", () => {
      const request = createMockRequest({
        "x-vercel-forwarded-for": "203.0.113.1, 192.168.1.1",
        "x-forwarded-for": "198.51.100.1",
        "cf-connecting-ip": "198.51.100.2",
      });

      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("x-forwarded-forから最初のIPを取得する", () => {
      const request = createMockRequest({
        "x-forwarded-for": "203.0.113.1, 192.168.1.1, 10.0.0.1",
      });

      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("CloudflareのIPを使用する", () => {
      const request = createMockRequest({
        "cf-connecting-ip": "203.0.113.1",
      });

      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("x-real-ipを使用する", () => {
      const request = createMockRequest({
        "x-real-ip": "203.0.113.1",
      });

      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("request.ipを最後の手段として使用する（Node.js Runtime）", () => {
      const request = createMockRequest({}, "203.0.113.1");

      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("プライベートIPを適切に処理する", () => {
      const request = createMockRequest({
        "x-forwarded-for": "192.168.1.1",
      });

      // プライベートIPは開発環境では受け入れられる
      const originalEnv = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });
      
      expect(getClientIP(request)).toBe("127.0.0.1");
      
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true });
    });

    it("開発環境でlocalhostを返す（全ヘッダー不在）", () => {
      const originalEnv = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });
      
      const request = createMockRequest({});
      expect(getClientIP(request)).toBe("127.0.0.1");
      
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true });
    });

    it("本番環境でフォールバック識別子を生成する（全ヘッダー不在）", () => {
      const originalEnv = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
      
      const request = createMockRequest({
        "user-agent": "Mozilla/5.0 Test Browser",
      });
      
      const ip = getClientIP(request);
      expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      expect(ip).not.toBe("127.0.0.1");
      
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true });
    });

    it("Edge Runtime環境をシミュレーション（request.ip = undefined）", () => {
      const request = createMockRequest({
        "x-forwarded-for": "203.0.113.1",
      }, undefined);

      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("無効なIPを含むヘッダーをスキップする", () => {
      const request = createMockRequest({
        "x-forwarded-for": "invalid-ip",
        "x-real-ip": "203.0.113.1",
      });

      expect(getClientIP(request)).toBe("203.0.113.1");
    });
  });

  describe("getClientIdentifier", () => {
    it("ユーザーIDが提供された場合はuser_prefixを使用する", () => {
      const request = createMockRequest({});
      const identifier = getClientIdentifier(request, "user123");
      
      expect(identifier).toBe("user_user123");
    });

    it("ユーザーIDのサニタイゼーションを行う", () => {
      const request = createMockRequest({});
      const identifier = getClientIdentifier(request, "user@123!#$");
      
      expect(identifier).toBe("user_user123");
    });

    it("ユーザーIDがない場合はIPベースの識別子を使用する", () => {
      const request = createMockRequest({
        "x-forwarded-for": "203.0.113.1",
      });
      
      const identifier = getClientIdentifier(request);
      expect(identifier).toBe("ip_203.0.113.1");
    });
  });

  describe("getClientInfo", () => {
    it("包括的なクライアント情報を取得する", () => {
      const request = createMockRequest({
        "x-forwarded-for": "203.0.113.1",
        "user-agent": "Mozilla/5.0 Test Browser",
        "accept-language": "en-US,en;q=0.9",
        "referer": "https://example.com",
        "x-real-ip": "203.0.113.2",
        "cf-connecting-ip": "203.0.113.3",
      });

      const info = getClientInfo(request);

      expect(info.ip).toBe("203.0.113.1");
      expect(info.userAgent).toBe("Mozilla/5.0 Test Browser");
      expect(info.acceptLanguage).toBe("en-US,en;q=0.9");
      expect(info.referer).toBe("https://example.com");
      expect(info.xForwardedFor).toBe("203.0.113.1");
      expect(info.xRealIp).toBe("203.0.113.2");
      expect(info.cfConnectingIp).toBe("203.0.113.3");
      expect(info.timestamp).toBeDefined();
    });

    it("不在のヘッダーを適切に処理する", () => {
      const request = createMockRequest({});
      const info = getClientInfo(request);

      expect(info.userAgent).toBe("unknown");
      expect(info.acceptLanguage).toBe("unknown");
      expect(info.referer).toBe("none");
      expect(info.xForwardedFor).toBe("none");
      expect(info.xRealIp).toBe("none");
      expect(info.cfConnectingIp).toBe("none");
    });
  });

  describe("セキュリティシナリオ", () => {
    it("IPスプーフィング攻撃に対する耐性をテストする", () => {
      const request = createMockRequest({
        "x-forwarded-for": "evil-ip, 203.0.113.1",
        "x-real-ip": "malicious-ip",
        "cf-connecting-ip": "203.0.113.2",
      });

      const ip = getClientIP(request);
      expect(ip).toBe("203.0.113.2"); // 有効なCloudflare IPが選択される
    });

    it("SQL インジェクション試行をブロックする", () => {
      const request = createMockRequest({
        "x-forwarded-for": "'; DROP TABLE users; --",
      });

      const ip = getClientIP(request);
      expect(ip).not.toContain("DROP");
      expect(ip).not.toContain(";");
    });

    it("異常に長いヘッダー値を処理する", () => {
      const longIP = "1".repeat(1000);
      const request = createMockRequest({
        "x-forwarded-for": longIP,
        "x-real-ip": "203.0.113.1",
      });

      const ip = getClientIP(request);
      expect(ip).toBe("203.0.113.1");
    });

    it("Unicode/特殊文字を含むヘッダーを処理する", () => {
      // 通常のHTTPヘッダーではUnicode文字は使用できないため、
      // 無効な文字を含む文字列での動作をテスト
      const request = createMockRequest({
        "x-forwarded-for": "invalid-unicode-ip",
        "x-real-ip": "203.0.113.1",
      });

      const ip = getClientIP(request);
      expect(ip).toBe("203.0.113.1");
    });
  });

  describe("Edge Runtime 互換性テスト", () => {
    it("request.ipがundefinedの場合でも正常に動作する", () => {
      const request = createMockRequest({
        "x-forwarded-for": "203.0.113.1",
      }, undefined);

      expect(() => getClientIP(request)).not.toThrow();
      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("全てのプロキシヘッダーが不在でrequest.ipもundefinedの場合", () => {
      const originalEnv = process.env.NODE_ENV;
      
      // 本番環境での動作をテスト
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
      
      const request = createMockRequest({
        "user-agent": "Mozilla/5.0 Test Browser",
      }, undefined);

      const ip = getClientIP(request);
      expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      expect(ip).not.toBe("127.0.0.1");
      
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true });
    });
  });

  describe("レート制限統合テスト", () => {
    it("異なるクライアントで異なる識別子を生成する", () => {
      const client1 = createMockRequest({
        "x-forwarded-for": "203.0.113.1",
      });
      
      const client2 = createMockRequest({
        "x-forwarded-for": "203.0.113.2",
      });

      expect(getClientIdentifier(client1)).not.toBe(getClientIdentifier(client2));
    });

    it("同じクライアントで一貫した識別子を生成する", () => {
      const headers = { "x-forwarded-for": "203.0.113.1" };
      const client1 = createMockRequest(headers);
      const client2 = createMockRequest(headers);

      expect(getClientIdentifier(client1)).toBe(getClientIdentifier(client2));
    });
  });
});