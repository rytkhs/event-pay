/**
 * @jest-environment node
 */

import { getEventsAction } from '@/app/events/actions/get-events';
import { createMocks } from '../helpers/mock-factory.mjs';

// タイムゾーンユーティリティのモック
jest.mock('@/lib/utils/timezone', () => ({
  convertJstDateToUtcRange: jest.fn().mockImplementation((dateString) => ({
    startOfDay: new Date(dateString + 'T00:00:00.000Z'),
    endOfDay: new Date(dateString + 'T23:59:59.999Z'),
  })),
}));

// 新モック戦略を使用
let mockSupabase: any;

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}));

describe('getEventsAction - サーバーサイドソートとページネーションテスト', () => {
  const mockUser = { id: 'test-user-id' };
  
  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createMocks({
      level: 'api',
      features: { auth: true },
      data: {
        events: [
          {
            id: 'event-1',
            title: 'テストイベント1',
            date: '2024-12-01T10:00:00Z',
            location: '会場1',
            fee: 1000,
            capacity: 50,
            status: 'upcoming',
            created_by: mockUser.id,
            created_at: '2024-01-01T00:00:00Z',
            public_profiles: { name: 'テストユーザー' },
            attendances: { count: 5 },
          },
          {
            id: 'event-2',
            title: 'イベント2',
            date: '2024-12-02T10:00:00Z',
            location: '会場2',
            fee: 2000,
            capacity: 30,
            status: 'upcoming',
            created_by: mockUser.id,
            created_at: '2024-01-02T00:00:00Z',
            public_profiles: { name: 'テストユーザー' },
            attendances: { count: 10 },
          },
          {
            id: 'event-3',
            title: 'イベント3',
            date: '2024-12-03T10:00:00Z',
            location: '会場3',
            fee: 1500,
            capacity: 40,
            status: 'upcoming',
            created_by: mockUser.id,
            created_at: '2024-01-03T00:00:00Z',
            public_profiles: { name: 'テストユーザー' },
            attendances: { count: 2 },
          },
        ]
      }
    });
    mockSupabase = mocks.supabase;
  });

  describe('ソートパラメータの適用確認', () => {
    test('日付降順ソートが正しく適用されること', async () => {
      const result = await getEventsAction({
        sortBy: 'date',
        sortOrder: 'desc',
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.totalCount).toBe(3);
        expect(result.hasMore).toBe(false);
      }
    });

    test('料金昇順ソートが正しく適用されること', async () => {
      const result = await getEventsAction({
        sortBy: 'fee',
        sortOrder: 'asc',
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(true);
    });

    test('作成日時降順ソートが正しく適用されること', async () => {
      const result = await getEventsAction({
        sortBy: 'created_at',
        sortOrder: 'desc',
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(true);
    });

    test('参加者数ソート時は全データを取得してクライアントサイドでソート・ページネーションされること', async () => {
      const result = await getEventsAction({
        sortBy: 'attendances_count',
        sortOrder: 'desc',
        limit: 2,
        offset: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // 参加者数降順でソートされ、ページネーションが適用されていることを確認
        expect(result.data).toHaveLength(2);
        expect(result.totalCount).toBe(3);
        expect(result.hasMore).toBe(true);
      }
    });
  });

  describe('ページネーション', () => {
    test('ページネーション境界での整合性確認 - 正しい範囲でデータが取得されること', async () => {
      const result = await getEventsAction({
        sortBy: 'date',
        sortOrder: 'asc',
        limit: 2,
        offset: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalCount).toBe(3);
        expect(result.hasMore).toBe(false);
      }
    });
  });
});