/**
 * RFC 7807 Problem Details types (shared across server/client).
 */

import type { ErrorCode } from "./types";

/**
 * バリデーションエラーの詳細
 */
export interface ValidationError {
  /** エラーが発生したフィールド・パラメータのポインタ */
  pointer: string;
  /** バリデーションエラーコード */
  code: string;
  /** エラーメッセージ */
  message: string;
}

/**
 * RFC 7807 Problem Details の基本構造
 */
export interface ProblemDetails {
  /** 問題タイプの一意識別子（URI）- 機械可読 */
  type: string;
  /** 問題の短い、人間可読な要約 */
  title: string;
  /** HTTPステータスコード */
  status: number;
  /** 問題の詳細な説明（この特定のインスタンス向け） */
  detail: string;
  /** 問題が発生したリソースの識別子（URI） */
  instance: string;

  // EventPay 拡張フィールド
  /** 機械可読なエラーコード（内部処理用） */
  code: ErrorCode;
  /** リクエスト追跡ID */
  correlation_id: string;
  /** リトライ可能かどうか */
  retryable: boolean;
  /** バリデーションエラーの詳細（該当する場合） */
  errors?: ValidationError[];
  /** 参考ドキュメントURL（該当する場合） */
  docs_url?: string;
  /** デバッグ情報（開発環境のみ） */
  debug?: string;
}
