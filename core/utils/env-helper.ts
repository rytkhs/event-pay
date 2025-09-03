/**
 * 環境変数ヘルパーユーティリティ
 * Non-null assertionを排除し、適切なエラーハンドリングを提供
 */

import { logger } from "@core/logging/app-logger";

/**
 * 必須環境変数を取得
 * 値が存在しない場合は明確なエラーメッセージでthrow
 */
export function getRequiredEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    const errorMessage = `Missing required environment variable: ${key}`;
    logger.error(errorMessage, {
      tag: "envVarMissing",
      variable_name: key,
    });
    throw new Error(errorMessage);
  }
  return value;
}

/**
 * オプション環境変数を取得
 * 値が存在しない場合はdefaultValueまたはundefinedを返す
 */
export function getOptionalEnvVar(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

/**
 * 複数の必須環境変数を一括チェック
 * いずれかが不足している場合はまとめてエラーを報告
 */
export function validateRequiredEnvVars(keys: string[]): Record<string, string> {
  const missing: string[] = [];
  const result: Record<string, string> = {};

  for (const key of keys) {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
    } else {
      result[key] = value;
    }
  }

  if (missing.length > 0) {
    const errorMessage = `Missing required environment variables: ${missing.join(", ")}`;
    logger.error(errorMessage, {
      tag: "envVarsValidationFailed",
      missing_variables: missing,
    });
    throw new Error(errorMessage);
  }

  return result;
}

/**
 * 開発環境向けの環境変数警告
 * 本番で必要だが開発で任意の変数に対して警告を出力
 */
export function warnIfMissingOptionalEnvVar(key: string, description?: string): void {
  if (!process.env[key]) {
    const message = `Environment variable ${key} is not set${description ? ` - ${description}` : ""}`;
    logger.warn(message, {
      tag: "envVarOptionalMissing",
      variable_name: key,
      description,
    });
  }
}
