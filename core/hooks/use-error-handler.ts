"use client";

import { useState, useCallback } from "react";

import { useToast } from "@core/contexts/toast-context";
import {
  handleClientError,
  getUserErrorMessage,
  isRetryableError,
  type ErrorDetails,
  type ErrorContext,
} from "@core/utils/error-handler.client";

interface UseErrorHandlerOptions {
  showToast?: boolean;
  defaultContext?: Partial<ErrorContext>;
}

interface ErrorState {
  error: ErrorDetails | null;
  isError: boolean;
  isRetryable: boolean;
}

/**
 * Problem Details のコードを ErrorDetails マッピングで使用しているコードへ変換
 * 既存のユーザーメッセージマッピングに合わせるための最低限のブリッジ
 */
function mapProblemCodeToErrorCode(problemCode: string | undefined): string {
  if (!problemCode) return "UNKNOWN_ERROR";
  switch (problemCode) {
    case "RATE_LIMITED":
      return "RATE_LIMIT_EXCEEDED";
    case "INTERNAL_ERROR":
      return "INTERNAL_SERVER_ERROR";
    default:
      return problemCode;
  }
}

function looksLikeProblemDetails(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const anyBody = body as Record<string, unknown>;
  return (
    typeof anyBody["type"] === "string" &&
    typeof anyBody["detail"] === "string" &&
    (typeof anyBody["code"] === "string" || typeof anyBody["status"] === "number")
  );
}

/**
 * エラーハンドリング用カスタムフック
 * 統一的なエラー処理とユーザーフィードバックを提供
 */
export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const { showToast = true, defaultContext = {} } = options;
  const { toast } = useToast();
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isError: false,
    isRetryable: false,
  });

  /**
   * エラーを処理する
   * @param error エラー
   * @param context 追加のコンテキスト
   */
  const handleError = useCallback(
    (error: unknown, context?: Partial<ErrorContext>) => {
      const fullContext = { ...defaultContext, ...context };
      const errorDetails = handleClientError(error, fullContext);

      // エラー状態を更新
      setErrorState({
        error: errorDetails,
        isError: true,
        isRetryable: isRetryableError(errorDetails),
      });

      // トースト通知を表示
      if (showToast) {
        toast({
          title: "エラーが発生しました",
          description: errorDetails.userMessage,
          variant: "destructive",
        });
      }

      return errorDetails;
    },
    [defaultContext, showToast, toast]
  );

  /**
   * APIエラーを処理する
   * @param response Fetch Response
   * @param context 追加のコンテキスト
   */
  const handleApiError = useCallback(
    async (response: Response, context?: Partial<ErrorContext>) => {
      try {
        const contentType = response.headers.get("content-type") || "";

        // 一度だけボディを読む。JSONでなければ null にして分岐
        let body: unknown = null;
        try {
          body = await response.clone().json();
        } catch {
          body = null;
        }

        // RFC7807: application/problem+json または それに準ずる構造
        if (contentType.includes("application/problem+json") || looksLikeProblemDetails(body)) {
          const problem = (body || {}) as { code?: string; detail?: string };
          const mappedCode = mapProblemCodeToErrorCode(problem.code);
          return handleError({ code: mappedCode }, context);
        }

        // Problem Details 以外は想定外エラーとして扱う
        return handleError("UNKNOWN_ERROR", context);
      } catch {
        return handleError("NETWORK_ERROR", context);
      }
    },
    [handleError]
  );

  /**
   * エラー状態をクリアする
   */
  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isError: false,
      isRetryable: false,
    });
  }, []);

  /**
   * 非同期関数をエラーハンドリング付きで実行する
   * @param asyncFn 非同期関数
   * @param context エラーコンテキスト
   * @returns 実行結果
   */
  const executeWithErrorHandling = useCallback(
    async <T>(asyncFn: () => Promise<T>, context?: Partial<ErrorContext>): Promise<T | null> => {
      try {
        clearError();
        return await asyncFn();
      } catch (error) {
        handleError(error, context);
        return null;
      }
    },
    [handleError, clearError]
  );

  /**
   * フォーム送信をエラーハンドリング付きで実行する
   * @param submitFn フォーム送信関数
   * @param context エラーコンテキスト
   * @returns 送信結果
   */
  const submitWithErrorHandling = useCallback(
    async <T>(
      submitFn: () => Promise<T>,
      context?: Partial<ErrorContext>
    ): Promise<{ success: boolean; data?: T; error?: ErrorDetails }> => {
      try {
        clearError();
        const data = await submitFn();
        return { success: true, data };
      } catch (error) {
        const errorDetails = handleError(error, { ...context, action: "form_submit" });
        return { success: false, error: errorDetails };
      }
    },
    [handleError, clearError]
  );

  return {
    // エラー状態
    ...errorState,

    // エラーハンドリング関数
    handleError,
    handleApiError,
    clearError,

    // ユーティリティ関数
    executeWithErrorHandling,
    submitWithErrorHandling,

    // ヘルパー関数
    getUserErrorMessage: (error: unknown) => getUserErrorMessage(error),
  };
}

/**
 * 参加フォーム専用のエラーハンドリングフック
 */
export function useParticipationErrorHandler() {
  return useErrorHandler({
    showToast: true,
    defaultContext: {
      action: "participation",
    },
  });
}
