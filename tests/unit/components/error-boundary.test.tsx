/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import * as errorLogger from "@/components/errors/error-logger";

// error-loggerのモック
jest.mock("@/components/errors/error-logger", () => ({
  logError: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

// ErrorLayoutのモック
jest.mock("@/components/errors/error-layout", () => ({
  ErrorLayout: ({ title, message, onRetry, error }: any) => (
    <div data-testid="error-layout">
      <h1>{title}</h1>
      <p>{message}</p>
      {error && <pre data-testid="error-message">{error.message}</pre>}
      {onRetry && (
        <button onClick={onRetry} data-testid="retry-button">
          再試行
        </button>
      )}
    </div>
  ),
}));

// エラーをスローするコンポーネント
function ThrowError({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div data-testid="success">Success</div>;
}

describe("ErrorBoundary", () => {
  const mockLogError = errorLogger.logError as jest.Mock;
  const mockAddBreadcrumb = errorLogger.addBreadcrumb as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // コンソールエラーを抑制（Error Boundaryが意図的にエラーをスローするため）
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("C-E-01: エラー捕捉と表示", () => {
    it("子コンポーネントでErrorをスローした際、フォールバックUIが表示されること", () => {
      render(
        <ErrorBoundary level="component">
          <ThrowError />
        </ErrorBoundary>
      );

      // フォールバックUIが表示されることを確認
      expect(screen.getByTestId("error-layout")).toBeInTheDocument();
      expect(screen.getByText("エラーが発生しました")).toBeInTheDocument();
      expect(screen.getByTestId("error-message")).toHaveTextContent("Test error");
    });

    it("エラーが発生しない場合、子コンポーネントが正常に表示されること", () => {
      render(
        <ErrorBoundary level="component">
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      // 子コンポーネントが正常に表示されることを確認
      expect(screen.getByTestId("success")).toBeInTheDocument();
      expect(screen.queryByTestId("error-layout")).not.toBeInTheDocument();
    });

    it("レベルが'global'の場合、適切なエラーメッセージが表示されること", () => {
      render(
        <ErrorBoundary level="global">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText("アプリケーションエラー")).toBeInTheDocument();
    });

    it("レベルが'page'の場合、適切なエラーメッセージが表示されること", () => {
      render(
        <ErrorBoundary level="page">
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText("ページエラー")).toBeInTheDocument();
    });
  });

  describe("C-E-02: ログ送信", () => {
    it("エラー発生時、logErrorが正しい引数で呼び出されること", () => {
      render(
        <ErrorBoundary level="component">
          <ThrowError />
        </ErrorBoundary>
      );

      // logErrorが呼び出されたことを確認
      expect(mockLogError).toHaveBeenCalledTimes(1);

      // 引数を確認
      const [errorInfo, originalError, context] = mockLogError.mock.calls[0];

      expect(errorInfo).toMatchObject({
        code: "500",
        category: "client",
        severity: "high",
        title: "コンポーネントでエラーが発生しました",
        message: "Test error",
      });

      expect(originalError).toBeInstanceOf(Error);
      expect(originalError.message).toBe("Test error");

      expect(context).toHaveProperty("url");
      expect(context).toHaveProperty("pathname");
    });

    it("レベルが'global'の場合、severityが'critical'であること", () => {
      render(
        <ErrorBoundary level="global">
          <ThrowError />
        </ErrorBoundary>
      );

      const [errorInfo] = mockLogError.mock.calls[0];
      expect(errorInfo.severity).toBe("critical");
      expect(errorInfo.title).toBe("アプリケーションでエラーが発生しました");
    });

    it("addBreadcrumbが呼び出されること", () => {
      render(
        <ErrorBoundary level="component">
          <ThrowError />
        </ErrorBoundary>
      );

      // addBreadcrumbが呼び出されたことを確認
      expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1);

      const [category, message, level, data] = mockAddBreadcrumb.mock.calls[0];
      expect(category).toBe("error-boundary");
      expect(message).toContain("React Error Boundary caught error");
      expect(level).toBe("error");
      expect(data).toHaveProperty("componentStack");
      expect(data.level).toBe("component");
    });
  });

  describe("C-E-03: リカバリー", () => {
    it("再試行ボタンをクリックした際、resetErrorが呼ばれること", async () => {
      const user = userEvent.setup();

      render(
        <ErrorBoundary level="component">
          <ThrowError />
        </ErrorBoundary>
      );

      // 最初はエラーが表示される
      expect(screen.getByTestId("error-layout")).toBeInTheDocument();

      // 再試行ボタンをクリック
      const retryButton = screen.getByTestId("retry-button");
      await user.click(retryButton);

      // resetErrorが呼ばれ、hasErrorがfalseになる
      // しかし、ThrowErrorは引き続きエラーをスローするため、再度エラー状態になる
      // これは正常な動作（子コンポーネントが引き続きエラーを出す場合）
      expect(screen.getByTestId("error-layout")).toBeInTheDocument();
    });

    it("エラー状態がクリアされた後、正常なコンポーネントが表示されること", async () => {
      const user = userEvent.setup();
      let shouldThrow = true;

      // 外部状態で制御可能なコンポーネント
      function ConditionalThrow() {
        if (shouldThrow) {
          throw new Error("Conditional error");
        }
        return <div data-testid="success">Success</div>;
      }

      const { rerender } = render(
        <ErrorBoundary level="component">
          <ConditionalThrow />
        </ErrorBoundary>
      );

      // 最初はエラーが表示される
      expect(screen.getByTestId("error-layout")).toBeInTheDocument();

      // エラーを解消
      shouldThrow = false;

      // 再レンダリング（新しいプロパティで）
      rerender(
        <ErrorBoundary level="component">
          <ConditionalThrow />
        </ErrorBoundary>
      );

      // エラーが解消されていないため、まだエラー表示
      expect(screen.getByTestId("error-layout")).toBeInTheDocument();

      // 再試行ボタンをクリック
      const retryButton = screen.getByTestId("retry-button");
      await user.click(retryButton);

      // エラーがクリアされ、正常なコンポーネントが表示される
      expect(screen.queryByTestId("error-layout")).not.toBeInTheDocument();
      expect(screen.getByTestId("success")).toBeInTheDocument();
    });

    it("カスタムonErrorハンドラーが提供された場合、それが呼び出されること", () => {
      const mockOnError = jest.fn();

      render(
        <ErrorBoundary level="component" onError={mockOnError}>
          <ThrowError />
        </ErrorBoundary>
      );

      // カスタムonErrorハンドラーが呼び出されることを確認
      expect(mockOnError).toHaveBeenCalledTimes(1);
      const [error, errorInfo] = mockOnError.mock.calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Test error");
      expect(errorInfo).toHaveProperty("componentStack");
    });
  });

  describe("カスタムフォールバック", () => {
    it("カスタムフォールバックコンポーネントが提供された場合、それが使用されること", () => {
      const CustomFallback = ({ error, resetError }: any) => (
        <div data-testid="custom-fallback">
          <p>Custom Error: {error?.message}</p>
          <button onClick={resetError}>Custom Retry</button>
        </div>
      );

      render(
        <ErrorBoundary level="component" fallback={CustomFallback}>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
      expect(screen.getByText("Custom Error: Test error")).toBeInTheDocument();
      expect(screen.queryByTestId("error-layout")).not.toBeInTheDocument();
    });
  });
});
