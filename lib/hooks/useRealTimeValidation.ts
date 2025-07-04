import { useState, useCallback, useEffect, useRef } from "react";
import { debounceValidation } from "@/lib/utils/debounceValidation";
import { createAsyncValidationErrorHandler } from "@/lib/utils/errorHandling";
import type {
  ValidationState,
  ValidationOptions,
  SyncValidator,
  UseRealTimeValidationReturn,
} from "@/lib/types/validation";

export function useRealTimeValidation(
  initialValue: string,
  validator: SyncValidator,
  options: ValidationOptions = {}
): UseRealTimeValidationReturn {
  const { debounceMs = 300, asyncValidator, validateOnBlur = true } = options;

  const [state, setState] = useState<ValidationState>({
    value: initialValue,
    isValid: false,
    error: undefined,
    isValidating: false,
  });

  const isMountedRef = useRef(true);
  const asyncValidationRef = useRef<Promise<void> | null>(null);

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 同期バリデーション結果処理
  const processSyncValidation = useCallback(
    (value: string) => {
      const syncResult = validator(value);
      const isValid = syncResult === true;
      const error = typeof syncResult === "string" ? syncResult : undefined;
      return { isValid, error };
    },
    [validator]
  );

  // 状態更新ヘルパー
  const updateValidationState = useCallback((updates: Partial<ValidationState>) => {
    if (!isMountedRef.current) return;
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // バリデーション実行関数
  const runValidation = useCallback(
    async (value: string) => {
      if (!isMountedRef.current) return;

      const { isValid, error } = processSyncValidation(value);

      if (!asyncValidator) {
        updateValidationState({ isValid, error, isValidating: false });
        return;
      }

      // 非同期バリデーション開始
      updateValidationState({ isValid: false, error, isValidating: true });

      try {
        const asyncValidationPromise = asyncValidator(value);
        asyncValidationRef.current = asyncValidationPromise.then(() => {});

        const asyncResult = await asyncValidationPromise;

        const finalIsValid = isValid && asyncResult;
        const finalError = finalIsValid ? undefined : error;

        updateValidationState({
          isValid: finalIsValid,
          error: finalError,
          isValidating: false,
        });
      } catch (err) {
        const errorHandler = createAsyncValidationErrorHandler();
        const errorMessage = errorHandler(err);
        updateValidationState({
          isValid: false,
          error: errorMessage,
          isValidating: false,
        });
      }
    },
    [processSyncValidation, asyncValidator, updateValidationState]
  );

  // デバウンス付きバリデーション
  const debouncedValidation = useCallback(
    debounceValidation(runValidation, debounceMs),
    [runValidation, debounceMs]
  );

  // 値が変更されたかどうかをチェック
  const shouldSkipValidation = useCallback((prevValue: string, newValue: string) => {
    return prevValue === newValue || (prevValue === "" && newValue === "");
  }, []);

  // 値を設定する関数
  const setValue = useCallback(
    (newValue: string) => {
      setState((prev) => {
        if (shouldSkipValidation(prev.value, newValue)) {
          return prev;
        }

        const newState = {
          ...prev,
          value: newValue,
          isValidating: false,
        };

        // デバウンス付きでバリデーション実行
        debouncedValidation(newValue);

        return newState;
      });
    },
    [debouncedValidation, shouldSkipValidation]
  );

  // 手動バリデーション（フォーカス移動時など）
  const validate = useCallback(() => {
    if (validateOnBlur) {
      // 即座にバリデーション実行
      runValidation(state.value);
    } else {
      // デバウンス付きでバリデーション実行
      debouncedValidation(state.value);
    }
  }, [state.value, runValidation, debouncedValidation, validateOnBlur]);

  return {
    state,
    setValue,
    validate,
  };
}
