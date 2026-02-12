"use client";

import { useState, useCallback } from "react";

import { useToast } from "@core/contexts/toast-context";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import {
  handleClientError,
  getUserErrorMessage,
  isRetryableError,
  type ErrorContext,
  type AppError,
} from "@core/utils/error-handler.client";

interface UseErrorHandlerOptions {
  showToast?: boolean;
  defaultContext?: Partial<ErrorContext>;
}

interface ErrorState {
  error: AppError | null;
  isError: boolean;
  isRetryable: boolean;
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
      const fullContext = {
        ...defaultContext,
        ...context,
        additionalData: {
          ...defaultContext?.additionalData,
          ...context?.additionalData,
          status: response.status,
          url: response.url,
        },
      };

      try {
        const contentType = response.headers.get("content-type") || "";

        // 一度だけボディを読む。JSONでなければ null にして分岐
        let body: unknown = null;
        try {
          body = await response.clone().json();
        } catch {
          body = null;
        }

        // JSON / Problem Details はそのまま正規化へ
        if (
          contentType.includes("application/problem+json") ||
          contentType.includes("application/json")
        ) {
          if (body) {
            return handleError(body, fullContext);
          }
        }

        // JSONが取れない場合は想定外エラーとして扱う
        return handleError("UNKNOWN_ERROR", fullContext);
      } catch {
        return handleError("NETWORK_ERROR", fullContext);
      }
    },
    [defaultContext, handleError]
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
    async <T>(
      asyncFn: () => Promise<T>,
      context?: Partial<ErrorContext>
    ): Promise<AppResult<T>> => {
      try {
        clearError();
        const data = await asyncFn();
        return okResult(data);
      } catch (error) {
        const errorDetails = handleError(error, context);
        return errResult(errorDetails);
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
    ): Promise<AppResult<T>> => {
      try {
        clearError();
        const data = await submitFn();
        return okResult(data);
      } catch (error) {
        const errorDetails = handleError(error, { ...context, action: "form_submit" });
        return errResult(errorDetails);
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
    getUserErrorMessage,
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
