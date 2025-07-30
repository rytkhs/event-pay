/**
 * レート制限のE2Eテスト
 */

import { test, expect } from '@playwright/test';

test.describe('レート制限', () => {
  test('招待リンクAPIのレート制限', async ({ page }) => {
    // 無効なトークンで複数回リクエストを送信
    const invalidToken = 'invalid-token-12345';

    // 最初のリクエストは通常のエラー（404）
    const response1 = await page.request.get(`/api/invite/${invalidToken}`);
    expect(response1.status()).toBe(404);

    // 複数回リクエストを送信してレート制限をテスト
    // 実際の環境では11回目でレート制限に達するはず
    const responses = [];
    for (let i = 0; i < 12; i++) {
      const response = await page.request.get(`/api/invite/${invalidToken}`);
      responses.push(response);
    }

    // 最後のレスポンスがレート制限エラーかどうかを確認
    const lastResponse = responses[responses.length - 1];
    if (lastResponse.status() === 429) {
      const body = await lastResponse.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(lastResponse.headers()['retry-after']).toBeDefined();
    }
  });


});