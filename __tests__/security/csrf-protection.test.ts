/**
 * CSRF保護機能のセキュリティテスト
 * 新しく実装したCSRF保護ミドルウェアとトークン検証の網羅的テスト
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateCSRFToken,
  validateCSRFToken,
  isStateChangingRequest,
  getCSRFTokenFromRequest,
  setCSRFTokenCookie,
  createCSRFErrorResponse,
  CSRF_TOKEN_COOKIE_NAME,
  CSRF_TOKEN_HEADER_NAME,
} from '@/lib/security/csrf';

describe('CSRF保護機能セキュリティテスト', () => {
  describe('CSRFトークン生成・検証', () => {
    test('CSRFトークンが適切に生成される', () => {
      const token = generateCSRFToken();
      
      expect(token).toHaveLength(64); // 32バイト = 64文字のhex
      expect(token).toMatch(/^[0-9a-f]+$/); // 16進数のみ
      
      // 複数回生成して全て異なることを確認
      const tokens = Array.from({ length: 10 }, () => generateCSRFToken());
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(10); // 全て異なる
    });

    test('同一トークンペアが正しく検証される', () => {
      const token = generateCSRFToken();
      const isValid = validateCSRFToken(token, token);
      expect(isValid).toBe(true);
    });

    test('異なるトークンペアが拒否される', () => {
      const token1 = generateCSRFToken();
      const token2 = generateCSRFToken();
      const isValid = validateCSRFToken(token1, token2);
      expect(isValid).toBe(false);
    });

    test('無効なトークン形式が拒否される', () => {
      const validToken = generateCSRFToken();
      const invalidTokens = [
        '', // 空文字
        'invalid', // 短すぎる
        'x'.repeat(64), // 無効な文字
        null as any, // null
        undefined as any, // undefined
        '1234567890abcdef'.repeat(4).toUpperCase(), // 大文字（無効）
      ];

      invalidTokens.forEach(invalidToken => {
        const isValid = validateCSRFToken(invalidToken, validToken);
        expect(isValid).toBe(false);
      });
    });

    test('タイミング攻撃に対する保護確認', () => {
      const validToken = generateCSRFToken();
      const invalidToken = 'a'.repeat(64);
      
      // 複数回実行して時間を測定（大まかなチェック）
      const validations = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        validateCSRFToken(validToken, invalidToken);
        const end = performance.now();
        validations.push(end - start);
      }
      
      // 時間のばらつきが少ないことを確認（タイミング攻撃対策）
      const avgTime = validations.reduce((a, b) => a + b) / validations.length;
      const maxTime = Math.max(...validations);
      const minTime = Math.min(...validations);
      
      // 最大時間が平均時間の10倍未満であることを確認
      expect(maxTime).toBeLessThan(avgTime * 10);
    });
  });

  describe('状態変更リクエストの検出', () => {
    test('状態変更メソッドが正しく検出される', () => {
      const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

      stateChangingMethods.forEach(method => {
        const request = new NextRequest('http://localhost:3000/api/test', {
          method,
        });
        expect(isStateChangingRequest(request)).toBe(true);
      });

      safeMethods.forEach(method => {
        const request = new NextRequest('http://localhost:3000/api/test', {
          method,
        });
        expect(isStateChangingRequest(request)).toBe(false);
      });
    });

    test('メソッドの大文字小文字が正しく処理される', () => {
      const methods = ['post', 'Post', 'POST', 'pOsT'];
      
      methods.forEach(method => {
        const request = new NextRequest('http://localhost:3000/api/test', {
          method,
        });
        expect(isStateChangingRequest(request)).toBe(true);
      });
    });
  });

  describe('リクエストからのCSRFトークン取得', () => {
    test('ヘッダーからCSRFトークンが取得される', () => {
      const token = generateCSRFToken();
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          [CSRF_TOKEN_HEADER_NAME]: token,
        },
      });

      const { headerToken, cookieToken } = getCSRFTokenFromRequest(request);
      expect(headerToken).toBe(token);
      expect(cookieToken).toBeNull();
    });

    test('CookieからCSRFトークンが取得される', () => {
      const token = generateCSRFToken();
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          'Cookie': `${CSRF_TOKEN_COOKIE_NAME}=${token}`,
        },
      });

      const { headerToken, cookieToken } = getCSRFTokenFromRequest(request);
      expect(headerToken).toBeNull();
      expect(cookieToken).toBe(token);
    });

    test('ヘッダーとCookieの両方からトークンが取得される', () => {
      const headerToken = generateCSRFToken();
      const cookieToken = generateCSRFToken();
      
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: {
          [CSRF_TOKEN_HEADER_NAME]: headerToken,
          'Cookie': `${CSRF_TOKEN_COOKIE_NAME}=${cookieToken}`,
        },
      });

      const tokens = getCSRFTokenFromRequest(request);
      expect(tokens.headerToken).toBe(headerToken);
      expect(tokens.cookieToken).toBe(cookieToken);
    });

    test('トークンが存在しない場合nullが返される', () => {
      const request = new NextRequest('http://localhost:3000/api/test');
      const { headerToken, cookieToken } = getCSRFTokenFromRequest(request);
      
      expect(headerToken).toBeNull();
      expect(cookieToken).toBeNull();
    });
  });

  describe('CSRFトークンCookieの設定', () => {
    test('CSRFトークンCookieが適切に設定される', () => {
      const token = generateCSRFToken();
      const response = NextResponse.json({ success: true });
      
      setCSRFTokenCookie(response, token);
      
      const setCookieHeader = response.headers.get('Set-Cookie');
      expect(setCookieHeader).toContain(`${CSRF_TOKEN_COOKIE_NAME}=${token}`);
      expect(setCookieHeader).toContain('SameSite=strict');
      expect(setCookieHeader).toContain('Path=/');
    });

    test('本番環境でSecure属性が設定される', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      try {
        const token = generateCSRFToken();
        const response = NextResponse.json({ success: true });
        
        setCSRFTokenCookie(response, token);
        
        const setCookieHeader = response.headers.get('Set-Cookie');
        expect(setCookieHeader).toContain('Secure');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    test('開発環境でSecure属性が設定されない', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      try {
        const token = generateCSRFToken();
        const response = NextResponse.json({ success: true });
        
        setCSRFTokenCookie(response, token);
        
        const setCookieHeader = response.headers.get('Set-Cookie');
        expect(setCookieHeader).not.toContain('Secure');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('CSRFエラーレスポンス', () => {
    test('適切なCSRFエラーレスポンスが作成される', () => {
      const response = createCSRFErrorResponse();
      
      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    test('カスタムエラーメッセージが設定される', async () => {
      const customMessage = 'カスタムCSRFエラーメッセージ';
      const response = createCSRFErrorResponse(customMessage);
      
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CSRF_TOKEN_INVALID');
      expect(body.error.message).toBe(customMessage);
    });

    test('デフォルトエラーメッセージが設定される', async () => {
      const response = createCSRFErrorResponse();
      
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CSRF_TOKEN_INVALID');
      expect(body.error.message).toBe('CSRF token validation failed');
    });
  });

  describe('CSRF攻撃シナリオテスト', () => {
    test('正当なCSRFトークンを持つリクエストが成功する', () => {
      const token = generateCSRFToken();
      
      // Double Submit Cookie パターンの検証
      const isValid = validateCSRFToken(token, token);
      expect(isValid).toBe(true);
    });

    test('異なるオリジンからの攻撃が防止される', () => {
      const legitimateToken = generateCSRFToken();
      const attackerToken = generateCSRFToken();
      
      // 攻撃者が異なるトークンを使用した場合
      const isValid = validateCSRFToken(attackerToken, legitimateToken);
      expect(isValid).toBe(false);
    });

    test('トークンが存在しない攻撃が防止される', () => {
      const token = generateCSRFToken();
      
      // ヘッダートークンなし
      const noHeaderValid = validateCSRFToken('', token);
      expect(noHeaderValid).toBe(false);
      
      // Cookieトークンなし
      const noCookieValid = validateCSRFToken(token, '');
      expect(noCookieValid).toBe(false);
      
      // 両方なし
      const noneValid = validateCSRFToken('', '');
      expect(noneValid).toBe(false);
    });

    test('トークンの予測攻撃が防止される', () => {
      const tokens = Array.from({ length: 1000 }, () => generateCSRFToken());
      
      // エントロピーチェック：同じトークンが生成されない
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(1000);
      
      // パターン分析：連続するトークンに明らかなパターンがない
      for (let i = 1; i < 10; i++) {
        const token1 = tokens[i - 1];
        const token2 = tokens[i];
        
        // ハミング距離が十分に大きい（50%以上異なる）
        let differences = 0;
        for (let j = 0; j < Math.min(token1.length, token2.length); j++) {
          if (token1[j] !== token2[j]) differences++;
        }
        const hammingDistance = differences / token1.length;
        expect(hammingDistance).toBeGreaterThan(0.3); // 30%以上異なる
      }
    });

    test('古いトークンによる攻撃が防止される', () => {
      const oldToken = generateCSRFToken();
      const newToken = generateCSRFToken();
      
      // 古いトークンで新しいセッションにアクセス試行
      const isOldValid = validateCSRFToken(oldToken, newToken);
      expect(isOldValid).toBe(false);
      
      // 新しいトークンのみが有効
      const isNewValid = validateCSRFToken(newToken, newToken);
      expect(isNewValid).toBe(true);
    });
  });

  describe('パフォーマンステスト', () => {
    test('大量のCSRFトークン検証がタイムアウトしない', () => {
      const validToken = generateCSRFToken();
      const startTime = performance.now();
      
      // 10000回の検証を実行
      for (let i = 0; i < 10000; i++) {
        validateCSRFToken(validToken, validToken);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 10000回の検証が1秒以内に完了することを確認
      expect(duration).toBeLessThan(1000);
    });

    test('CSRFトークン生成が高速である', () => {
      const startTime = performance.now();
      
      // 1000個のトークンを生成
      const tokens = Array.from({ length: 1000 }, () => generateCSRFToken());
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 1000個の生成が100ms以内に完了することを確認
      expect(duration).toBeLessThan(100);
      expect(tokens).toHaveLength(1000);
    });
  });
});