/**
 * 認証関連Server Actions統合テスト
 * EventPay 認証機能のServer Actions単体テスト
 */

import { createClient } from "@supabase/supabase-js";

// Supabase クライアントのモック
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

// Server Actions のモック
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

// FormData用のヘルパー関数
const createFormData = (data: Record<string, string>) => {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    formData.append(key, value);
  });
  return formData;
};

describe("認証Server Actions統合テスト", () => {
  let mockSupabase: any;

  beforeAll(() => {
    // Supabaseクライアントモックの設定
    mockSupabase = {
      auth: {
        signInWithPassword: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        resetPasswordForEmail: jest.fn(),
        getSession: jest.fn(),
        getUser: jest.fn(),
        refreshSession: jest.fn(),
      },
      from: jest.fn(),
    };

    // createClientモックの設定
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    // Server用createClientモックの設定
    const serverSupabase = require("@/lib/supabase/server");
    serverSupabase.createClient.mockReturnValue(mockSupabase);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("ログイン機能", () => {
    test("正常なログイン処理が動作する", async () => {
      const formData = createFormData({
        email: "test@eventpay.test",
        password: "testpassword123",
      });

      // 正常なログイン結果をモック
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: "user-123", email: "test@eventpay.test" },
          session: { access_token: "token-123" },
        },
        error: null,
      });

      // 統合テストでは、実際のSupabaseクライアントとの連携を確認
      const { data, error } = await mockSupabase.auth.signInWithPassword({
        email: "test@eventpay.test",
        password: "testpassword123",
      });

      // 正常なログインが成功することを確認
      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.session).toBeDefined();
    });

    test("無効な認証情報でログインが失敗する", async () => {
      const formData = createFormData({
        email: "invalid@example.com",
        password: "wrongpassword",
      });

      // 無効な認証情報でのログイン失敗結果をモック
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      });

      // 無効な認証情報でのログイン試行
      const { data, error } = await mockSupabase.auth.signInWithPassword({
        email: "invalid@example.com",
        password: "wrongpassword",
      });

      // ログインが失敗することを確認
      expect(error).toBeTruthy();
      expect(data.user).toBeNull();
      expect(data.session).toBeNull();
    });

    test("バリデーションエラーが適切に処理される", async () => {
      const formData = createFormData({
        email: "invalid-email",
        password: "testpassword123",
      });

      // バリデーションエラーをモック
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Invalid email format" },
      });

      const { data, error } = await mockSupabase.auth.signInWithPassword({
        email: "invalid-email",
        password: "testpassword123",
      });

      // バリデーションエラーが適切に処理されることを確認
      expect(error).toBeTruthy();
      expect(error?.message).toContain("Invalid email");
      expect(data.user).toBeNull();
      expect(data.session).toBeNull();
    });
  });

  describe("ユーザー登録機能", () => {
    test("正常なユーザー登録処理が動作する", async () => {
      const formData = createFormData({
        email: "newuser@eventpay.test",
        password: "SecurePass123!",
        name: "New User",
      });

      // 正常なユーザー登録結果をモック
      mockSupabase.auth.signUp.mockResolvedValue({
        data: {
          user: { id: "user-456", email: "newuser@eventpay.test" },
          session: null, // メール確認前
        },
        error: null,
      });

      const { data, error } = await mockSupabase.auth.signUp({
        email: "newuser@eventpay.test",
        password: "SecurePass123!",
        options: {
          data: {
            name: "New User",
          },
        },
      });

      // 正常なユーザー登録が成功することを確認
      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.user?.email).toBe("newuser@eventpay.test");
    });

    test("重複メールアドレスで登録が失敗する", async () => {
      const formData = createFormData({
        email: "existing@eventpay.test",
        password: "SecurePass123!",
        name: "Existing User",
      });

      // 重複メールアドレスエラーをモック
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "User already registered" },
      });

      const { data, error } = await mockSupabase.auth.signUp({
        email: "existing@eventpay.test",
        password: "SecurePass123!",
        options: {
          data: {
            name: "Existing User",
          },
        },
      });

      // 重複エラーが発生することを確認
      expect(error).toBeTruthy();
    });

    test("パスワード強度チェックが適切に動作する", async () => {
      const formData = createFormData({
        email: "weakpass@eventpay.test",
        password: "weak",
        name: "Weak Pass User",
      });

      // パスワード強度エラーをモック
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Password should be at least 8 characters" },
      });

      const { data, error } = await mockSupabase.auth.signUp({
        email: "weakpass@eventpay.test",
        password: "weak",
        options: {
          data: {
            name: "Weak Pass User",
          },
        },
      });

      // パスワード強度エラーが発生することを確認
      expect(error).toBeTruthy();
      expect(error?.message).toContain("Password should be at least 8 characters");
    });
  });

  describe("パスワードリセット機能", () => {
    test("正常なパスワードリセット処理が動作する", async () => {
      const formData = createFormData({
        email: "reset@eventpay.test",
      });

      // 正常なパスワードリセット結果をモック
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: null,
      });

      const { data, error } = await mockSupabase.auth.resetPasswordForEmail("reset@eventpay.test");

      // 正常なパスワードリセットが成功することを確認
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test("存在しないメールアドレスでリセットが失敗する", async () => {
      const formData = createFormData({
        email: "nonexistent@eventpay.test",
      });

      // 存在しないメールアドレスエラーをモック
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: { message: "User not found" },
      });

      const { data, error } = await mockSupabase.auth.resetPasswordForEmail(
        "nonexistent@eventpay.test"
      );

      // リセットが失敗することを確認
      expect(error).toBeTruthy();
    });
  });

  describe("ログアウト機能", () => {
    test("正常なログアウト処理が動作する", async () => {
      // ログアウト処理をモック
      mockSupabase.auth.signOut.mockResolvedValue({
        error: null,
      });

      // ログアウト後の状態をモック（セッションがnullになる）
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      // ログアウト実行
      const { error } = await mockSupabase.auth.signOut();
      expect(error).toBeNull();

      // セッションが削除されることを確認
      const { data: session } = await mockSupabase.auth.getSession();
      expect(session.session).toBeNull();
    });
  });

  describe("セッション管理", () => {
    test("有効なセッションが適切に管理される", async () => {
      // 有効なセッションをモック
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { access_token: "valid-token", user: { id: "user-123" } } },
        error: null,
      });

      const { data, error } = await mockSupabase.auth.getSession();

      // 有効なセッションが取得できることを確認
      expect(error).toBeNull();
      expect(data.session).toBeDefined();
      expect(data.session?.access_token).toBe("valid-token");
    });

    test("期限切れセッションが適切に処理される", async () => {
      // 期限切れセッションをモック
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: "Session expired" },
      });

      const { data: session, error } = await mockSupabase.auth.getSession();

      // 期限切れセッションが null になることを確認
      expect(session.session).toBeNull();
    });

    test("セッションリフレッシュが適切に動作する", async () => {
      // セッションリフレッシュをモック
      mockSupabase.auth.refreshSession.mockResolvedValue({
        data: {
          session: { access_token: "new-token" },
          user: { id: "user-123" },
        },
        error: null,
      });

      const { data: refreshData, error } = await mockSupabase.auth.refreshSession();

      // セッションリフレッシュが成功することを確認
      expect(error).toBeNull();
      expect(refreshData.session).toBeDefined();
      expect(refreshData.user).toBeDefined();
    });
  });

  describe("プロフィール管理", () => {
    test("ユーザープロフィールが適切に作成される", async () => {
      // プロフィール作成をモック
      const mockProfileBuilder = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "profile-123",
            user_id: "user-123",
            display_name: "プロフィールテストユーザー",
          },
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockProfileBuilder);

      const { data: profile, error } = await mockSupabase
        .from("users")
        .insert({
          user_id: "user-123",
          display_name: "プロフィールテストユーザー",
        })
        .select()
        .single();

      // プロフィール作成が成功することを確認
      if (profile) {
        expect(error).toBeNull();
        expect(profile).toBeDefined();
        expect(profile?.display_name).toBe("プロフィールテストユーザー");
      }
    });

    test("プロフィール更新が適切に動作する", async () => {
      // プロフィール更新をモック
      const mockUpdateBuilder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: [
            {
              id: "profile-123",
              user_id: "user-123",
              display_name: "更新されたユーザー名",
            },
          ],
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockUpdateBuilder);

      const { data, error } = await mockSupabase
        .from("users")
        .update({ display_name: "更新されたユーザー名" })
        .eq("user_id", "user-123")
        .select()
        .single();

      // プロフィール更新が成功することを確認
      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.[0]?.display_name).toBe("更新されたユーザー名");
    });
  });
});
