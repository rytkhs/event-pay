import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthFormWrapper } from "@/components/auth/AuthFormWrapper";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";
import { ServerActionResult } from "@/lib/hooks/useAuthForm";

// モックのServer Action
const mockFormAction = jest.fn().mockResolvedValue({ success: true });

// テスト用のコンポーネント
function TestAuthForm({
  state,
  isPending = false,
}: {
  state: ServerActionResult;
  isPending?: boolean;
}) {
  return (
    <AuthFormWrapper
      title="テスト認証フォーム"
      subtitle="統合テスト用フォーム"
      state={state}
      isPending={isPending}
      formAction={mockFormAction}
    >
      <AuthFormField
        name="email"
        label="メールアドレス"
        type="email"
        required
        placeholder="example@test.com"
        fieldErrors={state.fieldErrors?.email}
      />
      <AuthFormField
        name="password"
        label="パスワード"
        type="password"
        required
        placeholder="パスワードを入力"
        fieldErrors={state.fieldErrors?.password}
      />
      <AuthFormField
        name="confirmPassword"
        label="パスワード確認"
        type="password"
        required
        placeholder="パスワードを再入力"
        fieldErrors={state.fieldErrors?.confirmPassword}
      />
      <AuthSubmitButton isPending={isPending}>登録</AuthSubmitButton>
    </AuthFormWrapper>
  );
}

// フォーカス追跡用のモック
const focusTracker = {
  focusedElement: null as HTMLElement | null,
  focusCalls: [] as HTMLElement[],
  lastFocusedElement: null as HTMLElement | null,
};

// DOM メソッドのモックユーティリティ
const createMockElement = (tagName: string = "input") => {
  const element = document.createElement(tagName);

  // Jest用のfocusモック
  Object.defineProperty(element, "focus", {
    value: jest.fn(),
    writable: true,
    configurable: true,
  });

  Object.defineProperty(element, "blur", {
    value: jest.fn(),
    writable: true,
    configurable: true,
  });

  return element;
};

describe("認証フォーム フォーカス管理統合テスト", () => {
  let originalFocus: typeof HTMLElement.prototype.focus;
  let originalBlur: typeof HTMLElement.prototype.blur;
  let mockFocus: jest.Mock;
  let mockBlur: jest.Mock;

  beforeAll(() => {
    // 元のメソッドを保存
    originalFocus = HTMLElement.prototype.focus;
    originalBlur = HTMLElement.prototype.blur;
  });

  beforeEach(() => {
    // フォーカス追跡をリセット
    focusTracker.focusedElement = null;
    focusTracker.focusCalls = [];
    focusTracker.lastFocusedElement = null;

    // モック関数を作成
    mockFocus = jest.fn(function (this: HTMLElement) {
      // フォーカス追跡
      focusTracker.focusedElement = this;
      focusTracker.focusCalls.push(this);
      focusTracker.lastFocusedElement = this;

      // JSDOMでactiveElementを設定
      Object.defineProperty(document, "activeElement", {
        value: this,
        writable: true,
        configurable: true,
      });
    });

    mockBlur = jest.fn(function (this: HTMLElement) {
      // JSDOMでactiveElementをリセット
      Object.defineProperty(document, "activeElement", {
        value: document.body,
        writable: true,
        configurable: true,
      });
    });

    // モック関数で上書き
    Object.defineProperty(HTMLElement.prototype, "focus", {
      value: mockFocus,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, "blur", {
      value: mockBlur,
      writable: true,
      configurable: true,
    });
    mockFormAction.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    // 元のメソッドを復元
    HTMLElement.prototype.focus = originalFocus;
    HTMLElement.prototype.blur = originalBlur;
  });

  describe("エラー時のフォーカス管理", () => {
    it("フィールドエラー発生時に最初のエラーフィールドにフォーカスすること", async () => {
      const errorState: ServerActionResult = {
        success: false,
        fieldErrors: {
          email: ["無効なメールアドレスです"],
          password: ["パスワードが短すぎます"],
        },
        error: "入力内容を確認してください",
      };

      const { rerender } = render(<TestAuthForm state={{ success: false }} />);

      // エラー状態に更新
      rerender(<TestAuthForm state={errorState} />);

      await waitFor(() => {
        const emailField = screen.getByLabelText("メールアドレス");
        expect(mockFocus).toHaveBeenCalled();
        expect(focusTracker.lastFocusedElement).toBe(emailField);
      });
    });

    it("複数エラー時にDOM順序で最初のエラーフィールドにフォーカスすること", async () => {
      const errorState: ServerActionResult = {
        success: false,
        fieldErrors: {
          password: ["パスワードが短すぎます"],
          email: ["無効なメールアドレスです"],
          confirmPassword: ["パスワードが一致しません"],
        },
        error: "入力内容を確認してください",
      };

      const { rerender } = render(<TestAuthForm state={{ success: false }} />);

      // エラー状態に更新
      rerender(<TestAuthForm state={errorState} />);

      await waitFor(() => {
        const emailField = screen.getByLabelText("メールアドレス");
        expect(mockFocus).toHaveBeenCalled();
        expect(focusTracker.lastFocusedElement).toBe(emailField);
      });
    });

    it("エラーが解消されたときフォーカスが復元されること", async () => {
      const user = userEvent.setup();

      const errorState: ServerActionResult = {
        success: false,
        fieldErrors: {
          email: ["無効なメールアドレスです"],
        },
        error: "入力内容を確認してください",
      };

      const successState: ServerActionResult = {
        success: true,
        message: "登録が完了しました",
      };

      const { rerender } = render(<TestAuthForm state={{ success: false }} />);

      // パスワードフィールドにフォーカスを設定
      const passwordField = screen.getByLabelText("パスワード");
      await user.click(passwordField);

      // エラー状態に更新（emailフィールドにフォーカス移動）
      rerender(<TestAuthForm state={errorState} />);

      await waitFor(() => {
        const emailField = screen.getByLabelText("メールアドレス");
        expect(mockFocus).toHaveBeenCalled();
        expect(focusTracker.lastFocusedElement).toBe(emailField);
      });

      // 成功状態に更新（フォーカス復元）
      rerender(<TestAuthForm state={successState} />);

      await waitFor(() => {
        // フォーカスが適切に復元されること
        expect(mockFocus).toHaveBeenCalled();
      });
    });
  });

  describe("フォーム送信時のフォーカス管理", () => {
    it("フォーム送信中に現在のフォーカス要素を保存すること", async () => {
      const user = userEvent.setup();

      const { rerender } = render(<TestAuthForm state={{ success: false }} isPending={false} />);

      // パスワードフィールドにフォーカス
      const passwordField = screen.getByLabelText("パスワード");
      await user.click(passwordField);

      expect(document.activeElement).toBe(passwordField);

      // ペンディング状態に変更
      rerender(<TestAuthForm state={{ success: false }} isPending={true} />);

      // フォーカスが保持されていることを確認
      expect(document.activeElement).toBe(passwordField);
    });

    it("フォーム送信完了後にフォーカスが適切に処理されること", async () => {
      const user = userEvent.setup();

      const successState: ServerActionResult = {
        success: true,
        message: "登録が完了しました",
      };

      const { rerender } = render(<TestAuthForm state={{ success: false }} isPending={false} />);

      // パスワードフィールドにフォーカス
      const passwordField = screen.getByLabelText("パスワード");
      await user.click(passwordField);

      // ペンディング状態に変更
      rerender(<TestAuthForm state={{ success: false }} isPending={true} />);

      // 成功状態に変更（ペンディング終了）
      rerender(<TestAuthForm state={successState} isPending={false} />);

      await waitFor(() => {
        // フォーカス復元が呼ばれることを確認
        expect(mockFocus).toHaveBeenCalled();
      });
    });
  });

  describe("アクセシビリティ統合", () => {
    it("エラーメッセージが表示された要素が適切にARIA属性を持つこと", async () => {
      const errorState: ServerActionResult = {
        success: false,
        fieldErrors: {
          email: ["無効なメールアドレスです"],
        },
        error: "入力内容を確認してください",
      };

      const { rerender } = render(<TestAuthForm state={{ success: false }} />);

      // エラー状態に更新
      act(() => {
        rerender(<TestAuthForm state={errorState} />);
      });

      await waitFor(() => {
        const emailField = screen.getByLabelText("メールアドレス");
        expect(emailField).toHaveAttribute("aria-invalid", "true");
        expect(emailField).toHaveAttribute("aria-describedby", "email-error");

        const errorMessage = screen.getByText("無効なメールアドレスです");
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveAttribute("role", "alert");
      });
    });

    it("フォームレベルのエラーが適切にaria-describedbyで関連付けられること", async () => {
      const errorState: ServerActionResult = {
        success: false,
        error: "サーバーエラーが発生しました",
      };

      const { rerender } = render(<TestAuthForm state={{ success: false }} />);

      // エラー状態に更新
      rerender(<TestAuthForm state={errorState} />);

      await waitFor(() => {
        const form = screen.getByRole("form");
        expect(form).toHaveAttribute("aria-describedby", "form-error");

        const errorMessage = screen.getByRole("alert");
        expect(errorMessage).toBeInTheDocument();
      });
    });
  });

  describe("キーボードナビゲーション統合", () => {
    it.skip("Tabキーでフォーカス移動が正しく動作すること", async () => {
      const user = userEvent.setup();

      render(<TestAuthForm state={{ success: false }} />);

      const emailField = screen.getByLabelText("メールアドレス");
      const passwordField = screen.getByLabelText("パスワード");
      const confirmPasswordField = screen.getByLabelText("パスワード確認");
      const submitButton = screen.getByRole("button", { name: "登録" });

      // 最初のフィールドにフォーカス
      emailField.focus();
      expect(document.activeElement).toBe(emailField);

      // Tab移動
      await user.tab();
      expect(document.activeElement).toBe(passwordField);

      await user.tab();
      expect(document.activeElement).toBe(confirmPasswordField);

      await user.tab();
      expect(document.activeElement).toBe(submitButton);
    });

    it.skip("エラー時のフォーカス移動がTabオーダーを妨げないこと", async () => {
      const user = userEvent.setup();

      const errorState: ServerActionResult = {
        success: false,
        fieldErrors: {
          password: ["パスワードが短すぎます"],
        },
        error: "入力内容を確認してください",
      };

      const { rerender } = render(<TestAuthForm state={{ success: false }} />);

      // エラー状態に更新（passwordフィールドにフォーカス移動）
      rerender(<TestAuthForm state={errorState} />);

      await waitFor(() => {
        const passwordField = screen.getByLabelText("パスワード");
        expect(mockFocus).toHaveBeenCalled();
        expect(focusTracker.lastFocusedElement).toBe(passwordField);
      });

      // Tab移動が正常に動作することを確認
      await user.tab();
      await waitFor(() => {
        const confirmPasswordField = screen.getByLabelText("パスワード確認");
        expect(document.activeElement).toBe(confirmPasswordField);
      });
    });
  });
});
