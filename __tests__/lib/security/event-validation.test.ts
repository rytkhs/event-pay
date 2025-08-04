/**
 * EventPay イベント情報バリデーション テスト
 * 
 * checkCanModifyメソッドの型安全性とバリデーションロジックをテスト
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  RLSBasedGuestValidator,
  getGuestTokenValidator
} from '@/lib/security/secure-client-factory.impl';

// プライベートメソッドにアクセスするためのテスト用ヘルパー
class TestableGuestValidator extends RLSBasedGuestValidator {
  public testCheckCanModify(event: unknown): boolean {
    return (this as any).checkCanModify(event);
  }

  public testIsValidEventInfo(event: unknown): boolean {
    return (this as any).isValidEventInfo(event);
  }

  public testIsValidDateString(dateStr: string): boolean {
    return (this as any).isValidDateString(dateStr);
  }
}

describe('イベント情報バリデーション', () => {
  let validator: TestableGuestValidator;

  beforeEach(() => {
    // 環境変数を設定
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

    validator = new TestableGuestValidator();
  });

  describe('isValidEventInfo 型ガード', () => {
    it('有効なイベント情報を正しく識別するべき', () => {
      const validEvents = [
        {
          id: 'event-123',
          date: '2024-12-31T23:59:59.000Z',
          registration_deadline: '2024-12-30T23:59:59.000Z',
          status: 'active'
        },
        {
          id: 'event-456',
          date: '2024-12-31T23:59:59.000Z',
          registration_deadline: null,
          status: 'active'
        },
        {
          id: 'event-789',
          date: '2024-12-31T23:59:59.000Z',
          status: 'active'
          // registration_deadline は存在しない
        }
      ];

      validEvents.forEach(event => {
        expect(validator.testIsValidEventInfo(event)).toBe(true);
      });
    });

    it('無効なイベント情報を正しく識別するべき', () => {
      const invalidEvents = [
        null,
        undefined,
        'string',
        123,
        [],
        {},
        { id: 'event-123' }, // date, status が不足
        { id: 'event-123', date: '2024-12-31T23:59:59.000Z' }, // status が不足
        { id: 'event-123', status: 'active' }, // date が不足
        { id: 123, date: '2024-12-31T23:59:59.000Z', status: 'active' }, // id が文字列でない
        { id: 'event-123', date: 123, status: 'active' }, // date が文字列でない
        { id: 'event-123', date: '2024-12-31T23:59:59.000Z', status: 123 }, // status が文字列でない
        {
          id: 'event-123',
          date: '2024-12-31T23:59:59.000Z',
          status: 'active',
          registration_deadline: 123 // registration_deadline が文字列でもnullでもない
        }
      ];

      invalidEvents.forEach(event => {
        expect(validator.testIsValidEventInfo(event)).toBe(false);
      });
    });
  });

  describe('isValidDateString 日付バリデーション', () => {
    it('有効なISO 8601日付文字列を正しく識別するべき', () => {
      const validDates = [
        '2024-12-31T23:59:59.000Z',
        '2024-01-01T00:00:00.000Z',
        '2024-06-15T12:30:45.123Z'
      ];

      validDates.forEach(date => {
        expect(validator.testIsValidDateString(date)).toBe(true);
      });
    });

    it('無効な日付文字列を正しく識別するべき', () => {
      const invalidDates = [
        '',
        'invalid-date',
        '2024-12-31',
        '2024-12-31 23:59:59',
        '2024-13-01T00:00:00.000Z', // 無効な月
        '2024-12-32T00:00:00.000Z', // 無効な日
        '2024-12-31T25:00:00.000Z', // 無効な時間
        'Mon Dec 31 2024 23:59:59 GMT+0000 (UTC)' // 異なる形式
      ];

      invalidDates.forEach(date => {
        expect(validator.testIsValidDateString(date)).toBe(false);
      });
    });
  });

  describe('checkCanModify ビジネスロジック', () => {
    beforeEach(() => {
      // コンソール警告をモック
      jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('有効なイベント情報で正しい判定を行うべき', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 86400000); // 1日後
      const nearFutureDate = new Date(now.getTime() + 43200000); // 12時間後

      // 変更可能なケース
      const modifiableEvent = {
        id: 'event-123',
        date: futureDate.toISOString(),
        registration_deadline: nearFutureDate.toISOString(),
        status: 'active'
      };

      expect(validator.testCheckCanModify(modifiableEvent)).toBe(true);
    });

    it('過去のイベントは変更不可と判定するべき', () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 86400000); // 1日前

      const pastEvent = {
        id: 'event-123',
        date: pastDate.toISOString(),
        registration_deadline: null,
        status: 'active'
      };

      expect(validator.testCheckCanModify(pastEvent)).toBe(false);
    });

    it('登録締切を過ぎたイベントは変更不可と判定するべき', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 86400000); // 1日後
      const pastDeadline = new Date(now.getTime() - 3600000); // 1時間前

      const expiredEvent = {
        id: 'event-123',
        date: futureDate.toISOString(),
        registration_deadline: pastDeadline.toISOString(),
        status: 'active'
      };

      expect(validator.testCheckCanModify(expiredEvent)).toBe(false);
    });

    it('非アクティブなイベントは変更不可と判定するべき', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 86400000); // 1日後

      const inactiveEvent = {
        id: 'event-123',
        date: futureDate.toISOString(),
        registration_deadline: null,
        status: 'cancelled'
      };

      expect(validator.testCheckCanModify(inactiveEvent)).toBe(false);
    });

    it('無効なイベント情報は変更不可と判定し警告を出力するべき', () => {
      const consoleSpy = jest.spyOn(console, 'warn');

      const invalidEvents = [
        null,
        undefined,
        { id: 'event-123' }, // 必須フィールド不足
        {
          id: 'event-123',
          date: 'invalid-date',
          status: 'active'
        } // 無効な日付形式
      ];

      invalidEvents.forEach(event => {
        expect(validator.testCheckCanModify(event)).toBe(false);
      });

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('登録締切なしのイベントは正しく処理されるべき', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 86400000); // 1日後

      const eventWithoutDeadline = {
        id: 'event-123',
        date: futureDate.toISOString(),
        status: 'active'
        // registration_deadline なし
      };

      expect(validator.testCheckCanModify(eventWithoutDeadline)).toBe(true);

      const eventWithNullDeadline = {
        id: 'event-123',
        date: futureDate.toISOString(),
        registration_deadline: null,
        status: 'active'
      };

      expect(validator.testCheckCanModify(eventWithNullDeadline)).toBe(true);
    });
  });

  describe('エラーハンドリング', () => {
    it('無効な日付形式で適切な警告を出力するべき', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      const eventWithInvalidDate = {
        id: 'event-123',
        date: 'invalid-date-format',
        status: 'active'
      };

      const result = validator.testCheckCanModify(eventWithInvalidDate);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Invalid event date format:',
        'invalid-date-format'
      );

      consoleSpy.mockRestore();
    });

    it('無効な登録締切形式で適切な警告を出力するべき', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      const now = new Date();
      const futureDate = new Date(now.getTime() + 86400000);

      const eventWithInvalidDeadline = {
        id: 'event-123',
        date: futureDate.toISOString(),
        registration_deadline: 'invalid-deadline-format',
        status: 'active'
      };

      const result = validator.testCheckCanModify(eventWithInvalidDeadline);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Invalid registration deadline format:',
        'invalid-deadline-format'
      );

      consoleSpy.mockRestore();
    });
  });
});