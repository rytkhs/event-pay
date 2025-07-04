import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { registerAction } from "@/app/auth/actions";
import RegisterPage from "@/app/auth/register/page";

// サーバーアクションをモック
jest.mock("@/app/auth/actions", () => ({
  registerAction: jest.fn(),
}));

// カスタムフックをモック
jest.mock("@/lib/hooks/usePasswordConfirmation", () => ({
  usePasswordConfirmation: () => ({
    state: {
      password: "",
      confirmPassword: "",
      error: "",
    },
    actions: {
      setPassword: jest.fn(),
      setConfirmPassword: jest.fn(),
      validateMatch: jest.fn(() => true),
    },
    validation: {
      hasError: false,
      isEmpty: false,
      iconType: null,
    },
  }),
}));

jest.mock("@/components/auth", () => ({
  useAuthForm: () => ({
    state: {
      fieldErrors: {},
      message: "",
      success: false,
    },
    formAction: jest.fn(),
    isPending: false,
  }),
  AuthFormWrapper: ({ children, formAction, ...props }: any) => (
    <form
      data-testid="register-form"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        formAction(formData);
      }}
    >
      {children}
    </form>
  ),
  AuthFormField: ({ name, label, type, required, error, fieldErrors, ...props }: any) => (
    <div>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        data-testid={`${name}-input`}
        {...props}
      />
      {error && <div data-testid={`${name}-error`}>{error}</div>}
      {fieldErrors && fieldErrors.length > 0 && (
        <div data-testid={`${name}-fieldErrors`}>{fieldErrors[0]}</div>
      )}
    </div>
  ),
  AuthEmailField: ({ name, label, fieldErrors, ...props }: any) => (
    <div>
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type="email" data-testid={`${name}-input`} {...props} />
      {fieldErrors && fieldErrors.length > 0 && (
        <div data-testid={`${name}-fieldErrors`}>{fieldErrors[0]}</div>
      )}
    </div>
  ),
  AuthSubmitButton: ({ children, isPending }: any) => (
    <button type="submit" disabled={isPending} data-testid="submit-button">
      {children}
    </button>
  ),
}));

describe("利用規約同意機能", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("利用規約同意チェックボックスが表示される", () => {
    render(<RegisterPage />);

    const termsCheckbox = screen.getByRole("checkbox", { name: /利用規約.*に同意する/i });
    expect(termsCheckbox).toBeInTheDocument();
    expect(termsCheckbox).not.toBeChecked();
  });

  test("登録時に利用規約同意が必要である", async () => {
    render(<RegisterPage />);

    // フォームに入力
    fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Test User" } });
    fireEvent.change(screen.getByTestId("email-input"), { target: { value: "test@example.com" } });

    // 利用規約に同意せずに送信を試行
    const form = screen.getByTestId("register-form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByTestId("terms-error")).toBeInTheDocument();
    });

    // registerActionが呼ばれないことを確認
    expect(registerAction).not.toHaveBeenCalled();
  });

  test("利用規約に同意しない場合のエラーメッセージが表示される", async () => {
    render(<RegisterPage />);

    // フォームに入力
    fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Test User" } });
    fireEvent.change(screen.getByTestId("email-input"), { target: { value: "test@example.com" } });

    // 利用規約に同意せずに送信を試行
    const form = screen.getByTestId("register-form");
    fireEvent.submit(form);

    await waitFor(() => {
      const errorMessage = screen.getByTestId("terms-error");
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveTextContent("利用規約に同意してください");
    });
  });

  test("利用規約に同意した場合、登録が有効になる", async () => {
    render(<RegisterPage />);

    // フォームに入力
    fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Test User" } });
    fireEvent.change(screen.getByTestId("email-input"), { target: { value: "test@example.com" } });

    // 利用規約に同意
    const termsCheckbox = screen.getByRole("checkbox", { name: /利用規約.*に同意する/i });
    fireEvent.click(termsCheckbox);

    expect(termsCheckbox).toBeChecked();

    // フォームを送信
    const form = screen.getByTestId("register-form");
    fireEvent.submit(form);

    await waitFor(() => {
      // エラーメッセージが表示されないことを確認
      expect(screen.queryByTestId("terms-error")).not.toBeInTheDocument();
    });
  });

  test("利用規約リンクが新しいタブで開く", () => {
    render(<RegisterPage />);

    const termsLink = screen.getByRole("link", { name: /利用規約/i });
    expect(termsLink).toBeInTheDocument();
    expect(termsLink).toHaveAttribute("href", "/terms");
    expect(termsLink).toHaveAttribute("target", "_blank");
    expect(termsLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("適切なアクセシビリティ属性が設定されている", () => {
    render(<RegisterPage />);

    const termsCheckbox = screen.getByRole("checkbox", { name: /利用規約.*に同意する/i });
    expect(termsCheckbox).toHaveAttribute("aria-required", "true");
    expect(termsCheckbox).toHaveAttribute("aria-describedby", "terms-description");

    const termsDescription = screen.getByText(
      "EventPayをご利用いただくには利用規約への同意が必要です"
    );
    expect(termsDescription).toBeInTheDocument();
  });
});
