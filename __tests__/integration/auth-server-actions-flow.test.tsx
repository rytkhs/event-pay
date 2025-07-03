/**
 * @jest-environment jsdom
 */

/**
 * @file 認証Server Actions統合テストスイート (TDD Red Phase)
 * @description フォーム送信からServer Action実行までの完全フローテスト
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockComponent = (name: string) => {
  const MockComponent = () => <div data-testid={`${name}-form`}>{name} Form Mock</div>;
  MockComponent.displayName = name;
  return MockComponent;
};

// フォームコンポーネントのモック
jest.mock(
  "../../app/auth/login/login-form",
  () => {
    try {
      return jest.requireActual("../../app/auth/login/login-form");
    } catch {
      return { LoginForm: mockComponent("login") };
    }
  },
  { virtual: true }
);

jest.mock(
  "../../app/auth/register/register-form",
  () => {
    try {
      return jest.requireActual("../../app/auth/register/register-form");
    } catch {
      return { RegisterForm: mockComponent("register") };
    }
  },
  { virtual: true }
);

jest.mock(
  "../../app/auth/reset-password/reset-password-form",
  () => {
    try {
      return jest.requireActual("../../app/auth/reset-password/reset-password-form");
    } catch {
      return { ResetPasswordForm: mockComponent("reset-password") };
    }
  },
  { virtual: true }
);

// Server Actions のモック
jest.mock(
  "../../app/auth/actions",
  () => {
    try {
      return jest.requireActual("../../app/auth/actions");
    } catch {
      return {
        loginAction: jest.fn(),
        registerAction: jest.fn(),
        resetPasswordAction: jest.fn(),
      };
    }
  },
  { virtual: true }
);

// まだ実装されていないコンポーネントとServer Actionsのインポート（Red Phase）
// @ts-expect-error TDD: File may not exist yet
import { LoginForm } from "../../app/auth/login/login-form";
// @ts-expect-error TDD: File may not exist yet
import { RegisterForm } from "../../app/auth/register/register-form";
// @ts-expect-error TDD: File may not exist yet
import { ResetPasswordForm } from "../../app/auth/reset-password/reset-password-form";
import { loginAction, registerAction, resetPasswordAction } from "../../app/auth/actions";

// Next.js Router mock
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/auth/login",
}));

describe("認証Server Actions統合フローテスト (TDD Red Phase)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockReplace.mockClear();
    mockRefresh.mockClear();
  });

  describe("ログインフォーム統合テスト", () => {
    test("ログインフォームが存在しない（未実装）", () => {
      // フォームコンポーネントが未実装のため、このテストは失敗します
      expect(LoginForm).toBeDefined();

      render(<LoginForm />);

      // 実際のログインフォーム要素が存在することを確認
      expect(screen.getByTestId("login-form")).toBeInTheDocument();

      // 必要なフォーム要素が存在することを確認
      expect(screen.queryByLabelText(/メールアドレス|email/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/パスワード|password/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /ログイン|login/i })).toBeInTheDocument();
    });

    test("ログインフォーム送信でServer Action呼び出し", async () => {
      // モックの設定
      (loginAction as jest.Mock).mockResolvedValue({
        success: true,
        user: { id: "1", email: "test@eventpay.test" },
        redirectUrl: "/dashboard",
      });

      const { getByTestId } = render(<LoginForm />);
      const form = getByTestId("login-form");

      // フォーム送信をシミュレート
      fireEvent.submit(form);

      await waitFor(() => {
        // Server Actionが呼び出されることを確認
        expect(loginAction).toHaveBeenCalled();
      });
    });

    test("ログイン成功時のリダイレクト処理", async () => {
      // ログイン成功のモック
      (loginAction as jest.Mock).mockResolvedValue({
        success: true,
        user: { id: "1", email: "test@eventpay.test" },
        redirectUrl: "/dashboard",
      });

      const { getByTestId } = render(<LoginForm />);
      const form = getByTestId("login-form");

      fireEvent.submit(form);

      await waitFor(() => {
        // 成功時のリダイレクトが実行されることを確認
        expect(mockPush).toHaveBeenCalledWith("/dashboard");
      });
    });

    test("ログイン失敗時のエラー表示", async () => {
      // ログイン失敗のモック
      (loginAction as jest.Mock).mockResolvedValue({
        success: false,
        error: "メールアドレスまたはパスワードが正しくありません",
      });

      const { getByTestId } = render(<LoginForm />);
      const form = getByTestId("login-form");

      fireEvent.submit(form);

      await waitFor(() => {
        // エラーメッセージが表示されることを確認
        expect(
          screen.queryByText(/メールアドレスまたはパスワードが正しくありません/)
        ).toBeInTheDocument();
      });
    });

    test("バリデーションエラーの表示", async () => {
      // バリデーションエラーのモック
      (loginAction as jest.Mock).mockResolvedValue({
        success: false,
        fieldErrors: {
          email: ["有効なメールアドレスを入力してください"],
          password: ["パスワードは必須です"],
        },
      });

      const { getByTestId } = render(<LoginForm />);
      const form = getByTestId("login-form");

      fireEvent.submit(form);

      await waitFor(() => {
        // フィールドエラーが表示されることを確認
        expect(screen.queryByText(/有効なメールアドレスを入力してください/)).toBeInTheDocument();
        expect(screen.queryByText(/パスワードは必須です/)).toBeInTheDocument();
      });
    });
  });

  describe("登録フォーム統合テスト", () => {
    test("登録フォームが存在しない（未実装）", () => {
      expect(RegisterForm).toBeDefined();

      const { getByTestId } = render(<RegisterForm />);

      expect(getByTestId("register-form")).toBeInTheDocument();

      // 必要なフォーム要素が存在することを確認
      expect(screen.queryByLabelText(/名前|name/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/メールアドレス|email/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/パスワード|password/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/パスワード確認|confirm.*password/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /登録|register|sign.*up/i })).toBeInTheDocument();
    });

    test("登録フォーム送信でServer Action呼び出し", async () => {
      (registerAction as jest.Mock).mockResolvedValue({
        success: true,
        user: { id: "2", email: "newuser@eventpay.test", name: "新規ユーザー" },
        needsEmailConfirmation: true,
      });

      const { getByTestId } = render(<RegisterForm />);
      const form = getByTestId("register-form");

      fireEvent.submit(form);

      await waitFor(() => {
        expect(registerAction).toHaveBeenCalled();
      });
    });

    test("登録成功時のメール確認画面への遷移", async () => {
      (registerAction as jest.Mock).mockResolvedValue({
        success: true,
        user: { id: "2", email: "newuser@eventpay.test" },
        needsEmailConfirmation: true,
      });

      const { getByTestId } = render(<RegisterForm />);
      const form = getByTestId("register-form");

      fireEvent.submit(form);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/auth/verify-email");
      });
    });

    test("重複メールアドレスエラーの処理", async () => {
      (registerAction as jest.Mock).mockResolvedValue({
        success: false,
        error: "このメールアドレスは既に使用されています",
      });

      const { getByTestId } = render(<RegisterForm />);
      const form = getByTestId("register-form");

      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.queryByText(/このメールアドレスは既に使用されています/)).toBeInTheDocument();
      });
    });
  });

  describe("パスワードリセットフォーム統合テスト", () => {
    test("パスワードリセットフォームが存在しない（未実装）", () => {
      expect(ResetPasswordForm).toBeDefined();

      const { getByTestId } = render(<ResetPasswordForm />);

      expect(getByTestId("reset-password-form")).toBeInTheDocument();

      // 必要なフォーム要素が存在することを確認
      expect(screen.queryByLabelText(/メールアドレス|email/i)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /送信|reset|パスワードリセット/i })
      ).toBeInTheDocument();
    });

    test("パスワードリセット送信でServer Action呼び出し", async () => {
      (resetPasswordAction as jest.Mock).mockResolvedValue({
        success: true,
        message: "パスワードリセットメールを送信しました",
      });

      const { getByTestId } = render(<ResetPasswordForm />);
      const form = getByTestId("reset-password-form");

      fireEvent.submit(form);

      await waitFor(() => {
        expect(resetPasswordAction).toHaveBeenCalled();
      });
    });

    test("パスワードリセット成功時の確認メッセージ表示", async () => {
      (resetPasswordAction as jest.Mock).mockResolvedValue({
        success: true,
        message: "パスワードリセットメールを送信しました",
      });

      const { getByTestId } = render(<ResetPasswordForm />);
      const form = getByTestId("reset-password-form");

      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.queryByText(/パスワードリセットメールを送信しました/)).toBeInTheDocument();
      });
    });

    test("レート制限エラーの処理", async () => {
      (resetPasswordAction as jest.Mock).mockResolvedValue({
        success: false,
        error: "パスワードリセット要求の上限に達しました",
      });

      const { getByTestId } = render(<ResetPasswordForm />);
      const form = getByTestId("reset-password-form");

      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.queryByText(/パスワードリセット要求の上限に達しました/)).toBeInTheDocument();
      });
    });
  });

  describe("フォーム状態管理テスト", () => {
    test("送信中の状態管理", async () => {
      // 長時間実行されるServer Actionをモック
      (loginAction as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 1000))
      );

      const { getByTestId } = render(<LoginForm />);
      const form = getByTestId("login-form");
      const submitButton = screen.queryByRole("button", { name: /ログイン/i });

      fireEvent.submit(form);

      // 送信中はボタンが無効化されることを確認
      expect(submitButton).toBeDisabled();
      expect(screen.queryByText(/送信中|処理中/)).toBeInTheDocument();

      await waitFor(
        () => {
          // 完了後はボタンが有効化されることを確認
          expect(submitButton).not.toBeDisabled();
        },
        { timeout: 2000 }
      );
    });

    test("複数回送信防止", async () => {
      (loginAction as jest.Mock).mockResolvedValue({
        success: true,
        user: { id: "1", email: "test@eventpay.test" },
      });

      const { getByTestId } = render(<LoginForm />);
      const form = getByTestId("login-form");

      // 短時間で複数回送信を試行
      fireEvent.submit(form);
      fireEvent.submit(form);
      fireEvent.submit(form);

      await waitFor(() => {
        // Server Actionが1回のみ呼び出されることを確認
        expect(loginAction).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("アクセシビリティテスト", () => {
    test("フォームのアクセシビリティ要件", () => {
      render(<LoginForm />);

      // ラベルとフォーム要素の関連付け
      expect(screen.queryByLabelText(/メールアドレス/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/パスワード/i)).toBeInTheDocument();

      // フォーカス管理
      const emailInput = screen.queryByLabelText(/メールアドレス/i);
      const passwordInput = screen.queryByLabelText(/パスワード/i);

      if (emailInput && passwordInput) {
        expect(emailInput).toHaveAttribute("type", "email");
        expect(passwordInput).toHaveAttribute("type", "password");
      }
    });

    test("エラーメッセージのアクセシビリティ", async () => {
      (loginAction as jest.Mock).mockResolvedValue({
        success: false,
        fieldErrors: {
          email: ["有効なメールアドレスを入力してください"],
        },
      });

      const { getByTestId } = render(<LoginForm />);
      const form = getByTestId("login-form");

      fireEvent.submit(form);

      await waitFor(() => {
        // エラーメッセージがaria-describedbyで関連付けられることを確認
        const emailInput = screen.queryByLabelText(/メールアドレス/i);
        const errorMessage = screen.queryByText(/有効なメールアドレスを入力してください/);

        if (emailInput && errorMessage) {
          expect(emailInput).toHaveAttribute("aria-describedby");
          expect(errorMessage).toHaveAttribute("id");
        }
      });
    });
  });

  describe("セキュリティ統合テスト", () => {
    test("CSRF保護の統合確認", async () => {
      // フォーム送信時にCSRFトークンが自動で含まれることを確認
      const { getByTestId } = render(<LoginForm />);
      const form = getByTestId("login-form");

      fireEvent.submit(form);

      await waitFor(() => {
        // Server ActionsはNext.jsによって自動でCSRF保護される
        expect(loginAction).toHaveBeenCalled();

        // フォームに隠しフィールドまたはメタデータでCSRF保護が含まれることを確認
        const formElement = form.querySelector("form");
        if (formElement) {
          // Next.js Server ActionsはformActionで自動CSRF保護
          expect(formElement).toHaveAttribute("action");
        }
      });
    });

    test("XSS攻撃の統合防御", async () => {
      // 悪意のあるスクリプトを含む入力データ
      const maliciousInput = "<script>alert('XSS')</script>";

      (registerAction as jest.Mock).mockResolvedValue({
        success: true,
        user: {
          id: "3",
          email: "xss@eventpay.test",
          name: "安全なユーザー名", // サニタイズ済み
        },
      });

      const { getByTestId } = render(<RegisterForm />);
      const form = getByTestId("register-form");

      // 悪意のある入力を含むフォーム送信をシミュレート
      const nameInput = screen.queryByLabelText(/名前/i);
      if (nameInput) {
        fireEvent.change(nameInput, { target: { value: maliciousInput } });
      }

      fireEvent.submit(form);

      await waitFor(() => {
        // レスポンスに悪意のあるスクリプトが含まれていないことを確認
        expect(document.body.innerHTML).not.toContain("<script>");
        expect(document.body.innerHTML).not.toContain("alert('XSS')");
      });
    });
  });
});
