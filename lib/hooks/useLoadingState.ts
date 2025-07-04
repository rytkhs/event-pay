import { useState, useCallback, useEffect, useRef } from "react";

interface LoadingTask {
  readonly id: string;
  readonly message: string;
  readonly progress?: number;
  readonly startTime: number;
}

interface LoadingState {
  readonly isLoading: boolean;
  readonly progress?: number;
  readonly message?: string;
  readonly canCancel: boolean;
  readonly error?: string;
  readonly activeTasks: readonly LoadingTask[];
  readonly estimatedTimeRemaining?: number;
}

interface UseLoadingStateOptions {
  readonly onCancel?: () => void;
  readonly onTimeout?: () => void;
  readonly persist?: boolean;
}

interface StartLoadingOptions {
  readonly canCancel?: boolean;
  readonly timeout?: number;
  readonly id?: string;
  readonly onTimeout?: () => void;
}

// 進捗値の型を制限
type Progress = number & { readonly __brand: "Progress" };

// 進捗値のバリデーション関数
function validateProgress(value: number): Progress {
  if (typeof value !== "number" || isNaN(value)) {
    throw new Error(`Invalid progress value: ${value}. Must be a number.`);
  }
  // 0-100の範囲にクランプ
  const clampedValue = Math.max(0, Math.min(100, value));
  return clampedValue as Progress;
}

/**
 * ローディング状態管理のカスタムフック
 * 複数のローディング処理、プログレス、キャンセル機能を提供
 */
export function useLoadingState(
  initialState?: Partial<LoadingState>,
  options?: UseLoadingStateOptions
) {
  const [state, setState] = useState<LoadingState>({
    isLoading: false,
    progress: undefined,
    message: undefined,
    canCancel: false,
    error: undefined,
    activeTasks: [],
    estimatedTimeRemaining: undefined,
    ...initialState,
  });

  const timeoutRef = useRef<NodeJS.Timeout>();
  const startTimeRef = useRef<number>();

  // 状態の永続化
  useEffect(() => {
    if (options?.persist) {
      const savedState = localStorage.getItem("loading-state");
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          setState((prev) => ({ ...prev, ...parsed }));
        } catch (error) {
          // テスト環境では console.error をスキップ
          if (process.env.NODE_ENV !== "test") {
            console.error("Failed to parse saved loading state:", error);
          }
        }
      }
    }
  }, [options?.persist]);

  useEffect(() => {
    if (options?.persist) {
      localStorage.setItem("loading-state", JSON.stringify(state));
    }
  }, [state, options?.persist]);

  // 推定残り時間の計算
  const calculateEstimatedTime = useCallback((progress: number, startTime: number) => {
    if (progress <= 0) return undefined;

    const elapsedTime = Date.now() - startTime;
    const progressRatio = progress / 100;
    const totalEstimatedTime = elapsedTime / progressRatio;
    const remainingTime = totalEstimatedTime - elapsedTime;

    return Math.max(0, Math.round(remainingTime));
  }, []);

  const startLoading = useCallback(
    (message: string = "処理中...", options?: StartLoadingOptions) => {
      const taskId = options?.id || Date.now().toString();
      const startTime = Date.now();
      startTimeRef.current = startTime;

      setState((prev) => {
        const newTask: LoadingTask = {
          id: taskId,
          message,
          progress: 0,
          startTime,
        };

        return {
          ...prev,
          isLoading: true,
          progress: 0,
          message,
          canCancel: options?.canCancel || false,
          error: undefined,
          activeTasks: [...prev.activeTasks, newTask],
        };
      });

      // タイムアウト設定
      if (options?.timeout) {
        // 既存のタイマーをクリア
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          options.onTimeout?.();
          setState((prev) => ({
            ...prev,
            isLoading: false,
            message: "タイムアウトしました",
            activeTasks: [],
          }));
        }, options.timeout);
      }
    },
    []
  );

  const updateProgress = useCallback(
    (progress: number, message?: string) => {
      try {
        const validatedProgress = validateProgress(progress);

        setState((prev) => {
          const estimatedTime = startTimeRef.current
            ? calculateEstimatedTime(validatedProgress, startTimeRef.current)
            : undefined;

          return {
            ...prev,
            progress: validatedProgress,
            message: message || prev.message,
            estimatedTimeRemaining: estimatedTime,
          };
        });
      } catch (error) {
        // テスト環境では console.error をスキップ
        if (process.env.NODE_ENV !== "test") {
          console.error("Progress update failed:", error);
        }
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Invalid progress value",
          activeTasks: [],
          estimatedTimeRemaining: undefined,
        }));
      }
    },
    [calculateEstimatedTime]
  );

  const stopLoading = useCallback((taskIdOrMessage?: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }

    setState((prev) => {
      // タスクIDが指定されている場合は、そのタスクのみを削除
      if (taskIdOrMessage && prev.activeTasks.some((task) => task.id === taskIdOrMessage)) {
        const remainingTasks = prev.activeTasks.filter((task) => task.id !== taskIdOrMessage);
        return {
          ...prev,
          activeTasks: remainingTasks,
          isLoading: remainingTasks.length > 0,
          progress: remainingTasks.length > 0 ? prev.progress : undefined,
          estimatedTimeRemaining:
            remainingTasks.length > 0 ? prev.estimatedTimeRemaining : undefined,
        };
      }

      // タスクIDが指定されていない場合は、全てのタスクを完了
      return {
        ...prev,
        isLoading: false,
        progress: undefined,
        message:
          taskIdOrMessage &&
          typeof taskIdOrMessage === "string" &&
          !prev.activeTasks.some((task) => task.id === taskIdOrMessage)
            ? taskIdOrMessage
            : undefined,
        activeTasks: [],
        estimatedTimeRemaining: undefined,
      };
    });
  }, []);

  const cancel = useCallback(() => {
    setState((prev) => {
      if (!prev.canCancel) return prev;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }

      options?.onCancel?.();

      return {
        ...prev,
        isLoading: false,
        message: "キャンセルされました",
        activeTasks: [],
        estimatedTimeRemaining: undefined,
      };
    });
  }, [options]);

  const setError = useCallback((error: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }

    setState((prev) => ({
      ...prev,
      isLoading: false,
      error,
      activeTasks: [],
      estimatedTimeRemaining: undefined,
    }));
  }, []);

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    state,
    startLoading,
    updateProgress,
    stopLoading,
    cancel,
    setError,
  };
}
