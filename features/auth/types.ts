/**
 * 認証関連型定義（auth feature types）
 */

import { Database } from "@/types/database";

// ユーザー型（データベーススキーマに合わせる）
export type User = Database["public"]["Tables"]["users"]["Row"];

// 認証状態の型
export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

// ログインフォーム入力
export interface LoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

// 登録フォーム入力（zod推論型を使用）
export interface RegisterInput {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  acceptTerms: boolean;
}

// パスワードリセット入力
export interface PasswordResetInput {
  email: string;
}

// パスワード更新入力
export interface PasswordUpdateInput {
  password: string;
  confirmPassword: string;
}

// プロファイル更新入力
export interface ProfileUpdateInput {
  name: string;
  email?: string;
}

// 認証エラー種別
export enum AuthErrorType {
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  USER_NOT_FOUND = "USER_NOT_FOUND",
  EMAIL_NOT_CONFIRMED = "EMAIL_NOT_CONFIRMED",
  WEAK_PASSWORD = "WEAK_PASSWORD",
  EMAIL_ALREADY_REGISTERED = "EMAIL_ALREADY_REGISTERED",
  RATE_LIMITED = "RATE_LIMITED",
  NETWORK_ERROR = "NETWORK_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

// 認証エラークラス
export class AuthError extends Error {
  constructor(
    public type: AuthErrorType,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = "AuthError";
  }
}
