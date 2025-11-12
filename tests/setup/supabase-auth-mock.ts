/**
 * Supabase認証モック実装
 *
 * テスト環境でのSupabase auth.getUser()を適切にモック化し、
 * 認証状態スキップ機能を置き換える。
 */

import type { User } from "@supabase/supabase-js";

export interface MockUser {
  id: string;
  email: string;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
}

class SupabaseAuthMock {
  private currentUser: MockUser | null = null;
  private shouldError: boolean = false;

  /**
   * テスト用ユーザーを設定
   */
  setUser(user: MockUser | null): void {
    this.currentUser = user;
    this.shouldError = false;
  }

  /**
   * エラー状態を設定（認証エラーのテスト用）
   */
  setError(shouldError: boolean = true): void {
    this.shouldError = shouldError;
    if (shouldError) {
      this.currentUser = null;
    }
  }

  /**
   * 現在のユーザーを取得（実際のSupabaseと同じ形式）
   */
  async getUser(): Promise<{ data: { user: User | null }; error: any }> {
    if (this.shouldError) {
      return {
        data: { user: null },
        error: new Error("Authentication error"),
      };
    }

    if (!this.currentUser) {
      return {
        data: { user: null },
        error: null,
      };
    }

    // Supabase Userオブジェクトの形式に合わせる
    const user: User = {
      id: this.currentUser.id,
      aud: "authenticated",
      role: "authenticated",
      email: this.currentUser.email,
      email_confirmed_at: new Date().toISOString(),
      phone: "",
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: this.currentUser.app_metadata || {},
      user_metadata: this.currentUser.user_metadata || {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return {
      data: { user },
      error: null,
    };
  }

  /**
   * セッション取得（必要に応じて実装）
   */
  async getSession(): Promise<{ data: { session: any }; error: any }> {
    if (this.shouldError) {
      return {
        data: { session: null },
        error: new Error("Session error"),
      };
    }

    if (!this.currentUser) {
      return {
        data: { session: null },
        error: null,
      };
    }

    return {
      data: {
        session: {
          user: await this.getUser().then((r) => r.data.user),
          access_token: "mock_access_token",
          refresh_token: "mock_refresh_token",
          expires_at: Date.now() + 3600000,
          token_type: "bearer",
        },
      },
      error: null,
    };
  }

  /**
   * モック状態をリセット
   */
  reset(): void {
    this.currentUser = null;
    this.shouldError = false;
  }
}

// シングルトンインスタンス
export const supabaseAuthMock = new SupabaseAuthMock();

/**
 * Supabaseクライアントモック生成
 */
export const createMockSupabaseClient = () => ({
  auth: {
    getUser: () => supabaseAuthMock.getUser(),
    getSession: () => supabaseAuthMock.getSession(),
    signInWithPassword: jest.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    }),
  },
  // RPC関数のモック（settlement tests用）
  rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
  // from, select, insert, updateなど基本的なクエリビルダーのモック
  from: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
    insert: jest.fn().mockResolvedValue({ data: null, error: null }),
    update: jest.fn().mockResolvedValue({ data: null, error: null }),
    delete: jest.fn().mockResolvedValue({ data: null, error: null }),
  }),
  // 他の必要なメソッドがあればここに追加
});

/**
 * 決済テスト用のSupabaseクライアントモック生成
 *
 * PaymentServiceのテストで使用されるクエリパターンに対応したモック設定
 */
export const createMockSupabaseClientForPayments = (options?: { paymentId?: string }) => {
  const { paymentId = "payment_test_abc123" } = options || {};

  const baseClient = createMockSupabaseClient();

  // payments テーブル用のクエリビルダーモックを設定
  (baseClient.from as jest.Mock).mockImplementation((table: string) => {
    if (table === "payments") {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { id: paymentId },
          error: null,
        }),
      };
    }
    // その他のテーブル用のデフォルト設定
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: {}, error: null }),
    };
  });

  return baseClient;
};

/**
 * テストヘルパー関数
 */
export const setTestUser = (user: MockUser) => {
  supabaseAuthMock.setUser(user);
};

export const setTestUserById = (id: string, email: string = "test@example.com") => {
  supabaseAuthMock.setUser({ id, email });
};

export const clearTestUser = () => {
  supabaseAuthMock.setUser(null);
};

export const setAuthError = (shouldError: boolean = true) => {
  supabaseAuthMock.setError(shouldError);
};

export const resetAuthMock = () => {
  supabaseAuthMock.reset();
};
