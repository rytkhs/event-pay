"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  handleClientError,
  getUserErrorMessage,
  isRetryableError,
  type ErrorDetails,
  type ErrorContext,
} from "@/lib/utils/error-handler";

export interface UseErrorHandlerOptions {
  showToast?: boolean;
  logErrors?: boolean;
  defaultContext?: Partial<ErrorContext>;
}

export interface ErrorState {
  error: ErrorDetails | null;
  isError: boolean;
  isRetryable: boolean;
}

/**
 * エラーハンドリング用カスタムフック
 * 統一的なエラー処理とユーザーフィードバックを提供
 */
export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const { showToast = true, logErrors = true, defaultContext = {} } = options;
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
        const errorData = await response.json();
        const errorCode = errorData.error?.code || "UNKNOWN_ERROR";
        return handleError(errorCode, context);
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
    logErrors: true,
    defaultContext: {
      action: "participation",
    },
  });
}

/**
 * 招待リンク専用のエラーハンドリングフック
 */
export function useInviteErrorHandler() {
  return useErrorHandler({
    showToast: true,
    logErrors: true,
    defaultContext: {
      action: "invite_access",
    },
  });
}

/**
 * ゲスト管理専用のエラーハンドリングフック
 */
export function useGuestErrorHandler() {
  return useErrorHandler({
    showToast: true,
    logErrors: true,
    defaultContext: {
      action: "guest_management",
    },
  });
}
