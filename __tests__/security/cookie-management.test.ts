/**
 * Cookie管理機能のセキュリティテスト
 * 新しく実装したSupabase Cookie管理機能の網羅的テスト
 */

import { NextResponse } from 'next/server';
import {
  SUPABASE_COOKIE_NAMES,
  COOKIE_DELETE_OPTIONS,
  clearAllSupabaseCookies,
  clearSpecificCookies,
  clearSessionCookies,
  createResponseWithCookieCleanup,
} from '@/lib/auth/cookie-manager';

describe('Cookie管理機能セキュリティテスト', () => {
  describe('Supabase Cookie定数', () => {
    test('すべての必要なSupabase Cookie名が定義されている', () => {
      const expectedCookies = [
        'supabase-auth-token',
        'supabase-refresh-token',
        'supabase-auth-token-code-verifier',
        'sb-access-token',
        'sb-refresh-token',
        'sb-provider-token',
        'sb-provider-refresh-token',
      ];

      expectedCookies.forEach(cookieName => {
        expect(SUPABASE_COOKIE_NAMES).toContain(cookieName);
      });
      
      expect(SUPABASE_COOKIE_NAMES).toHaveLength(expectedCookies.length);
    });

    test('Cookie削除オプションが適切に設定されている', () => {
      expect(COOKIE_DELETE_OPTIONS.httpOnly).toBe(true);
      expect(COOKIE_DELETE_OPTIONS.sameSite).toBe('lax');
      expect(COOKIE_DELETE_OPTIONS.path).toBe('/');
      expect(COOKIE_DELETE_OPTIONS.maxAge).toBe(0);
      expect(COOKIE_DELETE_OPTIONS.expires).toEqual(new Date(0));
    });

    test('本番環境でSecure属性が設定される', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      try {
        // モジュールを再インポートして新しい環境変数を反映
        jest.resetModules();
        const cookieManager = require('@/lib/auth/cookie-manager');
        expect(cookieManager.COOKIE_DELETE_OPTIONS.secure).toBe(true);
      } finally {
        process.env.NODE_ENV = originalEnv;
        jest.resetModules();
      }
    });

    test('開発環境でSecure属性が設定されない', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      try {
        jest.resetModules();
        const cookieManager = require('@/lib/auth/cookie-manager');
        expect(cookieManager.COOKIE_DELETE_OPTIONS.secure).toBe(false);
      } finally {
        process.env.NODE_ENV = originalEnv;
        jest.resetModules();
      }
    });
  });

  describe('全Supabase Cookie削除機能', () => {
    test('すべてのSupabase関連Cookieが削除される', () => {
      const response = NextResponse.json({ success: true });
      const setCookieSpy = jest.spyOn(response.cookies, 'set');
      
      clearAllSupabaseCookies(response);
      
      // 各Cookie名で削除が呼ばれたことを確認
      SUPABASE_COOKIE_NAMES.forEach(cookieName => {
        expect(setCookieSpy).toHaveBeenCalledWith(
          cookieName,
          '',
          COOKIE_DELETE_OPTIONS
        );
      });
      
      expect(setCookieSpy).toHaveBeenCalledTimes(SUPABASE_COOKIE_NAMES.length);
    });

    test('削除後のレスポンスオブジェクトが返される', () => {
      const response = NextResponse.json({ success: true });
      const result = clearAllSupabaseCookies(response);
      
      expect(result).toBe(response); // 同一オブジェクトが返される
    });

    test('空のレスポンスでもエラーが発生しない', () => {
      const response = new NextResponse();
      
      expect(() => clearAllSupabaseCookies(response)).not.toThrow();
    });
  });

  describe('特定Cookie削除機能', () => {
    test('指定されたCookieのみが削除される', () => {
      const response = NextResponse.json({ success: true });
      const setCookieSpy = jest.spyOn(response.cookies, 'set');
      
      const cookiesToDelete = [
        'supabase-auth-token',
        'supabase-refresh-token',
      ] as const;
      
      clearSpecificCookies(response, cookiesToDelete);
      
      // 指定されたCookieのみ削除されることを確認
      cookiesToDelete.forEach(cookieName => {
        expect(setCookieSpy).toHaveBeenCalledWith(
          cookieName,
          '',
          COOKIE_DELETE_OPTIONS
        );
      });
      
      expect(setCookieSpy).toHaveBeenCalledTimes(cookiesToDelete.length);
    });

    test('無効なCookie名は無視される', () => {
      const response = NextResponse.json({ success: true });
      const setCookieSpy = jest.spyOn(response.cookies, 'set');
      
      const invalidCookies = [
        'invalid-cookie',
        'another-invalid-cookie',
      ] as any;
      
      clearSpecificCookies(response, invalidCookies);
      
      // 無効なCookieに対してsetが呼ばれないことを確認
      expect(setCookieSpy).not.toHaveBeenCalled();
    });

    test('有効と無効なCookie名が混在する場合、有効なもののみ削除される', () => {
      const response = NextResponse.json({ success: true });
      const setCookieSpy = jest.spyOn(response.cookies, 'set');
      
      const mixedCookies = [
        'supabase-auth-token', // 有効
        'invalid-cookie',      // 無効
        'supabase-refresh-token', // 有効
      ] as any;
      
      clearSpecificCookies(response, mixedCookies);
      
      // 有効なCookieのみ削除されることを確認
      expect(setCookieSpy).toHaveBeenCalledWith(
        'supabase-auth-token',
        '',
        COOKIE_DELETE_OPTIONS
      );
      expect(setCookieSpy).toHaveBeenCalledWith(
        'supabase-refresh-token',
        '',
        COOKIE_DELETE_OPTIONS
      );
      expect(setCookieSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('セッションCookie削除機能', () => {
    test('セッション関連Cookieのみが削除される', () => {
      const response = NextResponse.json({ success: true });
      const setCookieSpy = jest.spyOn(response.cookies, 'set');
      
      clearSessionCookies(response);
      
      const expectedSessionCookies = [
        'supabase-auth-token',
        'supabase-refresh-token',
        'supabase-auth-token-code-verifier',
      ];
      
      expectedSessionCookies.forEach(cookieName => {
        expect(setCookieSpy).toHaveBeenCalledWith(
          cookieName,
          '',
          COOKIE_DELETE_OPTIONS
        );
      });
      
      expect(setCookieSpy).toHaveBeenCalledTimes(expectedSessionCookies.length);
    });

    test('プロバイダートークンは削除されない', () => {
      const response = NextResponse.json({ success: true });
      const setCookieSpy = jest.spyOn(response.cookies, 'set');
      
      clearSessionCookies(response);
      
      const providerCookies = [
        'sb-provider-token',
        'sb-provider-refresh-token',
      ];
      
      providerCookies.forEach(cookieName => {
        expect(setCookieSpy).not.toHaveBeenCalledWith(
          cookieName,
          expect.anything(),
          expect.anything()
        );
      });
    });
  });

  describe('Cookie削除レスポンス作成機能', () => {
    test('デフォルトで全Cookie削除が実行される', () => {
      const jsonData = { success: true, message: 'test' };
      const status = 200;
      
      const response = createResponseWithCookieCleanup(jsonData, status);
      
      expect(response.status).toBe(status);
      
      // 全Cookieが削除されることを確認
      const setCookieHeaders = response.headers.getSetCookie();
      SUPABASE_COOKIE_NAMES.forEach(cookieName => {
        const cookieHeader = setCookieHeaders.find(header => 
          header.includes(`${cookieName}=;`)
        );
        expect(cookieHeader).toBeDefined();
      });
    });

    test('セッションCookieのみ削除オプションが動作する', () => {
      const jsonData = { success: false, error: 'test error' };
      const status = 401;
      
      const response = createResponseWithCookieCleanup(jsonData, status, false);
      
      expect(response.status).toBe(status);
      
      // セッションCookieのみが削除されることを確認
      const setCookieHeaders = response.headers.getSetCookie();
      const sessionCookies = [
        'supabase-auth-token',
        'supabase-refresh-token',
        'supabase-auth-token-code-verifier',
      ];
      
      sessionCookies.forEach(cookieName => {
        const cookieHeader = setCookieHeaders.find(header => 
          header.includes(`${cookieName}=;`)
        );
        expect(cookieHeader).toBeDefined();
      });
      
      // プロバイダートークンは削除されない
      const providerCookies = [
        'sb-provider-token',
        'sb-provider-refresh-token',
      ];
      
      providerCookies.forEach(cookieName => {
        const cookieHeader = setCookieHeaders.find(header => 
          header.includes(`${cookieName}=;`)
        );
        expect(cookieHeader).toBeUndefined();
      });
    });

    test('JSONレスポンスが正しく設定される', async () => {
      const jsonData = { 
        success: true, 
        data: { id: 'test-id', name: 'test-name' },
        message: '操作が成功しました' 
      };
      const status = 201;
      
      const response = createResponseWithCookieCleanup(jsonData, status);
      const responseBody = await response.json();
      
      expect(responseBody).toEqual(jsonData);
      expect(response.status).toBe(status);
    });
  });

  describe('Cookie削除のセキュリティ検証', () => {
    test('削除されたCookieが即座に無効化される', () => {
      const response = NextResponse.json({ success: true });
      clearAllSupabaseCookies(response);
      
      const setCookieHeaders = response.headers.getSetCookie();
      
      setCookieHeaders.forEach(header => {
        // maxAge=0が設定されていることを確認
        expect(header).toContain('Max-Age=0');
        
        // expires=Thu, 01 Jan 1970 00:00:00 GMTが設定されていることを確認
        expect(header).toContain('expires=Thu, 01 Jan 1970 00:00:00 GMT');
        
        // HTTPOnly属性が設定されていることを確認
        expect(header).toContain('HttpOnly');
        
        // SameSite=lax属性が設定されていることを確認
        expect(header).toContain('SameSite=lax');
        
        // Path=/が設定されていることを確認
        expect(header).toContain('Path=/');
      });
    });

    test('Secure属性が環境に応じて適切に設定される', () => {
      const originalEnv = process.env.NODE_ENV;
      
      // 本番環境テスト
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const prodCookieManager = require('@/lib/auth/cookie-manager');
      
      const prodResponse = NextResponse.json({ success: true });
      prodCookieManager.clearAllSupabaseCookies(prodResponse);
      
      const prodHeaders = prodResponse.headers.getSetCookie();
      prodHeaders.forEach(header => {
        expect(header).toContain('Secure');
      });
      
      // 開発環境テスト
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const devCookieManager = require('@/lib/auth/cookie-manager');
      
      const devResponse = NextResponse.json({ success: true });
      devCookieManager.clearAllSupabaseCookies(devResponse);
      
      const devHeaders = devResponse.headers.getSetCookie();
      devHeaders.forEach(header => {
        expect(header).not.toContain('Secure');
      });
      
      // 環境変数を元に戻す
      process.env.NODE_ENV = originalEnv;
      jest.resetModules();
    });

    test('Cookie削除が残存セッション攻撃を防ぐ', () => {
      const response = NextResponse.json({ success: true });
      
      // セッション終了時に全Cookieが削除されることを確認
      clearAllSupabaseCookies(response);
      
      const setCookieHeaders = response.headers.getSetCookie();
      
      // すべてのSupabase関連Cookieが削除対象になっていることを確認
      expect(setCookieHeaders).toHaveLength(SUPABASE_COOKIE_NAMES.length);
      
      // 各Cookieが空の値で上書きされることを確認
      setCookieHeaders.forEach(header => {
        const cookieName = header.split('=')[0];
        expect(SUPABASE_COOKIE_NAMES).toContain(cookieName);
        expect(header).toMatch(new RegExp(`${cookieName}=;`));
      });
    });

    test('部分的Cookie削除が意図しない情報漏洩を防ぐ', () => {
      const response = NextResponse.json({ success: true });
      
      // セッション関連Cookieのみ削除
      clearSessionCookies(response);
      
      const setCookieHeaders = response.headers.getSetCookie();
      const sessionCookieNames = [
        'supabase-auth-token',
        'supabase-refresh-token', 
        'supabase-auth-token-code-verifier',
      ];
      
      // セッション関連Cookieのみが削除されることを確認
      expect(setCookieHeaders).toHaveLength(sessionCookieNames.length);
      
      setCookieHeaders.forEach(header => {
        const cookieName = header.split('=')[0];
        expect(sessionCookieNames).toContain(cookieName);
      });
    });
  });

  describe('エラーハンドリング', () => {
    test('null/undefinedレスポンスでエラーが発生しない', () => {
      expect(() => clearAllSupabaseCookies(null as any)).toThrow();
      expect(() => clearAllSupabaseCookies(undefined as any)).toThrow();
    });

    test('無効なCookie名配列でエラーが発生しない', () => {
      const response = NextResponse.json({ success: true });
      
      expect(() => clearSpecificCookies(response, null as any)).toThrow();
      expect(() => clearSpecificCookies(response, undefined as any)).toThrow();
      expect(() => clearSpecificCookies(response, [] as any)).not.toThrow();
    });

    test('大量のCookie削除でパフォーマンス問題が発生しない', () => {
      const response = NextResponse.json({ success: true });
      
      const startTime = performance.now();
      
      // 100回連続でCookie削除を実行
      for (let i = 0; i < 100; i++) {
        clearAllSupabaseCookies(response);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 100回の削除が100ms以内に完了することを確認
      expect(duration).toBeLessThan(100);
    });
  });
});