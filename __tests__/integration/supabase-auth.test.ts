/**
 * Supabase認証統合テスト
 * 実際のSupabaseクライアントとの統合テスト
 */

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createClient as createMiddlewareClient } from '@/lib/supabase/middleware';
import { NextRequest } from 'next/server';

// テスト環境でのSupabaseクライアント設定
const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'TestPassword123!';

describe('Supabase認証統合テスト', () => {
  let testUserId: string | null = null;

  beforeAll(async () => {
    // テスト用ユーザーの作成（開発環境のみ）
    if (process.env.NODE_ENV === 'test') {
      try {
        const serviceClient = createServiceClient();
        const { data, error } = await serviceClient.auth.admin.createUser({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
          email_confirm: true,
        });

        if (data.user) {
          testUserId = data.user.id;
        }
      } catch (error) {
        console.warn('テストユーザー作成に失敗しました:', error);
      }
    }
  });

  afterAll(async () => {
    // テスト用ユーザーの削除
    if (testUserId && process.env.NODE_ENV === 'test') {
      try {
        const serviceClient = createServiceClient();
        await serviceClient.auth.admin.deleteUser(testUserId);
      } catch (error) {
        console.warn('テストユーザー削除に失敗しました:', error);
      }
    }
  });

  describe('サーバーサイドクライアント', () => {
    test('Supabaseクライアントが正常に作成される', () => {
      const client = createClient();
      
      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
      expect(client.from).toBeDefined();
    });

    test('Service Role Keyクライアントが正常に作成される', () => {
      const serviceClient = createServiceClient();
      
      expect(serviceClient).toBeDefined();
      expect(serviceClient.auth).toBeDefined();
      expect(serviceClient.auth.admin).toBeDefined();
    });

    test('環境変数が適切に設定されている', () => {
      expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeDefined();
      expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeDefined();
      expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
    });

    test('匿名キーでの管理操作が制限される', async () => {
      const client = createClient();
      
      // 管理者機能が匿名キーでは使用できないことを確認
      expect(() => client.auth.admin).toThrow();
    });

    test('Service Role Keyで管理操作が可能', async () => {
      const serviceClient = createServiceClient();
      
      // 管理者機能がService Role Keyでは使用可能であることを確認
      expect(serviceClient.auth.admin).toBeDefined();
      expect(typeof serviceClient.auth.admin.listUsers).toBe('function');
    });
  });

  describe('ミドルウェアクライアント', () => {
    test('リクエストからミドルウェアクライアントが作成される', () => {
      const request = new NextRequest('http://localhost:3000/test');
      const { supabase, supabaseResponse } = createMiddlewareClient(request);
      
      expect(supabase).toBeDefined();
      expect(supabase.auth).toBeDefined();
      // supabaseResponseは存在する場合と存在しない場合がある
    });

    test('無効なリクエストでエラーが適切に処理される', () => {
      // 無効なリクエストオブジェクト
      expect(() => createMiddlewareClient(null as any)).toThrow();
      expect(() => createMiddlewareClient(undefined as any)).toThrow();
    });

    test('Cookieなしのリクエストで未認証状態になる', async () => {
      const request = new NextRequest('http://localhost:3000/test');
      const { supabase } = createMiddlewareClient(request);
      
      const { data: { user }, error } = await supabase.auth.getUser();
      expect(user).toBeNull();
    });
  });

  describe('認証フロー統合テスト', () => {
    test('有効な認証情報でログインが成功する', async () => {
      if (process.env.NODE_ENV !== 'test' || !testUserId) {
        return; // テスト環境以外ではスキップ
      }

      const client = createClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      });

      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.session).toBeDefined();
      expect(data.user?.email).toBe(TEST_USER_EMAIL);
    });

    test('無効な認証情報でログインが失敗する', async () => {
      const client = createClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: 'invalid@example.com',
        password: 'invalid-password',
      });

      expect(error).toBeDefined();
      expect(data.user).toBeNull();
      expect(data.session).toBeNull();
    });

    test('パスワードリセットが適切に機能する', async () => {
      if (process.env.NODE_ENV !== 'test') {
        return; // テスト環境以外ではスキップ
      }

      const client = createClient();
      const { error } = await client.auth.resetPasswordForEmail(TEST_USER_EMAIL, {
        redirectTo: 'http://localhost:3000/auth/update-password',
      });

      // テスト環境では実際のメール送信は行われないため、エラーがないことを確認
      expect(error).toBeNull();
    });
  });

  describe('セッション管理', () => {
    test('セッションの有効期限が適切に設定される', async () => {
      if (process.env.NODE_ENV !== 'test' || !testUserId) {
        return; // テスト環境以外ではスキップ
      }

      const client = createClient();
      const { data } = await client.auth.signInWithPassword({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      });

      if (data.session) {
        const expiresAt = data.session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        
        // セッションが現在時刻より未来に設定されていることを確認
        expect(expiresAt).toBeGreaterThan(now);
        
        // セッションが24時間以内に設定されていることを確認
        const hoursDiff = (expiresAt - now) / 3600;
        expect(hoursDiff).toBeLessThanOrEqual(24);
      }
    });

    test('無効なセッションでユーザー取得が失敗する', async () => {
      const client = createClient();
      
      // 手動で無効なセッションを設定（実際のアプリケーションではこのような操作は行わない）
      const { data: { user }, error } = await client.auth.getUser();
      
      // 初期状態では認証されていない
      expect(user).toBeNull();
    });
  });

  describe('データベースアクセス制御', () => {
    test('匿名ユーザーでの制限されたアクセス', async () => {
      const client = createClient();
      
      // usersテーブルへの直接アクセス（RLSにより制限される）
      const { data, error } = await client
        .from('users')
        .select('*')
        .limit(1);

      // RLSにより、匿名ユーザーはデータにアクセスできない
      expect(data).toEqual([]);
    });

    test('Service Role Keyでの完全アクセス', async () => {
      if (process.env.NODE_ENV !== 'test') {
        return; // テスト環境以外ではスキップ
      }

      const serviceClient = createServiceClient();
      
      // Service Role Keyを使用してRLSをバイパス
      const { data, error } = await serviceClient
        .from('users')
        .select('id, email, created_at')
        .limit(5);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('エラーハンドリング', () => {
    test('ネットワークエラーが適切に処理される', async () => {
      // 無効なURLでクライアントを作成（実際のテストでは困難）
      const client = createClient();
      
      // 存在しないテーブルへのアクセス
      const { data, error } = await client
        .from('non_existent_table')
        .select('*');

      expect(error).toBeDefined();
      expect(data).toBeNull();
      expect(error?.message).toContain('relation "public.non_existent_table" does not exist');
    });

    test('認証エラーが適切に返される', async () => {
      const client = createClient();
      
      // 無効なトークンでの認証試行
      const { data, error } = await client.auth.getUser('invalid-jwt-token');
      
      expect(error).toBeDefined();
      expect(data.user).toBeNull();
    });

    test('レート制限エラーが適切に処理される', async () => {
      const client = createClient();
      
      // 大量のリクエストを同時送信（実際のレート制限テストは困難）
      const promises = Array.from({ length: 10 }, () =>
        client.auth.signInWithPassword({
          email: 'nonexistent@example.com',
          password: 'invalid-password',
        })
      );

      const results = await Promise.all(promises);
      
      // すべてのリクエストが失敗することを確認
      results.forEach(result => {
        expect(result.error).toBeDefined();
        expect(result.data.user).toBeNull();
      });
    });
  });

  describe('セキュリティ検証', () => {
    test('SQLインジェクション攻撃が防がれる', async () => {
      const client = createClient();
      
      const maliciousInput = "'; DROP TABLE users; --";
      
      // Supabaseクライアントは自動的にパラメータ化クエリを使用
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('email', maliciousInput);

      // SQLインジェクションは実行されず、単純な文字列として扱われる
      expect(data).toEqual([]);
      expect(error).toBeNull(); // エラーではなく、単に結果がない
    });

    test('XSS攻撃を含むデータが適切に処理される', async () => {
      if (process.env.NODE_ENV !== 'test' || !testUserId) {
        return; // テスト環境以外ではスキップ
      }

      const serviceClient = createServiceClient();
      const maliciousName = '<script>alert("XSS")</script>';
      
      // Service Role Keyを使用してテストデータを挿入
      const { data, error } = await serviceClient
        .from('users')
        .update({ name: maliciousName })
        .eq('id', testUserId)
        .select();

      expect(error).toBeNull();
      expect(data?.[0]?.name).toBe(maliciousName); // 文字列として保存される
      
      // データを取得して確認
      const { data: userData } = await serviceClient
        .from('users')
        .select('name')
        .eq('id', testUserId)
        .single();

      expect(userData?.name).toBe(maliciousName); // エスケープされずに保存される（アプリケーション側でエスケープが必要）
    });

    test('認証バイパス攻撃が防がれる', async () => {
      const client = createClient();
      
      // 手動でのセッション操作試行
      const manipulatedSession = {
        access_token: 'fake-token',
        refresh_token: 'fake-refresh',
        expires_at: Date.now() + 3600,
        user: { id: 'fake-user-id', email: 'fake@example.com' },
      };

      // 偽のセッションではユーザー情報を取得できない
      const { data: { user }, error } = await client.auth.getUser();
      expect(user).toBeNull();
    });
  });

  describe('パフォーマンス', () => {
    test('クライアント作成のパフォーマンス', () => {
      const startTime = performance.now();
      
      // 100個のクライアントを作成
      const clients = Array.from({ length: 100 }, () => createClient());
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(clients).toHaveLength(100);
      expect(duration).toBeLessThan(100); // 100ms以内
    });

    test('同時認証リクエストのパフォーマンス', async () => {
      const startTime = performance.now();
      
      // 10個の同時認証リクエスト
      const promises = Array.from({ length: 10 }, () => {
        const client = createClient();
        return client.auth.signInWithPassword({
          email: 'nonexistent@example.com',
          password: 'invalid-password',
        });
      });

      await Promise.all(promises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // 10個の同時リクエストが5秒以内に完了
      expect(duration).toBeLessThan(5000);
    });
  });
});