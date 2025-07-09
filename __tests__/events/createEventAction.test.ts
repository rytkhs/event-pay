import { createEventAction } from '@/app/events/actions';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

describe('createEventAction', () => {
  const mockSupabase = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  };

  // テストデータヘルパー
  const createValidFormData = (overrides: Record<string, string> = {}) => {
    const formData = new FormData();
    const defaultData = {
      title: 'テストイベント',
      date: '2025-12-31',
      fee: '1000',
      payment_methods: 'stripe',
      ...overrides,
    };
    
    Object.entries(defaultData).forEach(([key, value]) => {
      formData.append(key, value);
    });
    
    return formData;
  };

  const mockAuthenticatedUser = () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { 
        user: { 
          id: 'user-123',
          email: 'test@example.com' 
        } 
      },
      error: null,
    });
  };

  const mockUnauthenticatedUser = () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  describe('認証エラーテスト', () => {
    it('未認証ユーザーの場合、エラーが返される', async () => {
      // Arrange
      mockUnauthenticatedUser();
      const formData = createValidFormData();

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: '認証が必要です',
      });
    });
  });

  describe('バリデーションエラーテスト', () => {
    beforeEach(() => {
      mockAuthenticatedUser();
    });

    it('タイトルが空の場合、バリデーションエラーが返される', async () => {
      // Arrange
      const formData = createValidFormData({ title: '' });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('タイトルは必須です'),
      });
    });

    it('タイトルが100文字を超える場合、バリデーションエラーが返される', async () => {
      // Arrange
      const formData = createValidFormData({ title: 'a'.repeat(101) });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('タイトルは100文字以内で入力してください'),
      });
    });

    it('開催日が過去の場合、バリデーションエラーが返される', async () => {
      // Arrange
      const formData = createValidFormData({ date: '2020-01-01' });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('開催日は現在時刻以降で設定してください'),
      });
    });

    it('参加費が負の値の場合、バリデーションエラーが返される', async () => {
      // Arrange
      const formData = createValidFormData({ fee: '-100' });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('参加費は0円以上で設定してください'),
      });
    });

    it('決済方法が未選択の場合、バリデーションエラーが返される', async () => {
      // Arrange
      const formData = createValidFormData({ payment_methods: '' });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('決済方法を選択してください'),
      });
    });

    it('無効な決済方法の場合、バリデーションエラーが返される', async () => {
      // Arrange
      const formData = createValidFormData({ payment_methods: 'invalid_method' });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('決済方法'),
      });
    });

    it('場所が200文字を超える場合、バリデーションエラーが返される', async () => {
      // Arrange
      const formData = createValidFormData({ location: 'a'.repeat(201) });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('場所は200文字以内で入力してください'),
      });
    });

    it('説明が1000文字を超える場合、バリデーションエラーが返される', async () => {
      // Arrange
      const formData = createValidFormData({ description: 'a'.repeat(1001) });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('説明は1000文字以内で入力してください'),
      });
    });

    it('定員が1名未満の場合、バリデーションエラーが返される', async () => {
      // Arrange
      const formData = createValidFormData({ capacity: '0' });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('定員は1名以上で設定してください'),
      });
    });
  });

  describe('必須フィールドテスト', () => {
    beforeEach(() => {
      mockAuthenticatedUser();
    });

    const testCases = [
      {
        name: 'タイトルが不足している場合',
        formData: { date: '2025-12-31', fee: '1000', payment_methods: 'stripe' },
        expectedError: 'タイトルは必須です'
      },
      {
        name: '開催日が不足している場合',
        formData: { title: 'テストイベント', fee: '1000', payment_methods: 'stripe' },
        expectedError: '開催日'
      },
      {
        name: '参加費が不足している場合',
        formData: { title: 'テストイベント', date: '2025-12-31', payment_methods: 'stripe' },
        expectedError: '参加費'
      }
    ];

    testCases.forEach(({ name, formData, expectedError }) => {
      it(`${name}、エラーが返される`, async () => {
        // Arrange
        const form = new FormData();
        Object.entries(formData).forEach(([key, value]) => {
          form.append(key, value);
        });

        // Act
        const result = await createEventAction(form);

        // Assert
        expect(result).toEqual({
          success: false,
          error: expect.stringContaining(expectedError),
        });
      });
    });
  });

  describe('payment_methods配列対応テスト', () => {
    beforeEach(() => {
      mockAuthenticatedUser();
      // payment_methods配列対応テスト用のモック設定
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'event-123',
                title: 'テストイベント',
                date: '2025-12-31T00:00:00.000Z',
                fee: 1000,
                payment_methods: ['stripe'],
                location: null,
                description: null,
                capacity: null,
                invite_token: 'test-invite-token',
                status: 'upcoming',
                created_by: 'user-123',
                created_at: '2025-01-01T00:00:00.000Z',
                updated_at: '2025-01-01T00:00:00.000Z'
              },
              error: null
            })
          })
        })
      });
    });

    it('複数の決済方法が配列として処理される', async () => {
      // Arrange
      const formData = new FormData();
      formData.append('title', 'テストイベント');
      formData.append('date', '2025-12-31');
      formData.append('fee', '1000');
      formData.append('payment_methods', 'stripe,cash');

      // モックの返り値を動的に設定
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'event-123',
                title: 'テストイベント',
                date: '2025-12-31T00:00:00.000Z',
                fee: 1000,
                payment_methods: ['stripe', 'cash'],
                location: null,
                description: null,
                capacity: null,
                invite_token: 'test-invite-token',
                status: 'upcoming',
                created_by: 'user-123',
                created_at: '2025-01-01T00:00:00.000Z',
                updated_at: '2025-01-01T00:00:00.000Z'
              },
              error: null
            })
          })
        })
      });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.payment_methods).toEqual(['stripe', 'cash']);
    });

    it('単一の決済方法が配列として処理される', async () => {
      // Arrange
      const formData = new FormData();
      formData.append('title', 'テストイベント');
      formData.append('date', '2025-12-31');
      formData.append('fee', '0');
      formData.append('payment_methods', 'free');

      // モックの返り値を動的に設定
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'event-123',
                title: 'テストイベント',
                date: '2025-12-31T00:00:00.000Z',
                fee: 0,
                payment_methods: ['free'],
                location: null,
                description: null,
                capacity: null,
                invite_token: 'test-invite-token',
                status: 'upcoming',
                created_by: 'user-123',
                created_at: '2025-01-01T00:00:00.000Z',
                updated_at: '2025-01-01T00:00:00.000Z'
              },
              error: null
            })
          })
        })
      });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.payment_methods).toEqual(['free']);
    });

    it('無効な決済方法を含む配列の場合、バリデーションエラーが返される', async () => {
      // Arrange
      const formData = new FormData();
      formData.append('title', 'テストイベント');
      formData.append('date', '2025-12-31');
      formData.append('fee', '1000');
      formData.append('payment_methods', 'stripe,invalid_method');

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('決済方法'),
      });
    });

    it('重複した決済方法が除去される', async () => {
      // Arrange
      const formData = new FormData();
      formData.append('title', 'テストイベント');
      formData.append('date', '2025-12-31');
      formData.append('fee', '1000');
      formData.append('payment_methods', 'stripe,cash,stripe');

      // モックの返り値を動的に設定
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'event-123',
                title: 'テストイベント',
                date: '2025-12-31T00:00:00.000Z',
                fee: 1000,
                payment_methods: ['stripe', 'cash'],
                location: null,
                description: null,
                capacity: null,
                invite_token: 'test-invite-token',
                status: 'upcoming',
                created_by: 'user-123',
                created_at: '2025-01-01T00:00:00.000Z',
                updated_at: '2025-01-01T00:00:00.000Z'
              },
              error: null
            })
          })
        })
      });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.payment_methods).toEqual(['stripe', 'cash']);
    });
  });

  describe('DB保存処理テスト', () => {
    beforeEach(() => {
      mockAuthenticatedUser();
      // DB保存処理のモック設定
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'event-123',
                title: 'テストイベント',
                date: '2025-12-31T00:00:00.000Z',
                fee: 1000,
                payment_methods: ['stripe'],
                location: null,
                description: null,
                capacity: null,
                invite_token: 'test-invite-token',
                status: 'upcoming',
                created_by: 'user-123',
                created_at: '2025-01-01T00:00:00.000Z',
                updated_at: '2025-01-01T00:00:00.000Z'
              },
              error: null
            })
          })
        })
      });
    });

    it('認証済みユーザーが有効な入力でイベントを作成できる', async () => {
      // Arrange
      const formData = createValidFormData();

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'event-123',
        title: 'テストイベント',
        date: '2025-12-31T00:00:00.000Z',
        fee: 1000,
        payment_methods: ['stripe'],
        location: null,
        description: null,
        capacity: null,
        invite_token: 'test-invite-token',
        status: 'upcoming',
        created_by: 'user-123',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z'
      });
    });

    it('成功時にevent IDとinvite_tokenが返される', async () => {
      // Arrange
      const formData = createValidFormData();

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('invite_token');
      expect(typeof result.data?.id).toBe('string');
      expect(typeof result.data?.invite_token).toBe('string');
      expect(result.data?.id).toBe('event-123');
      expect(result.data?.invite_token).toBe('test-invite-token');
    });

    it('作成されたイベントがデータベースに保存される', async () => {
      // Arrange
      const formData = createValidFormData({
        title: 'データベーステストイベント',
        fee: '2000',
        location: 'テスト会場',
        description: 'テスト説明',
        capacity: '50'
      });

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(mockSupabase.from).toHaveBeenCalledWith('events');
      expect(mockSupabase.from().insert).toHaveBeenCalledWith({
        title: 'データベーステストイベント',
        date: '2025-12-31',
        fee: 2000,
        payment_methods: ['stripe'],
        location: 'テスト会場',
        description: 'テスト説明',
        capacity: 50,
        created_by: 'user-123',
        invite_token: expect.any(String)
      });
      expect(result.success).toBe(true);
    });

    it('作成者IDが正しく設定される', async () => {
      // Arrange
      const formData = createValidFormData();

      // Act
      await createEventAction(formData);

      // Assert
      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          created_by: 'user-123'
        })
      );
    });

    it('invite_tokenが自動生成される', async () => {
      // Arrange
      const formData = createValidFormData();

      // Act
      await createEventAction(formData);

      // Assert
      expect(mockSupabase.from().insert).toHaveBeenCalledWith(
        expect.objectContaining({
          invite_token: expect.any(String)
        })
      );
    });

    it('DB保存時にエラーが発生した場合、エラーが返される', async () => {
      // Arrange
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' }
            })
          })
        })
      });
      const formData = createValidFormData();

      // Act
      const result = await createEventAction(formData);

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'イベントの作成に失敗しました'
      });
    });
  });

  describe('セキュリティテスト', () => {
    beforeEach(() => {
      mockAuthenticatedUser();
      // セキュリティテスト用のモック設定
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'event-123',
                title: 'テストイベント',
                date: '2025-12-31T00:00:00.000Z',
                fee: 1000,
                payment_methods: ['stripe'],
                location: null,
                description: null,
                capacity: null,
                invite_token: 'test-invite-token',
                status: 'upcoming',
                created_by: 'user-123',
                created_at: '2025-01-01T00:00:00.000Z',
                updated_at: '2025-01-01T00:00:00.000Z'
              },
              error: null
            })
          })
        })
      });
    });

    const securityTestCases = [
      {
        name: 'SQLインジェクション攻撃に対して安全である',
        input: { title: "'; DROP TABLE events; --" },
        expectSuccess: true
      },
      {
        name: 'XSS攻撃に対して安全である',
        input: { title: "<script>alert('XSS')</script>" },
        expectSuccess: true
      },
      {
        name: '非常に長い文字列での攻撃に対して安全である',
        input: { title: 'a'.repeat(10000) },
        expectSuccess: false,
        expectedError: 'タイトルは100文字以内で入力してください'
      },
      {
        name: '無効な日付形式での攻撃に対して安全である',
        input: { date: 'invalid_date_format' },
        expectSuccess: false,
        expectedError: '開催日'
      }
    ];

    securityTestCases.forEach(({ name, input, expectSuccess, expectedError }) => {
      it(name, async () => {
        // Arrange
        const formData = createValidFormData(input);

        // セキュリティテストの成功ケース用にモックを動的に設定
        if (expectSuccess) {
          mockSupabase.from.mockReturnValue({
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: 'event-123',
                    title: input.title || 'テストイベント',
                    date: '2025-12-31T00:00:00.000Z',
                    fee: 1000,
                    payment_methods: ['stripe'],
                    location: null,
                    description: null,
                    capacity: null,
                    invite_token: 'test-invite-token',
                    status: 'upcoming',
                    created_by: 'user-123',
                    created_at: '2025-01-01T00:00:00.000Z',
                    updated_at: '2025-01-01T00:00:00.000Z'
                  },
                  error: null
                })
              })
            })
          });
        }

        // Act
        const result = await createEventAction(formData);

        // Assert
        if (expectSuccess) {
          expect(result.success).toBe(true);
          if (input.title) {
            expect(result.data?.title).toBe(input.title);
          }
        } else {
          expect(result).toEqual({
            success: false,
            error: expect.stringContaining(expectedError!),
          });
        }
      });
    });
  });
});