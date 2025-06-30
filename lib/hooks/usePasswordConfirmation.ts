import { useState, useCallback, useMemo } from "react";

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
  className: string;
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
      setError("");
      return true;
    }

    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return false;
    } else {
      setError("");
      return true;
    }
  }, [password, confirmPassword]);

  // パスワード設定（バリデーション付き）
  const setPassword = useCallback(
    (newPassword: string) => {
      setPasswordState(newPassword);
      // 確認パスワードが入力済みの場合は再バリデーション
      if (confirmPassword !== "") {
        // 次のレンダリングサイクルでバリデーションを実行
        setTimeout(() => {
          if (confirmPassword !== newPassword) {
            setError("パスワードが一致しません");
          } else {
            setError("");
          }
        }, 0);
      }
    },
    [confirmPassword]
  );

  // 確認パスワード設定（バリデーション付き）
  const setConfirmPassword = useCallback(
    (newConfirmPassword: string) => {
      setConfirmPasswordState(newConfirmPassword);
      // リアルタイムバリデーション
      setTimeout(() => {
        if (newConfirmPassword === "") {
          setError("");
        } else if (password !== newConfirmPassword) {
          setError("パスワードが一致しません");
        } else {
          setError("");
        }
      }, 0);
    },
    [password]
  );

  // エラークリア
  const clearError = useCallback(() => {
    setError("");
  }, []);

  // バリデーション状態の計算（メモ化）
  const validation = useMemo((): PasswordConfirmationValidation => {
    const hasError = error !== "";
    const isEmpty = confirmPassword === "";
    const isMatching = !isEmpty && !hasError && password === confirmPassword;

    // CSSクラス名の生成
    let className = "w-full p-2 border rounded transition-colors";
    if (hasError) {
      className += " border-red-500 focus:ring-red-500";
    } else if (isMatching) {
      className += " border-green-500 focus:ring-green-500";
    } else {
      className += " border-gray-300 focus:ring-blue-500";
    }

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
      className,
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
