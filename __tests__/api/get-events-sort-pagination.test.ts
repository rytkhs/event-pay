/**
 * @jest-environment node
 */

import { getEventsAction } from '@/app/events/actions/get-events';

// タイムゾーンユーティリティのモック
jest.mock('@/lib/utils/timezone', () => ({
  convertJstDateToUtcRange: jest.fn().mockImplementation((dateString) => ({
    startOfDay: new Date(dateString + 'T00:00:00.000Z'),
    endOfDay: new Date(dateString + 'T23:59:59.999Z'),
  })),
}));

// モック関数の作成
const mockSupabase = {
  auth: {
    getUser: jest.fn(),
  },
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  gt: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
};

// Supabaseクライアントをモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}));

describe('getEventsAction - サーバーサイドソートとページネーションテスト', () => {
  const mockUser = { id: 'test-user-id' };
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // 認証成功をモック
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
  });

  describe('ソートパラメータの適用確認', () => {
    test('日付降順ソートが正しく適用されること', async () => {
      // モックデータ
      const mockEvents = [
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
      ];

      // 総件数とイベントデータの並行取得をモック
      const mockCountPromise = Promise.resolve({
        count: 1,
        error: null,
      });

      const mockEventsPromise = Promise.resolve({
        data: mockEvents,
        error: null,
      });

      // Promise.allの呼び出しをモック
      jest.spyOn(Promise, 'all').mockResolvedValue([
        mockCountPromise,
        mockEventsPromise,
      ]);

      const result = await getEventsAction({
        sortBy: 'date',
        sortOrder: 'desc',
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.totalCount).toBe(1);
        expect(result.hasMore).toBe(false);
      }

      // ソートが適用されていることを確認
      expect(mockSupabase.order).toHaveBeenCalledWith('date', { ascending: false });
    });

    test('料金昇順ソートが正しく適用されること', async () => {
      const mockCountPromise = Promise.resolve({
        count: 0,
        error: null,
      });

      const mockEventsPromise = Promise.resolve({
        data: [],
        error: null,
      });

      jest.spyOn(Promise, 'all').mockResolvedValue([
        mockCountPromise,
        mockEventsPromise,
      ]);

      await getEventsAction({
        sortBy: 'fee',
        sortOrder: 'asc',
        limit: 50,
        offset: 0,
      });

      expect(mockSupabase.order).toHaveBeenCalledWith('fee', { ascending: true });
    });

    test('作成日時降順ソートが正しく適用されること', async () => {
      const mockCountPromise = Promise.resolve({
        count: 0,
        error: null,
      });

      const mockEventsPromise = Promise.resolve({
        data: [],
        error: null,
      });

      jest.spyOn(Promise, 'all').mockResolvedValue([
        mockCountPromise,
        mockEventsPromise,
      ]);

      await getEventsAction({
        sortBy: 'created_at',
        sortOrder: 'desc',
        limit: 50,
        offset: 0,
      });

      expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    test('参加者数ソート時は全データを取得してクライアントサイドでソート・ページネーションされること', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          title: 'イベント1',
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
      ];

      const mockCountPromise = Promise.resolve({
        count: 3,
        error: null,
      });

      const mockEventsPromise = Promise.resolve({
        data: mockEvents,
        error: null,
      });

      jest.spyOn(Promise, 'all').mockResolvedValue([
        mockCountPromise,
        mockEventsPromise,
      ]);

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
        expect(result.data[0].attendances_count).toBe(10); // event-2
        expect(result.data[1].attendances_count).toBe(5);  // event-1
        expect(result.totalCount).toBe(3);
        expect(result.hasMore).toBe(true);
      }

      // 参加者数ソートの場合はidでソートされる（全データ取得のため）
      expect(mockSupabase.order).toHaveBeenCalledWith('id');
    });
  });

  describe('ページネーション', () => {
    test('ページネーション境界での整合性確認 - 正しい範囲でデータが取得されること', async () => {
      const mockCountPromise = Promise.resolve({
        count: 60,
        error: null,
      });

      const mockEventsPromise = Promise.resolve({
        data: [],
        error: null,
      });

      jest.spyOn(Promise, 'all').mockResolvedValue([
        mockCountPromise,
        mockEventsPromise,
      ]);

      const result = await getEventsAction({
        sortBy: 'date',
        sortOrder: 'asc',
        limit: 50,
        offset: 50,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.totalCount).toBe(60);
        expect(result.hasMore).toBe(false); // offset 50 + limit 50 = 100 > totalCount 60
      }

      // 正しい範囲でページネーションが実行されていることを確認
      expect(mockSupabase.range).toHaveBeenCalledWith(50, 99);
    });
  });

  describe('エラーケース', () => {
    /*
    test('無効なソート項目を指定した場合、エラーが返されること', async () => {
      const result = await getEventsAction({
        sortBy: 'invalid_field' as any,
        sortOrder: 'asc',
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('sortBy');
    });
    */

    /*
    test('無効なソート順序を指定した場合、エラーが返されること', async () => {
      const result = await getEventsAction({
        sortBy: 'date',
        sortOrder: 'invalid_order' as any,
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('sortOrder');
    });
    */
  });
});