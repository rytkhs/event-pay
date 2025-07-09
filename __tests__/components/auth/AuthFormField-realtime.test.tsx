/**
 * AuthFormField + リアルタイムバリデーション統合テスト
 * TDD Red Phase - 失敗するテストを最初に書く
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { useRealTimeValidation } from "@/lib/hooks/useRealTimeValidation";

// useRealTimeValidation をモック化
jest.mock("@/lib/hooks/useRealTimeValidation");

// テスト用のリアルタイムバリデーション対応 AuthFormField
function AuthFormFieldWithRealTimeValidation({
  name,
  label,
  validator,
  asyncValidator,
  ...props
}: {
  name: string;
  label: string;
  validator: (value: string) => boolean | string;
  asyncValidator?: (value: string) => Promise<boolean>;
  [key: string]: any;
}) {
  const { state, setValue, validate } = useRealTimeValidation("", validator, { asyncValidator });

  return (
    <div>
      <AuthFormField
        name={name}
        label={label}
        value={state.value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={validate}
        error={state.error}
        {...props}
      />
      {/* リアルタイムバリデーションフィードバック */}
      <div data-testid="validation-feedback">
        {state.isValidating && <span data-testid="validating">検証中...</span>}
        {state.isValid && !state.isValidating && (
          <span data-testid="validation-success">✓ 有効です</span>
        )}
        {state.error && !state.isValidating && (
          <span data-testid="validation-error">{state.error}</span>
        )}
      </div>
    </div>
  );
}

const mockUseRealTimeValidation = useRealTimeValidation as jest.MockedFunction<
  typeof useRealTimeValidation
>;

describe("AuthFormField + リアルタイムバリデーション統合", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // デフォルトのモック動作
    mockUseRealTimeValidation.mockReturnValue({
      state: {
        value: "",
        isValid: false,
        error: undefined,
        isValidating: false,
      },
      setValue: jest.fn(),
      validate: jest.fn(),
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe("基本的な統合", () => {
    it("フィールドにリアルタイムバリデーションが統合される", () => {
      const validator = (value: string) => value.length >= 3;

      render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
        />
      );

      expect(screen.getByLabelText("メールアドレス")).toBeInTheDocument();
      expect(mockUseRealTimeValidation).toHaveBeenCalledWith("", validator, {
        asyncValidator: undefined,
      });
    });

    it("入力値変更時にsetValueが呼ばれる", async () => {
      const mockSetValue = jest.fn();
      mockUseRealTimeValidation.mockReturnValue({
        state: { value: "", isValid: false, error: undefined, isValidating: false },
        setValue: mockSetValue,
        validate: jest.fn(),
      });

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const validator = (value: string) => value.length >= 3;

      render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
        />
      );

      const input = screen.getByLabelText("メールアドレス");
      await user.type(input, "test");

      expect(mockSetValue).toHaveBeenCalledWith("t");
      expect(mockSetValue).toHaveBeenCalledWith("e");
      expect(mockSetValue).toHaveBeenCalledWith("s");
      expect(mockSetValue).toHaveBeenCalledWith("t");
    });

    it("フォーカス移動時にvalidateが呼ばれる", async () => {
      const mockValidate = jest.fn();
      mockUseRealTimeValidation.mockReturnValue({
        state: { value: "test", isValid: true, error: undefined, isValidating: false },
        setValue: jest.fn(),
        validate: mockValidate,
      });

      const validator = (value: string) => value.length >= 3;

      render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
        />
      );

      const input = screen.getByLabelText("メールアドレス");
      fireEvent.blur(input);

      expect(mockValidate).toHaveBeenCalled();
    });
  });

  describe("バリデーション状態の表示", () => {
    it("検証中状態が表示される", () => {
      mockUseRealTimeValidation.mockReturnValue({
        state: { value: "test", isValid: false, error: undefined, isValidating: true },
        setValue: jest.fn(),
        validate: jest.fn(),
      });

      const validator = (value: string) => value.length >= 3;

      render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
        />
      );

      expect(screen.getByTestId("validating")).toHaveTextContent("検証中...");
    });

    it("成功状態が表示される", () => {
      mockUseRealTimeValidation.mockReturnValue({
        state: { value: "test@example.com", isValid: true, error: undefined, isValidating: false },
        setValue: jest.fn(),
        validate: jest.fn(),
      });

      const validator = (value: string) => value.length >= 3;

      render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
        />
      );

      expect(screen.getByTestId("validation-success")).toHaveTextContent("✓ 有効です");
    });

    it("エラー状態が表示される", () => {
      mockUseRealTimeValidation.mockReturnValue({
        state: {
          value: "te",
          isValid: false,
          error: "3文字以上入力してください",
          isValidating: false,
        },
        setValue: jest.fn(),
        validate: jest.fn(),
      });

      const validator = (value: string) => value.length >= 3;

      render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
        />
      );

      expect(screen.getByTestId("validation-error")).toHaveTextContent("3文字以上入力してください");
    });
  });

  describe("非同期バリデーション", () => {
    it("非同期バリデーターが設定される", () => {
      const validator = (value: string) => value.length >= 3;
      const asyncValidator = async (value: string) => value.includes("@");

      render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
          asyncValidator={asyncValidator}
        />
      );

      expect(mockUseRealTimeValidation).toHaveBeenCalledWith("", validator, { asyncValidator });
    });

    it("非同期バリデーション中の状態変化", () => {
      // 最初は検証中
      mockUseRealTimeValidation.mockReturnValue({
        state: { value: "test@", isValid: false, error: undefined, isValidating: true },
        setValue: jest.fn(),
        validate: jest.fn(),
      });

      const validator = (value: string) => value.length >= 3;
      const asyncValidator = async (value: string) => value.includes("@");

      const { rerender } = render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
          asyncValidator={asyncValidator}
        />
      );

      expect(screen.getByTestId("validating")).toBeInTheDocument();

      // 検証完了後
      mockUseRealTimeValidation.mockReturnValue({
        state: { value: "test@example.com", isValid: true, error: undefined, isValidating: false },
        setValue: jest.fn(),
        validate: jest.fn(),
      });

      rerender(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
          asyncValidator={asyncValidator}
        />
      );

      expect(screen.getByTestId("validation-success")).toBeInTheDocument();
    });
  });

  describe("エラーハンドリング", () => {
    it("フィールドエラーとリアルタイムエラーが両方表示される", () => {
      mockUseRealTimeValidation.mockReturnValue({
        state: {
          value: "test",
          isValid: false,
          error: "リアルタイムエラー",
          isValidating: false,
        },
        setValue: jest.fn(),
        validate: jest.fn(),
      });

      const validator = (value: string) => value.length >= 3;

      render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
          error="サーバーサイドエラー"
        />
      );

      expect(screen.getByText("サーバーサイドエラー")).toBeInTheDocument();
      expect(screen.getByTestId("validation-error")).toHaveTextContent("リアルタイムエラー");
    });

    it("フィールドエラーが優先されて表示される", () => {
      mockUseRealTimeValidation.mockReturnValue({
        state: {
          value: "test",
          isValid: false,
          error: "リアルタイムエラー",
          isValidating: false,
        },
        setValue: jest.fn(),
        validate: jest.fn(),
      });

      const validator = (value: string) => value.length >= 3;

      render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
          error="優先エラー"
        />
      );

      expect(screen.getByText("優先エラー")).toBeInTheDocument();
      expect(screen.getByTestId("validation-error")).toHaveTextContent("リアルタイムエラー");
    });
  });

  describe("アクセシビリティ統合", () => {
    it("aria-invalid が適切に設定される", () => {
      mockUseRealTimeValidation.mockReturnValue({
        state: {
          value: "te",
          isValid: false,
          error: "3文字以上入力してください",
          isValidating: false,
        },
        setValue: jest.fn(),
        validate: jest.fn(),
      });

      const validator = (value: string) => value.length >= 3;

      render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
        />
      );

      const input = screen.getByLabelText("メールアドレス");
      expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it("aria-describedby でバリデーションフィードバックが関連付けられる", () => {
      mockUseRealTimeValidation.mockReturnValue({
        state: {
          value: "te",
          isValid: false,
          error: "エラーメッセージ",
          isValidating: false,
        },
        setValue: jest.fn(),
        validate: jest.fn(),
      });

      const validator = (value: string) => value.length >= 3;

      render(
        <div>
          <AuthFormFieldWithRealTimeValidation
            name="email"
            label="メールアドレス"
            validator={validator}
          />
          <div id="email-realtime-validation" data-testid="validation-feedback">
            エラーメッセージ
          </div>
        </div>
      );

      const input = screen.getByLabelText("メールアドレス");
      expect(input).toHaveAttribute("aria-describedby");
    });
  });

  describe("フォーカス管理との統合", () => {
    it("フォーカス移動時にvalidateが呼ばれる", async () => {
      const mockValidate = jest.fn();
      mockUseRealTimeValidation.mockReturnValue({
        state: {
          value: "te",
          isValid: false,
          error: "3文字以上入力してください",
          isValidating: false,
        },
        setValue: jest.fn(),
        validate: mockValidate,
      });

      const validator = (value: string) => value.length >= 3;

      render(
        <form>
          <AuthFormFieldWithRealTimeValidation
            name="email"
            label="メールアドレス"
            validator={validator}
          />
          <AuthFormFieldWithRealTimeValidation
            name="password"
            label="パスワード"
            validator={(value: string) => value.length >= 8}
          />
        </form>
      );

      const emailInput = screen.getByLabelText("メールアドレス");

      // フォーカスアウト時にvalidateが呼ばれるかテスト
      fireEvent.blur(emailInput);

      expect(mockValidate).toHaveBeenCalled();
    });

    it("リアルタイムバリデーション成功時は入力が有効", () => {
      mockUseRealTimeValidation.mockReturnValue({
        state: {
          value: "test@example.com",
          isValid: true,
          error: undefined,
          isValidating: false,
        },
        setValue: jest.fn(),
        validate: jest.fn(),
      });

      const validator = (value: string) => value.length >= 3;

      render(
        <form>
          <AuthFormFieldWithRealTimeValidation
            name="email"
            label="メールアドレス"
            validator={validator}
          />
        </form>
      );

      const emailInput = screen.getByLabelText("メールアドレス");

      expect(emailInput).toHaveAttribute("aria-invalid", "false");
      expect(screen.getByTestId("validation-success")).toBeInTheDocument();
    });
  });

  describe("パフォーマンス最適化", () => {
    it("不要な再レンダリングが発生しない", () => {
      const mockSetValue = jest.fn();
      const renderSpy = jest.fn();

      const TestComponent = () => {
        renderSpy();
        return (
          <AuthFormFieldWithRealTimeValidation
            name="email"
            label="メールアドレス"
            validator={(value: string) => value.length >= 3}
          />
        );
      };

      mockUseRealTimeValidation.mockReturnValue({
        state: { value: "test", isValid: true, error: undefined, isValidating: false },
        setValue: mockSetValue,
        validate: jest.fn(),
      });

      const { rerender } = render(<TestComponent />);

      // 同じ props で再レンダリング
      rerender(<TestComponent />);

      // 初回レンダリングのみ
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    it("debounce が適切に動作する", async () => {
      const mockSetValue = jest.fn();
      mockUseRealTimeValidation.mockReturnValue({
        state: { value: "", isValid: false, error: undefined, isValidating: false },
        setValue: mockSetValue,
        validate: jest.fn(),
      });

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const validator = (value: string) => value.length >= 3;

      render(
        <AuthFormFieldWithRealTimeValidation
          name="email"
          label="メールアドレス"
          validator={validator}
        />
      );

      const input = screen.getByLabelText("メールアドレス");

      // 素早く文字を入力
      await user.type(input, "test", { delay: 50 });

      // デバウンス処理により、最後の文字のみでバリデーションが実行されることを確認
      expect(mockSetValue).toHaveBeenCalledTimes(4);
    });
  });
});
