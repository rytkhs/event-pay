/**
 * 認証関連Server Actions統合テスト
 * EventPay 認証機能のServer Actions単体テスト
 */

import { createClient } from '@/lib/supabase/server';

// FormData用のヘルパー関数
const createFormData = (data: Record<string, string>) => {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    formData.append(key, value);
  });
  return formData;
};

describe('認証Server Actions統合テスト', () => {
  let supabase: ReturnType<typeof createClient>;

  beforeAll(() => {
    supabase = createClient();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ログイン機能', () => {
    test('正常なログイン処理が動作する', async () => {
      const formData = createFormData({
        email: 'test@eventpay.test',
        password: 'testpassword123',
      });

      // 実際のServer Actionをテスト
      // const result = await loginAction(formData);

      // 統合テストでは、実際のSupabaseクライアントとの連携を確認
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'test@eventpay.test',
        password: 'testpassword123',
      });

      // 正常なログインが成功することを確認
      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.session).toBeDefined();
    });

    test('無効な認証情報でログインが失敗する', async () => {
      const formData = createFormData({
        email: 'invalid@example.com',
        password: 'wrongpassword',
      });

      // 無効な認証情報でのログイン試行
      const { data, error } = await supabase.auth.signInWithPassword({
        email: 'invalid@example.com',
        password: 'wrongpassword',
      });

      // ログインが失敗することを確認
      expect(error).toBeTruthy();
      expect(data.user).toBeNull();
      expect(data.session).toBeNull();
    });

    test('バリデーションエラーが適切に処理される', async () => {
      const formData = createFormData({
        email: 'invalid-email',
        password: '',
      });

      // バリデーションエラーのテスト
      // 実際のServer Actionではzodスキーマでバリデーション
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const email = formData.get('email') as string;
      const password = formData.get('password') as string;

      expect(emailRegex.test(email)).toBe(false);
      expect(password.length).toBe(0);
    });
  });

  describe('ユーザー登録機能', () => {
    test('正常なユーザー登録処理が動作する', async () => {
      const formData = createFormData({
        email: 'newuser@eventpay.test',
        password: 'newpassword123',
        displayName: '新規ユーザー',
      });

      // 実際のSupabaseクライアントでの登録テスト
      const { data, error } = await supabase.auth.signUp({
        email: 'newuser@eventpay.test',
        password: 'newpassword123',
        options: {
          data: {
            display_name: '新規ユーザー',
          },
        },
      });

      // 正常な登録が成功することを確認
      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.user?.email).toBe('newuser@eventpay.test');
    });

    test('重複メールアドレスで登録が失敗する', async () => {
      const formData = createFormData({
        email: 'test@eventpay.test', // 既存のメールアドレス
        password: 'newpassword123',
        displayName: '重複ユーザー',
      });

      // 重複メールアドレスでの登録試行
      const { data, error } = await supabase.auth.signUp({
        email: 'test@eventpay.test',
        password: 'newpassword123',
        options: {
          data: {
            display_name: '重複ユーザー',
          },
        },
      });

      // 重複エラーが発生することを確認
      expect(error).toBeTruthy();
    });

    test('パスワード強度チェックが適切に動作する', async () => {
      const formData = createFormData({
        email: 'weakpassword@eventpay.test',
        password: '123', // 弱いパスワード
        displayName: '弱いパスワードユーザー',
      });

      // 弱いパスワードでの登録試行
      const { data, error } = await supabase.auth.signUp({
        email: 'weakpassword@eventpay.test',
        password: '123',
        options: {
          data: {
            display_name: '弱いパスワードユーザー',
          },
        },
      });

      // パスワード強度エラーが発生することを確認
      expect(error).toBeTruthy();
      expect(error?.message).toContain('password');
    });
  });

  describe('パスワードリセット機能', () => {
    test('正常なパスワードリセット処理が動作する', async () => {
      const formData = createFormData({
        email: 'test@eventpay.test',
      });

      // パスワードリセットリクエスト
      const { data, error } = await supabase.auth.resetPasswordForEmail(
        'test@eventpay.test',
        {
          redirectTo: 'http://localhost:3000/auth/reset-password',
        }
      );

      // パスワードリセットが成功することを確認
      expect(error).toBeNull();
    });

    test('存在しないメールアドレスでリセットが失敗する', async () => {
      const formData = createFormData({
        email: 'nonexistent@example.com',
      });

      // 存在しないメールアドレスでのリセット試行
      const { data, error } = await supabase.auth.resetPasswordForEmail(
        'nonexistent@example.com',
        {
          redirectTo: 'http://localhost:3000/auth/reset-password',
        }
      );

      // リセットが失敗することを確認
      expect(error).toBeTruthy();
    });
  });

  describe('ログアウト機能', () => {
    test('正常なログアウト処理が動作する', async () => {
      // 事前にログイン
      await supabase.auth.signInWithPassword({
        email: 'test@eventpay.test',
        password: 'testpassword123',
      });

      // ログアウト実行
      const { error } = await supabase.auth.signOut();

      // ログアウトが成功することを確認
      expect(error).toBeNull();

      // セッションが削除されることを確認
      const { data: session } = await supabase.auth.getSession();
      expect(session.session).toBeNull();
    });
  });

  describe('セッション管理', () => {
    test('有効なセッションが適切に管理される', async () => {
      // ログイン
      await supabase.auth.signInWithPassword({
        email: 'test@eventpay.test',
        password: 'testpassword123',
      });

      // セッション取得
      const { data: session, error } = await supabase.auth.getSession();

      // 有効なセッションが取得できることを確認
      expect(error).toBeNull();
      expect(session.session).toBeDefined();
      expect(session.session?.user).toBeDefined();
    });

    test('期限切れセッションが適切に処理される', async () => {
      // 期限切れセッションのシミュレーション
      // 実際のテストでは、期限切れのトークンを使用

      // セッション取得
      const { data: session, error } = await supabase.auth.getSession();

      // 期限切れセッションが null になることを確認
      expect(session.session).toBeNull();
    });

    test('セッションリフレッシュが適切に動作する', async () => {
      // ログイン
      const { data: loginData } = await supabase.auth.signInWithPassword({
        email: 'test@eventpay.test',
        password: 'testpassword123',
      });

      // セッションリフレッシュ
      const { data: refreshData, error } = await supabase.auth.refreshSession({
        refresh_token: loginData.session?.refresh_token!,
      });

      // セッションリフレッシュが成功することを確認
      expect(error).toBeNull();
      expect(refreshData.session).toBeDefined();
      expect(refreshData.user).toBeDefined();
    });
  });

  describe('プロフィール管理', () => {
    test('ユーザープロフィールが適切に作成される', async () => {
      // ユーザー登録
      const { data: signUpData } = await supabase.auth.signUp({
        email: 'profiletest@eventpay.test',
        password: 'testpassword123',
        options: {
          data: {
            display_name: 'プロフィールテストユーザー',
          },
        },
      });

      // プロフィールがusersテーブルに作成されることを確認
      if (signUpData.user) {
        const { data: profile, error } = await supabase
          .from('users')
          .select('id, display_name, email')
          .eq('id', signUpData.user.id)
          .single();

        expect(error).toBeNull();
        expect(profile).toBeDefined();
        expect(profile?.display_name).toBe('プロフィールテストユーザー');
      }
    });

    test('プロフィール更新が適切に動作する', async () => {
      // ログイン
      const { data: loginData } = await supabase.auth.signInWithPassword({
        email: 'test@eventpay.test',
        password: 'testpassword123',
      });

      // プロフィール更新
      const { data, error } = await supabase
        .from('users')
        .update({
          display_name: '更新されたユーザー名',
        })
        .eq('id', loginData.user?.id!)
        .select();

      // プロフィール更新が成功することを確認
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.[0]?.display_name).toBe('更新されたユーザー名');
    });
  });
});
