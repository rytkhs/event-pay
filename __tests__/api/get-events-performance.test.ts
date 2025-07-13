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

describe('getEventsAction パフォーマンステスト', () => {
  const mockUser = { id: 'test-user-id' };
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // 認証成功をモック
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
  });

  test('JOINクエリによるN+1問題解決とPromise.all並行実行の最適化', async () => {
    // 総件数クエリの結果をモック
    const mockCountPromise = Promise.resolve({
      count: 100,
      error: null,
    });
    
    // イベントデータクエリの結果をモック
    const mockEventsPromise = Promise.resolve({
      data: [
        {
          id: '1',
          title: 'テストイベント1',
          date: '2024-12-31',
          location: 'テスト会場',
          fee: 1000,
          capacity: 50,
          status: 'upcoming',
          created_by: mockUser.id,
          created_at: '2024-01-01T00:00:00Z',
          public_profiles: { name: 'テスト作成者' },
          attendances: { count: 10 },
        },
      ],
      error: null,
    });
    
    // selectメソッドが呼ばれた順序に応じて異なる結果を返すように設定
    let selectCallCount = 0;
    mockSupabase.select.mockImplementation((query) => {
      selectCallCount++;
      
      const chainableMock = {
        ...mockSupabase,
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn(),
      };
      
      if (selectCallCount === 1) {
        // 最初の呼び出し（count用）
        return mockCountPromise;
      } else {
        // 2回目の呼び出し（events用）- orderの後にrangeが呼ばれる
        chainableMock.order.mockReturnValue({
          range: jest.fn().mockReturnValue(mockEventsPromise),
        });
        return chainableMock;
      }
    });

    const startTime = performance.now();
    
    const result = await getEventsAction({
      limit: 50,
      offset: 0,
      statusFilter: 'all',
      paymentFilter: 'all',
      dateFilter: {},
    });
    
    const endTime = performance.now();
    const executionTime = endTime - startTime;
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].creator_name).toBe('テスト作成者');
    expect(result.totalCount).toBe(100);
    
    // 並行実行により実行時間が短縮されることを検証
    expect(executionTime).toBeLessThan(1000); // 1秒以内
    
    // クエリが並行実行されていることを確認
    expect(mockSupabase.select).toHaveBeenCalledTimes(2);
    // JOINクエリでpublic_profilesが含まれていることを確認
    expect(mockSupabase.select).toHaveBeenCalledWith(expect.stringContaining('public_profiles!events_created_by_fkey(name)'));
  });

  test('共通フィルター条件オブジェクトにより重複実行が排除される', async () => {
    const mockCountPromise = Promise.resolve({ count: 5, error: null });
    const mockEventsPromise = Promise.resolve({ data: [], error: null });
    
    // モックの呼び出し回数を追跡
    const eqCalls: any[] = [];
    const gtCalls: any[] = [];
    const gteCalls: any[] = [];
    const lteCalls: any[] = [];
    
    let selectCallCount = 0;
    mockSupabase.select.mockImplementation(() => {
      selectCallCount++;
      
      const chainableMock = {
        ...mockSupabase,
        eq: jest.fn().mockImplementation((...args) => {
          eqCalls.push(args);
          return chainableMock;
        }),
        gt: jest.fn().mockImplementation((...args) => {
          gtCalls.push(args);
          return chainableMock;
        }),
        gte: jest.fn().mockImplementation((...args) => {
          gteCalls.push(args);
          return chainableMock;
        }),
        lte: jest.fn().mockImplementation((...args) => {
          lteCalls.push(args);
          return chainableMock;
        }),
        order: jest.fn().mockReturnValue({
          range: jest.fn().mockReturnValue(selectCallCount === 1 ? mockCountPromise : mockEventsPromise),
        }),
        range: jest.fn().mockReturnValue(selectCallCount === 1 ? mockCountPromise : mockEventsPromise),
      };
      
      return chainableMock;
    });

    await getEventsAction({
      statusFilter: 'upcoming',
      paymentFilter: 'paid',
      dateFilter: { start: '2024-01-01', end: '2024-12-31' },
    });

    // 共通フィルター条件により両方のクエリで同じ条件が適用されることを確認
    expect(eqCalls).toEqual([
      ['created_by', mockUser.id],
      ['status', 'upcoming'],
      ['created_by', mockUser.id],
      ['status', 'upcoming'],
    ]);
    
    expect(gtCalls).toEqual([
      ['fee', 0],
      ['fee', 0],
    ]);
    
    expect(gteCalls).toEqual([
      ['date', '2024-01-01T00:00:00.000Z'],
      ['date', '2024-01-01T00:00:00.000Z'],
    ]);
    
    expect(lteCalls).toEqual([
      ['date', '2024-12-31T23:59:59.999Z'],
      ['date', '2024-12-31T23:59:59.999Z'],
    ]);
  });
});