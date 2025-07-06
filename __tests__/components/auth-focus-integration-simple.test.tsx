import { render, screen, waitFor } from "@testing-library/react";
import { AuthFormWrapper } from "@/components/auth/AuthFormWrapper";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { ServerActionResult, getFieldError } from "@/lib/hooks/useAuthForm";

// 簡易モック
const mockFormAction = jest.fn();

function SimpleTestForm({ state }: { state: ServerActionResult }) {
  // フィールドエラーを手動で取得して各フィールドに渡す
  const emailError = getFieldError(state.fieldErrors, "email");
  const passwordError = getFieldError(state.fieldErrors, "password");

  return (
    <AuthFormWrapper
      title="テストフォーム"
      state={state}
      isPending={false}
      formAction={mockFormAction}
      action="/test-action"
    >
      <AuthFormField name="email" label="メール" type="email" required error={emailError} />
      <AuthFormField
        name="password"
        label="パスワード"
        type="password"
        required
        error={passwordError}
      />
    </AuthFormWrapper>
  );
}

describe("認証フォーム フォーカス管理 - 簡易統合テスト", () => {
  let focusMock: jest.SpyInstance;

  beforeEach(() => {
    focusMock = jest.spyOn(HTMLElement.prototype, "focus").mockImplementation();
    mockFormAction.mockClear();
  });

  afterEach(() => {
    focusMock.mockRestore();
  });

  it("エラー時に最初のエラーフィールドにフォーカスすること", async () => {
    const errorState: ServerActionResult = {
      success: false,
      fieldErrors: {
        email: ["無効なメールアドレス"],
        password: ["パスワードが短すぎます"],
      },
    };

    const { rerender } = render(<SimpleTestForm state={{ success: false }} />);

    // エラー状態に更新
    rerender(<SimpleTestForm state={errorState} />);

    await waitFor(() => {
      expect(focusMock).toHaveBeenCalled();
    });

    // メールフィールドが見つかることを確認
    const emailField = screen.getByLabelText("メール");
    expect(emailField).toBeInTheDocument();
    expect(emailField).toHaveAttribute("aria-invalid", "true");
  });

  it("フィールドエラーがない場合はフォーカス移動しないこと", async () => {
    const successState: ServerActionResult = {
      success: true,
      message: "成功しました",
    };

    const { rerender } = render(<SimpleTestForm state={{ success: false }} />);

    // 成功状態に更新
    rerender(<SimpleTestForm state={successState} />);

    // フォーカス移動は発生しない
    expect(focusMock).not.toHaveBeenCalled();
  });

  it("単一エラー時に該当フィールドにフォーカスすること", async () => {
    const errorState: ServerActionResult = {
      success: false,
      fieldErrors: {
        password: ["パスワードが必要です"],
      },
    };

    const { rerender } = render(<SimpleTestForm state={{ success: false }} />);

    // エラー状態に更新
    rerender(<SimpleTestForm state={errorState} />);

    await waitFor(() => {
      expect(focusMock).toHaveBeenCalled();
    });

    // パスワードフィールドのエラー状態を確認
    const passwordField = screen.getByLabelText("パスワード");
    expect(passwordField).toHaveAttribute("aria-invalid", "true");
  });

  it("フォームレベルエラー時にaria-describedbyが設定されること", () => {
    const errorState: ServerActionResult = {
      success: false,
      error: "サーバーエラーが発生しました",
    };

    render(<SimpleTestForm state={errorState} />);

    const form = screen.getByRole("form");
    expect(form).toHaveAttribute("aria-describedby", "form-error");

    const errorMessage = screen.getByRole("alert");
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveTextContent("サーバーエラーが発生しました");
  });
});
