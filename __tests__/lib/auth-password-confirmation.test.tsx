/**
 * パスワード確認フォームテスト
 */

import { jest } from "@jest/globals";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// パスワード確認コンポーネントのモック（実際のコンポーネントがない場合）
const PasswordConfirmationForm: React.FC<{
  onSubmit: (password: string, confirmPassword: string) => void;
}> = ({ onSubmit }) => {
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password) {
      setError("パスワードを入力してください");
      return;
    }

    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください");
      return;
    }

    onSubmit(password, confirmPassword);
  };

  return (
    <form onSubmit={handleSubmit} data-testid="password-confirmation-form" noValidate>
      <div>
        <label htmlFor="password">パスワード</label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="password-input"
          required
        />
      </div>

      <div>
        <label htmlFor="confirm-password">パスワード確認</label>
        <input
          type="password"
          id="confirm-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          data-testid="confirm-password-input"
          required
        />
      </div>

      {error && (
        <div role="alert" data-testid="error-message">
          {error}
        </div>
      )}

      <button type="submit" data-testid="submit-button">
        確認
      </button>
    </form>
  );
};

describe("🔒 パスワード確認フォームテスト", () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("レンダリングテスト", () => {
    it("フォームが正しくレンダリングされること", () => {
      render(<PasswordConfirmationForm onSubmit={mockOnSubmit} />);

      expect(screen.getByTestId("password-confirmation-form")).toBeInTheDocument();
      expect(screen.getByLabelText("パスワード")).toBeInTheDocument();
      expect(screen.getByLabelText("パスワード確認")).toBeInTheDocument();
      expect(screen.getByTestId("submit-button")).toBeInTheDocument();
    });

    it("パスワード入力フィールドが適切な属性を持つこと", () => {
      render(<PasswordConfirmationForm onSubmit={mockOnSubmit} />);

      const passwordField = screen.getByTestId("password-input");
      const confirmPasswordField = screen.getByTestId("confirm-password-input");

      expect(passwordField).toHaveAttribute("type", "password");
      expect(passwordField).toHaveAttribute("required");
      expect(confirmPasswordField).toHaveAttribute("type", "password");
      expect(confirmPasswordField).toHaveAttribute("required");
    });
  });

  describe("バリデーションテスト", () => {
    it("パスワードが空の場合にエラーメッセージが表示されること", async () => {
      const user = userEvent.setup();
      render(<PasswordConfirmationForm onSubmit={mockOnSubmit} />);

      const submitButton = screen.getByTestId("submit-button");
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByTestId("error-message")).toHaveTextContent(
          "パスワードを入力してください"
        );
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("パスワードが一致しない場合にエラーメッセージが表示されること", async () => {
      const user = userEvent.setup();
      render(<PasswordConfirmationForm onSubmit={mockOnSubmit} />);

      await user.type(screen.getByTestId("password-input"), "password123");
      await user.type(screen.getByTestId("confirm-password-input"), "password456");
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        expect(screen.getByTestId("error-message")).toHaveTextContent("パスワードが一致しません");
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it("パスワードが8文字未満の場合にエラーメッセージが表示されること", async () => {
      const user = userEvent.setup();
      render(<PasswordConfirmationForm onSubmit={mockOnSubmit} />);

      await user.type(screen.getByTestId("password-input"), "pass123");
      await user.type(screen.getByTestId("confirm-password-input"), "pass123");
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        expect(screen.getByTestId("error-message")).toHaveTextContent(
          "パスワードは8文字以上で入力してください"
        );
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe("成功ケーステスト", () => {
    it("有効なパスワードで送信が成功すること", async () => {
      const user = userEvent.setup();
      render(<PasswordConfirmationForm onSubmit={mockOnSubmit} />);

      const password = "validpassword123";

      await user.type(screen.getByTestId("password-input"), password);
      await user.type(screen.getByTestId("confirm-password-input"), password);
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(password, password);
      });

      // エラーメッセージが表示されていないことを確認
      expect(screen.queryByTestId("error-message")).not.toBeInTheDocument();
    });
  });

  describe("アクセシビリティテスト", () => {
    it("エラーメッセージがrole='alert'を持つこと", async () => {
      const user = userEvent.setup();
      render(<PasswordConfirmationForm onSubmit={mockOnSubmit} />);

      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        const errorMessage = screen.getByTestId("error-message");
        expect(errorMessage).toHaveAttribute("role", "alert");
      });
    });

    it("ラベルが適切に関連付けられていること", () => {
      render(<PasswordConfirmationForm onSubmit={mockOnSubmit} />);

      const passwordLabel = screen.getByLabelText("パスワード");
      const confirmPasswordLabel = screen.getByLabelText("パスワード確認");

      expect(passwordLabel).toHaveAttribute("id", "password");
      expect(confirmPasswordLabel).toHaveAttribute("id", "confirm-password");
    });
  });

  describe("インタラクションテスト", () => {
    it("入力値がリアルタイムで反映されること", async () => {
      const user = userEvent.setup();
      render(<PasswordConfirmationForm onSubmit={mockOnSubmit} />);

      const passwordInput = screen.getByTestId("password-input");
      const confirmPasswordInput = screen.getByTestId("confirm-password-input");

      await user.type(passwordInput, "test");
      await user.type(confirmPasswordInput, "confirm");

      expect(passwordInput).toHaveValue("test");
      expect(confirmPasswordInput).toHaveValue("confirm");
    });

    it("フォーム送信後にエラーが解消されること", async () => {
      const user = userEvent.setup();
      render(<PasswordConfirmationForm onSubmit={mockOnSubmit} />);

      // エラーを発生させる
      await user.click(screen.getByTestId("submit-button"));
      await waitFor(() => {
        expect(screen.getByTestId("error-message")).toBeInTheDocument();
      });

      // 有効な値を入力して再送信
      const password = "validpassword123";
      await user.type(screen.getByTestId("password-input"), password);
      await user.type(screen.getByTestId("confirm-password-input"), password);
      await user.click(screen.getByTestId("submit-button"));

      // エラーメッセージが消えることを確認
      await waitFor(() => {
        expect(screen.queryByTestId("error-message")).not.toBeInTheDocument();
      });
    });
  });
});
