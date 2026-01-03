/**
 * CSP モジュールのテスト
 */
import { describe, test, expect } from "@jest/globals";

import { buildCsp, ALLOWED_ORIGINS } from "../../../../core/security/csp";

describe("buildCsp", () => {
  describe("静的ページモード", () => {
    test("静的モードで適切な'unsafe-inline'が含まれる", () => {
      const csp = buildCsp({ mode: "static" });

      // nonceが含まれないことを確認
      expect(csp).not.toContain("nonce-");
      // script-src と style-src-elem に 'unsafe-inline' が含まれることを確認
      // (Next.jsのハイドレーションや動的スタイル注入に必要)
      const scriptSrc = csp.split(";").find((s) => s.trim().startsWith("script-src "));
      const styleSrcElem = csp.split(";").find((s) => s.trim().startsWith("style-src-elem "));
      expect(scriptSrc).toContain("'unsafe-inline'");
      expect(styleSrcElem).toContain("'unsafe-inline'");
      // 基本的なディレクティブが含まれることを確認
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    test("開発環境でローカルSupabaseが許可される", () => {
      const csp = buildCsp({ mode: "static", isDev: true });

      expect(csp).toContain("http://127.0.0.1:54321");
    });

    test("本番環境でローカルSupabaseが許可されない", () => {
      const csp = buildCsp({ mode: "static", isDev: false });

      expect(csp).not.toContain("http://127.0.0.1:54321");
    });
  });

  describe("動的ページモード", () => {
    test("nonce付きでCSPが生成される (script-srcのみ)", () => {
      const nonce = "test-nonce-123";
      const csp = buildCsp({ mode: "dynamic", nonce });

      // script-src に nonce が含まれることを確認
      expect(csp).toContain(`script-src 'self' 'nonce-${nonce}'`);
      // style-src-elem には nonce が含まれず 'unsafe-inline' が含まれることを確認
      const styleSrcElem = csp.split(";").find((s) => s.trim().startsWith("style-src-elem "));
      expect(styleSrcElem).not.toContain(`'nonce-${nonce}'`);
      expect(styleSrcElem).toContain("'unsafe-inline'");

      // strict-dynamicが含まれることを確認
      expect(csp).toContain("'strict-dynamic'");
    });

    test("nonceがnullの場合、静的モードと同じ挙動", () => {
      const csp = buildCsp({ mode: "dynamic", nonce: null });

      expect(csp).not.toContain("nonce-");
      expect(csp).not.toContain("strict-dynamic");
    });
  });

  describe("共通ディレクティブ", () => {
    test("Stripeドメインが許可される", () => {
      const csp = buildCsp({ mode: "static" });

      ALLOWED_ORIGINS.stripeScripts.forEach((origin) => {
        expect(csp).toContain(origin);
      });
    });

    test("Supabaseドメインが許可される", () => {
      const csp = buildCsp({ mode: "static" });

      ALLOWED_ORIGINS.supabase.forEach((origin) => {
        expect(csp).toContain(origin);
      });
    });

    test("Google Fontsが許可される", () => {
      const csp = buildCsp({ mode: "static" });

      expect(csp).toContain("https://fonts.googleapis.com");
      expect(csp).toContain("https://fonts.gstatic.com");
    });

    test("Google Mapsがscript-srcに含まれる", () => {
      const csp = buildCsp({ mode: "static" });

      expect(csp).toContain("https://maps.googleapis.com");
    });

    test("レポート設定が含まれる", () => {
      const csp = buildCsp({ mode: "static" });

      expect(csp).toContain("report-uri /api/csp-report");
      expect(csp).toContain("report-to csp-endpoint");
    });

    test("upgrade-insecure-requestsが含まれる", () => {
      const csp = buildCsp({ mode: "static" });

      expect(csp).toContain("upgrade-insecure-requests");
    });
  });
});
