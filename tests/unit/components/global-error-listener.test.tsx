/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, waitFor } from "@testing-library/react";
import React from "react";

import { GlobalErrorListener } from "@/components/errors/global-error-listener";
import * as errorLogger from "@/components/errors/error-logger";

// PromiseRejectionEventのポリフィル（JSDOMには存在しないため）
class MockPromiseRejectionEvent extends Event {
  promise: Promise<any>;
  reason: any;

  constructor(type: string, init: { promise: Promise<any>; reason: any }) {
    super(type);
    this.promise = init.promise;
    this.reason = init.reason;
  }
}

// グローバルに設定
(global as any).PromiseRejectionEvent = MockPromiseRejectionEvent;

// error-loggerのモック
jest.mock("@/components/errors/error-logger", () => ({
  logError: jest.fn(),
}));

describe("GlobalErrorListener", () => {
  const mockLogError = errorLogger.logError as jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // コンソールエラーを抑制（ErrorEventはコンソールにエラーを出力するため）
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // イベントリスナーをクリーンアップ
    jest.restoreAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe("C-G-01: window.onerror捕捉", () => {
    it("window error eventが発生した際、logErrorが呼び出されること", async () => {
      // コンポーネントをレンダリング
      const { unmount } = render(<GlobalErrorListener />);

      // ErrorEventを作成してdispatch
      const errorEvent = new ErrorEvent("error", {
        message: "Test error message",
        error: new Error("Test error"),
      });

      window.dispatchEvent(errorEvent);

      // logErrorが呼び出されるのを待つ
      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalledTimes(1);
      });

      // 引数を確認
      const [errorInfo, originalError] = mockLogError.mock.calls[0];

      expect(errorInfo).toMatchObject({
        code: "500",
        category: "client",
        severity: "high",
        title: "Uncaught Error",
        message: "Test error message",
      });

      expect(originalError).toBeInstanceOf(Error);
      expect(originalError.message).toBe("Test error");

      // クリーンアップ
      unmount();
    });

    it("カテゴリが'client'であること", async () => {
      render(<GlobalErrorListener />);

      const errorEvent = new ErrorEvent("error", {
        message: "Another test error",
        error: new Error("Another error"),
      });

      window.dispatchEvent(errorEvent);

      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalled();
      });

      const [errorInfo] = mockLogError.mock.calls[0];
      expect(errorInfo.category).toBe("client");
    });

    it("複数のエラーイベントが発生した場合、それぞれ記録されること", async () => {
      render(<GlobalErrorListener />);

      // 最初のエラー
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: "First error",
          error: new Error("First"),
        })
      );

      // 2番目のエラー
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: "Second error",
          error: new Error("Second"),
        })
      );

      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalledTimes(2);
      });

      const firstCall = mockLogError.mock.calls[0][0];
      const secondCall = mockLogError.mock.calls[1][0];

      expect(firstCall.message).toBe("First error");
      expect(secondCall.message).toBe("Second error");
    });
  });

  describe("C-G-02: Unhandled Rejection捕捉", () => {
    it("unhandledrejection eventが発生した際、logErrorが呼び出されること", async () => {
      render(<GlobalErrorListener />);

      const error = new Error("Promise rejection");
      // Promiseは実際には作成せず、イベントのみを作成
      const rejectionEvent = new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(), // resolve済みのPromiseを使用
        reason: error,
      });

      window.dispatchEvent(rejectionEvent);

      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalledTimes(1);
      });

      const [errorInfo, originalError] = mockLogError.mock.calls[0];

      expect(errorInfo).toMatchObject({
        code: "500",
        category: "client",
        severity: "high",
        title: "Unhandled Promise Rejection",
      });

      expect(originalError).toBeInstanceOf(Error);
      expect(originalError.message).toBe("Promise rejection");
    });

    it("Promiseの理由が記録されること", async () => {
      render(<GlobalErrorListener />);

      const rejectionReason = "Custom rejection reason";
      const rejectionEvent = new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: rejectionReason,
      });

      window.dispatchEvent(rejectionEvent);

      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalledTimes(1);
      });

      const [errorInfo, originalError] = mockLogError.mock.calls[0];

      expect(errorInfo.message).toBe(rejectionReason);
      expect(originalError).toBeUndefined(); // reasonがErrorでない場合はundefined
    });

    it("reasonがErrorインスタンスの場合、それが渡されること", async () => {
      render(<GlobalErrorListener />);

      const errorReason = new Error("Error as reason");
      const rejectionEvent = new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: errorReason,
      });

      window.dispatchEvent(rejectionEvent);

      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalledTimes(1);
      });

      const [errorInfo, originalError] = mockLogError.mock.calls[0];

      // String(error)は"Error: Error as reason"という形式になる
      expect(errorInfo.message).toContain("Error as reason");
      expect(originalError).toBeInstanceOf(Error);
      expect(originalError.message).toBe("Error as reason");
    });

    it("reasonがErrorでない場合、文字列に変換されること", async () => {
      render(<GlobalErrorListener />);

      const rejectionEvent = new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: { message: "Object rejection" },
      });

      window.dispatchEvent(rejectionEvent);

      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalledTimes(1);
      });

      const [errorInfo, originalError] = mockLogError.mock.calls[0];

      expect(errorInfo.message).toBe("[object Object]");
      expect(originalError).toBeUndefined();
    });
  });

  describe("イベントリスナーのクリーンアップ", () => {
    it("コンポーネントのアンマウント時、イベントリスナーが削除されること", async () => {
      const { unmount } = render(<GlobalErrorListener />);

      // 最初のエラーでlogErrorが呼ばれることを確認（エラーはundefinedにして実際のエラーをスローしない）
      const errorEvent1 = new ErrorEvent("error", {
        message: "Before unmount",
        filename: "test.js",
        lineno: 1,
        colno: 1,
      });

      window.dispatchEvent(errorEvent1);

      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalledTimes(1);
      });

      // コンポーネントをアンマウント
      unmount();
      mockLogError.mockClear();

      // アンマウント後のエラーイベント（エラーはundefined）
      const errorEvent2 = new ErrorEvent("error", {
        message: "After unmount",
        filename: "test.js",
        lineno: 1,
        colno: 1,
      });

      window.dispatchEvent(errorEvent2);

      // 少し待機
      await new Promise((resolve) => setTimeout(resolve, 100));

      // logErrorが呼ばれていないことを確認
      expect(mockLogError).not.toHaveBeenCalled();
    });
  });

  describe("コンポーネントのレンダリング", () => {
    it("nullを返すこと（何もレンダリングしない）", () => {
      const { container } = render(<GlobalErrorListener />);

      expect(container.firstChild).toBeNull();
    });
  });
});
