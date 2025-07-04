/**
 * ValidationFeedback コンポーネントのテスト
 * TDD Red Phase - 失敗するテストを最初に書く
 */

import { render, screen } from "@testing-library/react";
import { ValidationFeedback } from "@/components/ui/ValidationFeedback";

describe("ValidationFeedback", () => {
  describe("状態表示", () => {
    it("neutral 状態では何も表示されない", () => {
      render(<ValidationFeedback state="neutral" />);

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByTestId("validation-icon")).not.toBeInTheDocument();
    });

    it("validating 状態でローディングインジケーターが表示される", () => {
      render(<ValidationFeedback state="validating" />);

      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByTestId("validation-loading")).toBeInTheDocument();
      expect(screen.getByLabelText("検証中")).toBeInTheDocument();
    });

    it("valid 状態で成功アイコンが表示される", () => {
      render(<ValidationFeedback state="valid" />);

      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByTestId("validation-success")).toBeInTheDocument();
      expect(screen.getByLabelText("入力値は有効です")).toBeInTheDocument();
    });

    it("invalid 状態でエラーアイコンが表示される", () => {
      render(<ValidationFeedback state="invalid" />);

      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByTestId("validation-error")).toBeInTheDocument();
      expect(screen.getByLabelText("入力値にエラーがあります")).toBeInTheDocument();
    });
  });

  describe("メッセージ表示", () => {
    it("valid 状態でメッセージが表示される", () => {
      render(<ValidationFeedback state="valid" message="メールアドレスは有効です" />);

      expect(screen.getByText("メールアドレスは有効です")).toBeInTheDocument();
    });

    it("invalid 状態でエラーメッセージが表示される", () => {
      render(
        <ValidationFeedback state="invalid" message="メールアドレスの形式が正しくありません" />
      );

      expect(screen.getByText("メールアドレスの形式が正しくありません")).toBeInTheDocument();
    });

    it("validating 状態でメッセージが表示される", () => {
      render(<ValidationFeedback state="validating" message="メールアドレスを確認中..." />);

      expect(screen.getByText("メールアドレスを確認中...")).toBeInTheDocument();
    });

    it("メッセージが未指定の場合はデフォルトメッセージが表示される", () => {
      render(<ValidationFeedback state="valid" />);

      expect(screen.getByText("入力値は有効です")).toBeInTheDocument();
    });
  });

  describe("アイコン表示", () => {
    it("showIcon が false の場合はアイコンが表示されない", () => {
      render(<ValidationFeedback state="valid" showIcon={false} message="有効です" />);

      expect(screen.queryByTestId("validation-success")).not.toBeInTheDocument();
      expect(screen.getByText("有効です")).toBeInTheDocument();
    });

    it("showIcon が true の場合はアイコンが表示される（デフォルト）", () => {
      render(<ValidationFeedback state="valid" showIcon={true} />);

      expect(screen.getByTestId("validation-success")).toBeInTheDocument();
    });

    it("showIcon が未指定の場合はアイコンが表示される", () => {
      render(<ValidationFeedback state="invalid" />);

      expect(screen.getByTestId("validation-error")).toBeInTheDocument();
    });
  });

  describe("アニメーション", () => {
    it("animate が true の場合はアニメーションクラスが適用される", () => {
      render(<ValidationFeedback state="valid" animate={true} data-testid="feedback-container" />);

      const container = screen.getByTestId("feedback-container");
      expect(container).toHaveClass("animate-fade-in");
    });

    it("animate が false の場合はアニメーションクラスが適用されない", () => {
      render(<ValidationFeedback state="valid" animate={false} data-testid="feedback-container" />);

      const container = screen.getByTestId("feedback-container");
      expect(container).not.toHaveClass("animate-fade-in");
    });

    it("animate が未指定の場合はアニメーションが適用される（デフォルト）", () => {
      render(<ValidationFeedback state="valid" data-testid="feedback-container" />);

      const container = screen.getByTestId("feedback-container");
      expect(container).toHaveClass("animate-fade-in");
    });
  });

  describe("アクセシビリティ", () => {
    it("適切な role 属性が設定される", () => {
      render(<ValidationFeedback state="valid" />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("aria-live 属性が設定される", () => {
      render(<ValidationFeedback state="invalid" />);

      const statusElement = screen.getByRole("status");
      expect(statusElement).toHaveAttribute("aria-live", "polite");
    });

    it("aria-atomic 属性が設定される", () => {
      render(<ValidationFeedback state="valid" />);

      const statusElement = screen.getByRole("status");
      expect(statusElement).toHaveAttribute("aria-atomic", "true");
    });

    it("アイコンに適切な aria-label が設定される", () => {
      render(<ValidationFeedback state="valid" />);

      expect(screen.getByLabelText("入力値は有効です")).toBeInTheDocument();
    });

    it("アイコンに aria-hidden が設定される（スクリーンリーダー向け）", () => {
      render(<ValidationFeedback state="valid" />);

      const icon = screen.getByTestId("validation-success");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });

    it("エラー状態でaria-describedby用のIDが設定される", () => {
      render(
        <ValidationFeedback state="invalid" message="エラーメッセージ" id="email-validation" />
      );

      const container = screen.getByRole("status");
      expect(container).toHaveAttribute("id", "email-validation");
    });
  });

  describe("スタイリング", () => {
    it("valid 状態で適切なスタイルが適用される", () => {
      render(<ValidationFeedback state="valid" data-testid="feedback-container" />);

      const container = screen.getByTestId("feedback-container");
      expect(container).toHaveClass("text-green-600");
    });

    it("invalid 状態で適切なスタイルが適用される", () => {
      render(<ValidationFeedback state="invalid" data-testid="feedback-container" />);

      const container = screen.getByTestId("feedback-container");
      expect(container).toHaveClass("text-red-600");
    });

    it("validating 状態で適切なスタイルが適用される", () => {
      render(<ValidationFeedback state="validating" data-testid="feedback-container" />);

      const container = screen.getByTestId("feedback-container");
      expect(container).toHaveClass("text-gray-600");
    });

    it("カスタムクラスが適用される", () => {
      render(
        <ValidationFeedback
          state="valid"
          className="custom-class"
          data-testid="feedback-container"
        />
      );

      const container = screen.getByTestId("feedback-container");
      expect(container).toHaveClass("custom-class");
    });
  });

  describe("サイズ変更", () => {
    it("small サイズのアイコンが適用される", () => {
      render(<ValidationFeedback state="valid" size="small" />);

      const icon = screen.getByTestId("validation-success");
      expect(icon).toHaveClass("w-3", "h-3");
    });

    it("medium サイズのアイコンが適用される（デフォルト）", () => {
      render(<ValidationFeedback state="valid" />);

      const icon = screen.getByTestId("validation-success");
      expect(icon).toHaveClass("w-4", "h-4");
    });

    it("large サイズのアイコンが適用される", () => {
      render(<ValidationFeedback state="valid" size="large" />);

      const icon = screen.getByTestId("validation-success");
      expect(icon).toHaveClass("w-5", "h-5");
    });
  });

  describe("レスポンシブ表示", () => {
    it("モバイルでコンパクトな表示になる", () => {
      render(
        <ValidationFeedback
          state="valid"
          message="長いメッセージがここに表示されます"
          responsive={true}
          data-testid="feedback-container"
        />
      );

      const container = screen.getByTestId("feedback-container");
      expect(container).toHaveClass("responsive-feedback");
    });

    it("responsive が false の場合は通常表示", () => {
      render(
        <ValidationFeedback state="valid" responsive={false} data-testid="feedback-container" />
      );

      const container = screen.getByTestId("feedback-container");
      expect(container).not.toHaveClass("responsive-feedback");
    });
  });

  describe("複数の検証状態", () => {
    it("複数の検証結果を同時に表示できる", () => {
      render(
        <ValidationFeedback
          state="invalid"
          validationResults={[
            { field: "email", valid: false, message: "メールアドレスが無効です" },
            { field: "password", valid: true, message: "パスワードは有効です" },
          ]}
        />
      );

      expect(screen.getByText("メールアドレスが無効です")).toBeInTheDocument();
      expect(screen.getByText("パスワードは有効です")).toBeInTheDocument();
    });

    it("部分的な検証結果を表示できる", () => {
      render(
        <ValidationFeedback
          state="validating"
          validationResults={[
            { field: "email", valid: true, message: "メールアドレスは有効です" },
            {
              field: "password",
              valid: false,
              isValidating: true,
              message: "パスワードを確認中...",
            },
          ]}
        />
      );

      expect(screen.getByText("メールアドレスは有効です")).toBeInTheDocument();
      expect(screen.getByText("パスワードを確認中...")).toBeInTheDocument();
    });
  });
});
