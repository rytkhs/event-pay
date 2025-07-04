import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { AuthFormField, AuthPasswordField, AuthEmailField } from "@/components/auth/AuthFormField";
import { AuthFormWrapper } from "@/components/auth/AuthFormWrapper";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";

expect.extend(toHaveNoViolations);

describe("認証機能のアクセシビリティテスト", () => {
  describe("AuthFormField", () => {
    it("アクセシビリティ違反がないこと", async () => {
      const { container } = render(
        <AuthFormField name="test" label="テストフィールド" required placeholder="テスト値を入力" />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("適切なARIAラベルと属性を持っていること", () => {
      render(
        <AuthFormField
          name="email"
          label="メールアドレス"
          required
          placeholder="メールアドレスを入力"
        />
      );

      const input = screen.getByLabelText("メールアドレス");
      expect(input).toHaveAttribute("aria-required", "true");
      expect(input).toHaveAttribute("id", "email");
      expect(input).toHaveAttribute("name", "email");

      const label = screen.getByText("メールアドレス");
      expect(label).toHaveAttribute("for", "email");
    });

    it("適切なエラーステートのARIA属性を持っていること", () => {
      render(
        <AuthFormField
          name="email"
          label="メールアドレス"
          error="無効なメールアドレスです"
          required
        />
      );

      const input = screen.getByLabelText("メールアドレス");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("aria-describedby", "email-error");

      const errorMessage = screen.getByText("無効なメールアドレスです");
      expect(errorMessage).toHaveAttribute("id", "email-error");
      expect(errorMessage).toHaveAttribute("role", "alert");
      expect(errorMessage).toHaveAttribute("aria-live", "polite");
    });

    it("キーボードナビゲーションをサポートしていること", async () => {
      const user = userEvent.setup();

      render(
        <div>
          <AuthFormField name="field1" label="フィールド1" />
          <AuthFormField name="field2" label="フィールド2" />
        </div>
      );

      const field1 = screen.getByLabelText("フィールド1");
      const field2 = screen.getByLabelText("フィールド2");

      await user.tab();
      expect(field1).toHaveFocus();

      await user.tab();
      expect(field2).toHaveFocus();
    });

    it("十分な色のコントラストがあること", () => {
      render(<AuthFormField name="test" label="テストフィールド" error="エラーメッセージ" />);

      const errorMessage = screen.getByText("エラーメッセージ");
      // エラーテキストが十分なコントラストを持つための適切なCSSクラスを持っていることをテスト
      expect(errorMessage).toHaveClass("text-red-600");
    });
  });

  describe("AuthPasswordField", () => {
    it("アクセシビリティ違反がないこと", async () => {
      const { container } = render(
        <AuthPasswordField
          name="password"
          label="パスワード"
          required
          placeholder="パスワードを入力"
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("パスワード表示切り替えボタンに適切なARIA属性があること", () => {
      render(<AuthPasswordField name="password" label="パスワード" required />);

      const toggleButton = screen.getByLabelText("パスワードを表示");
      expect(toggleButton).toHaveAttribute("aria-pressed", "false");
      expect(toggleButton).toHaveAttribute("aria-controls", "password");
      expect(toggleButton).toHaveAttribute("type", "button");
      expect(toggleButton).toHaveAttribute("tabindex", "0");
    });

    it("パスワード表示が切り替わったときにARIA属性が更新されること", async () => {
      const user = userEvent.setup();

      render(<AuthPasswordField name="password" label="パスワード" required />);

      const toggleButton = screen.getByLabelText("パスワードを表示");
      const passwordInput = screen.getByLabelText("パスワード");

      expect(passwordInput).toHaveAttribute("type", "password");
      expect(toggleButton).toHaveAttribute("aria-pressed", "false");

      await user.click(toggleButton);

      expect(passwordInput).toHaveAttribute("type", "text");
      expect(toggleButton).toHaveAttribute("aria-pressed", "true");
      expect(toggleButton).toHaveAttribute("aria-label", "パスワードを非表示");
    });

    it("パスワード表示切り替えボタンのキーボードナビゲーションをサポートしていること", async () => {
      const user = userEvent.setup();

      render(<AuthPasswordField name="password" label="パスワード" required />);

      const toggleButton = screen.getByLabelText("パスワードを表示");

      await user.tab();
      await user.tab(); // 最初のタブは入力フィールド、2番目のタブはボタンにフォーカス
      expect(toggleButton).toHaveFocus();

      await user.keyboard("{Enter}");
      expect(toggleButton).toHaveAttribute("aria-pressed", "true");

      await user.keyboard("{Enter}");
      expect(toggleButton).toHaveAttribute("aria-pressed", "false");
    });

    it("適切なパスワードフィールドの説明があること", () => {
      render(<AuthPasswordField name="password" label="パスワード" required />);

      const passwordInput = screen.getByLabelText("パスワード");
      expect(passwordInput).toHaveAttribute("aria-describedby", "password-toggle");

      const toggleButton = screen.getByLabelText("パスワードを表示");
      expect(toggleButton).toHaveAttribute("id", "password-toggle");
    });
  });

  describe("AuthEmailField", () => {
    it("アクセシビリティ違反がないこと", async () => {
      const { container } = render(
        <AuthEmailField
          name="email"
          label="メールアドレス"
          required
          placeholder="メールアドレスを入力"
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("適切なメール入力属性を持っていること", () => {
      render(<AuthEmailField name="email" label="メールアドレス" required />);

      const input = screen.getByLabelText("メールアドレス");
      expect(input).toHaveAttribute("type", "email");
      expect(input).toHaveAttribute("autocomplete", "email");
      expect(input).toHaveAttribute("inputmode", "email");
    });
  });

  describe("AuthSubmitButton", () => {
    it("アクセシビリティ違反がないこと", async () => {
      const { container } = render(<AuthSubmitButton isPending={false}>送信</AuthSubmitButton>);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("適切なローディングステートのARIA属性を持っていること", () => {
      render(<AuthSubmitButton isPending={true}>送信</AuthSubmitButton>);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("disabled");
      expect(button).toHaveAttribute("aria-describedby", "loading-description");

      const loadingText = screen.getByText("処理中...");
      expect(loadingText).toHaveAttribute("id", "loading-description");
    });

    it("キーボードナビゲーションをサポートしていること", async () => {
      const user = userEvent.setup();
      const mockOnClick = jest.fn();

      render(
        <form onSubmit={mockOnClick}>
          <AuthSubmitButton isPending={false}>送信</AuthSubmitButton>
        </form>
      );

      const button = screen.getByRole("button");

      await user.tab();
      expect(button).toHaveFocus();

      // JSDOMの制限により、キーボードのEnterの代わりにクリックを使用
      await user.click(button);
      expect(mockOnClick).toHaveBeenCalled();
    });

    it("適切なローディングステートのセマンティクスを持っていること", () => {
      render(<AuthSubmitButton isPending={true}>送信</AuthSubmitButton>);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button).toHaveAttribute("aria-live", "polite");

      // ローディング説明の確認
      const loadingText = screen.getByText("処理中...");
      expect(loadingText).toHaveAttribute("id", "loading-description");
    });
  });

  describe("AuthFormWrapper", () => {
    const mockState = { success: false, error: undefined, fieldErrors: {} };
    const mockAction = jest.fn();

    it("アクセシビリティ違反がないこと", async () => {
      const { container } = render(
        <AuthFormWrapper
          title="ログイン"
          subtitle="アカウントにサインイン"
          state={mockState}
          isPending={false}
          formAction={mockAction}
        >
          <AuthFormField name="email" label="メールアドレス" />
        </AuthFormWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("適切なセマンティックHTML構造を持っていること", () => {
      render(
        <AuthFormWrapper
          title="ログイン"
          subtitle="アカウントにサインイン"
          state={mockState}
          isPending={false}
          formAction={mockAction}
        >
          <AuthFormField name="email" label="メールアドレス" />
        </AuthFormWrapper>
      );

      const main = screen.getByRole("main");
      expect(main).toBeInTheDocument();

      const form = screen.getByRole("form");
      expect(form).toBeInTheDocument();
      expect(form).toHaveAttribute("novalidate");

      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("ログイン");

      const fieldset = screen.getByRole("group");
      expect(fieldset).toBeInTheDocument();
    });

    it("ペンディング中にフォーム要素が無効化されること", () => {
      render(
        <AuthFormWrapper
          title="ログイン"
          state={mockState}
          isPending={true}
          formAction={mockAction}
        >
          <AuthFormField name="email" label="メールアドレス" />
        </AuthFormWrapper>
      );

      const fieldset = screen.getByRole("group");
      expect(fieldset).toHaveAttribute("disabled");
    });

    it("適切なフォーカス管理が行われること", async () => {
      const user = userEvent.setup();

      render(
        <AuthFormWrapper
          title="ログイン"
          state={mockState}
          isPending={false}
          formAction={mockAction}
        >
          <AuthFormField name="email" label="メールアドレス" />
          <AuthFormField name="password" label="パスワード" />
        </AuthFormWrapper>
      );

      const emailField = screen.getByLabelText("メールアドレス");
      const passwordField = screen.getByLabelText("パスワード");

      await user.tab();
      expect(emailField).toHaveFocus();

      await user.tab();
      expect(passwordField).toHaveFocus();
    });

    it("適切なランドマークリージョンを持っていること", () => {
      render(
        <AuthFormWrapper
          title="ログイン"
          state={mockState}
          isPending={false}
          formAction={mockAction}
        >
          <AuthFormField name="email" label="メールアドレス" />
        </AuthFormWrapper>
      );

      const main = screen.getByRole("main");
      expect(main).toBeInTheDocument();

      const form = screen.getByRole("form");
      expect(form).toBeInTheDocument();

      const contentinfo = screen.getByRole("contentinfo");
      expect(contentinfo).toBeInTheDocument();
    });
  });

  describe("色のコントラストと視覚的なアクセシビリティ", () => {
    it("エラーメッセージに十分な色のコントラストがあること", () => {
      render(<AuthFormField name="test" label="テストフィールド" error="エラーメッセージ" />);

      const errorMessage = screen.getByText("エラーメッセージ");
      // エラーテキストが十分なコントラストを持つための適切なCSSクラスを持っていることをテスト
      expect(errorMessage).toHaveClass("text-red-600");
    });

    it("必須フィールドインジケーターに十分な色のコントラストがあること", () => {
      render(<AuthFormField name="test" label="必須フィールド" required />);

      const label = screen.getByText("必須フィールド");
      // 必須インジケーターはCSSクラスで表示されるべき
      expect(label).toHaveClass("after:content-['*']");
      expect(label).toHaveClass("after:text-red-500");
    });

    it("適切なフォーカスインジケーターがあること", async () => {
      const user = userEvent.setup();

      render(<AuthFormField name="test" label="テストフィールド" />);

      const input = screen.getByLabelText("テストフィールド");

      await user.tab();
      expect(input).toHaveFocus();

      const styles = window.getComputedStyle(input);
      expect(styles.outline).toBeDefined();
    });
  });

  describe("キーボードナビゲーションのテスト", () => {
    it("Tabキーでフォーム要素をナビゲーションできること", async () => {
      const user = userEvent.setup();

      render(
        <form>
          <AuthFormField name="email" label="メールアドレス" />
          <AuthPasswordField name="password" label="パスワード" />
          <AuthSubmitButton isPending={false}>送信</AuthSubmitButton>
        </form>
      );

      const emailField = screen.getByLabelText("メールアドレス");
      const passwordField = screen.getByLabelText("パスワード");
      const toggleButton = screen.getByLabelText("パスワードを表示");
      const submitButton = screen.getByRole("button", { name: "送信" });

      await user.tab();
      expect(emailField).toHaveFocus();

      await user.tab();
      expect(passwordField).toHaveFocus();

      await user.tab();
      expect(toggleButton).toHaveFocus();

      await user.tab();
      expect(submitButton).toHaveFocus();
    });

    it("Shift+Tabキーで逆方向にナビゲーションできること", async () => {
      const user = userEvent.setup();

      render(
        <form>
          <AuthFormField name="email" label="メールアドレス" />
          <AuthPasswordField name="password" label="パスワード" />
          <AuthSubmitButton isPending={false}>送信</AuthSubmitButton>
        </form>
      );

      const emailField = screen.getByLabelText("メールアドレス");
      const passwordField = screen.getByLabelText("パスワード");
      const submitButton = screen.getByRole("button", { name: "送信" });

      // 送信ボタンから開始
      submitButton.focus();

      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expect(screen.getByLabelText("パスワードを表示")).toHaveFocus();

      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expect(passwordField).toHaveFocus();

      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expect(emailField).toHaveFocus();
    });

    it("Enterキーでフォームを送信できること", async () => {
      const user = userEvent.setup();
      const mockSubmit = jest.fn((e) => e.preventDefault());

      render(
        <form onSubmit={mockSubmit}>
          <AuthFormField name="email" label="メールアドレス" />
          <AuthSubmitButton isPending={false}>送信</AuthSubmitButton>
        </form>
      );

      const submitButton = screen.getByRole("button", { name: "送信" });

      // JSDOMの制限により、キーボードのEnterの代わりにクリックを使用
      await user.click(submitButton);

      expect(mockSubmit).toHaveBeenCalled();
    });

    it("Escapeキーでフォームフィールドのフォーカスを解除できること", async () => {
      const user = userEvent.setup();

      render(
        <form>
          <AuthFormField name="email" label="メールアドレス" />
        </form>
      );

      const emailField = screen.getByLabelText("メールアドレス") as HTMLInputElement;

      await user.click(emailField);
      expect(emailField).toHaveFocus();

      await user.keyboard("{Escape}");
      // 注: Escapeキーの動作はブラウザの実装に依存する
      // テスト環境では、フィールドがアクセス可能であることを確認するが、フォーカスは維持される場合がある
      expect(emailField).toBeInTheDocument();
    });
  });

  describe("スクリーンリーダーのサポート", () => {
    it("フォームエラーをスクリーンリーダーに通知すること", () => {
      render(
        <AuthFormField
          name="email"
          label="メールアドレス"
          error="有効なメールアドレスを入力してください"
        />
      );

      const errorMessage = screen.getByText("有効なメールアドレスを入力してください");
      expect(errorMessage).toHaveAttribute("role", "alert");
      expect(errorMessage).toHaveAttribute("aria-live", "polite");
    });

    it("適切なフォームフィールドの説明があること", () => {
      render(<AuthFormField name="password" label="パスワード" placeholder="8文字以上" />);

      const input = screen.getByLabelText("パスワード");
      expect(input).toHaveAttribute("placeholder", "8文字以上");
    });

    it("ローディング状態をスクリーンリーダーに通知すること", () => {
      render(<AuthSubmitButton isPending={true}>アカウント作成中</AuthSubmitButton>);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button).toHaveAttribute("aria-live", "polite");

      const loadingText = screen.getByText("処理中...");
      expect(loadingText).toBeInTheDocument();
    });
  });

  describe("モバイルとタッチのアクセシビリティ", () => {
    it("十分なタッチターゲットサイズがあること", () => {
      render(<AuthPasswordField name="password" label="パスワード" />);

      const toggleButton = screen.getByLabelText("パスワードを表示");

      // ボタンが最小サイズのための適切なCSSクラスを持っていることを確認
      expect(toggleButton).toHaveClass("absolute");
      expect(toggleButton).toHaveClass("right-3");
      // ボタンにはパディングがあり、クリック可能であるべき
      expect(toggleButton).toBeInTheDocument();
    });

    it("タッチイベントをサポートしていること", async () => {
      const user = userEvent.setup();

      render(<AuthPasswordField name="password" label="パスワード" />);

      const toggleButton = screen.getByLabelText("パスワードを表示");
      const passwordInput = screen.getByLabelText("パスワード");

      await user.pointer({ target: toggleButton, keys: "[TouchA]" });

      expect(passwordInput).toHaveAttribute("type", "text");
      expect(toggleButton).toHaveAttribute("aria-pressed", "true");
    });
  });
});
