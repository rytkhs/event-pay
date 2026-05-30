"use client";

import { useState, useCallback, useMemo, useEffect } from "react";

interface PasswordConfirmationState {
  password: string;
  confirmPassword: string;
  error: string;
}

interface PasswordConfirmationActions {
  setPassword: (password: string) => void;
  setConfirmPassword: (confirmPassword: string) => void;
  validateMatch: () => boolean;
  clearError: () => void;
}

interface PasswordConfirmationValidation {
  isMatching: boolean;
  hasError: boolean;
  isEmpty: boolean;
  iconType: "success" | "error" | "none";
}

interface UsePasswordConfirmationReturn {
  state: PasswordConfirmationState;
  actions: PasswordConfirmationActions;
  validation: PasswordConfirmationValidation;
}

export function usePasswordConfirmation(): UsePasswordConfirmationReturn {
  const [password, setPasswordState] = useState("");
  const [confirmPassword, setConfirmPasswordState] = useState("");
  const [error, setError] = useState("");

  // パスワード一致確認ロジック
  const validateMatch = useCallback((): boolean => {
    if (confirmPassword === "") {
      setError("確認用パスワードを入力してください");
      return false;
    }

    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return false;
    } else {
      setError("");
      return true;
    }
  }, [password, confirmPassword]);

  // パスワード設定
  const setPassword = useCallback((newPassword: string) => {
    setPasswordState(newPassword);
  }, []);

  // 確認パスワード設定
  const setConfirmPassword = useCallback((newConfirmPassword: string) => {
    setConfirmPasswordState(newConfirmPassword);
  }, []);

  // エラークリア
  const clearError = useCallback(() => {
    setError("");
  }, []);

  // リアルタイムバリデーション - 状態変更時の自動実行
  useEffect(() => {
    if (confirmPassword === "") {
      setError("");
    } else if (password !== confirmPassword) {
      setError("パスワードが一致しません");
    } else {
      setError("");
    }
  }, [password, confirmPassword]);

  // バリデーション状態の計算（メモ化）
  const validation = useMemo((): PasswordConfirmationValidation => {
    const hasError = error !== "";
    const isEmpty = confirmPassword === "";
    const isMatching = !isEmpty && !hasError && password === confirmPassword;

    // アイコンタイプの決定
    let iconType: "success" | "error" | "none" = "none";
    if (hasError) {
      iconType = "error";
    } else if (isMatching) {
      iconType = "success";
    }

    return {
      isMatching,
      hasError,
      isEmpty,
      iconType,
    };
  }, [password, confirmPassword, error]);

  return {
    state: {
      password,
      confirmPassword,
      error,
    },
    actions: {
      setPassword,
      setConfirmPassword,
      validateMatch,
      clearError,
    },
    validation,
  };
}
