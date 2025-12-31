/**
 * 環境変数ヘルパーユーティリティ
 * Non-null assertionを排除し、適切なエラーハンドリングを提供
 */

import { logger } from "@core/logging/app-logger";
import { handleServerError } from "@core/utils/error-handler.server";

import { getEnv } from "./cloudflare-env";

/**
 * 必須環境変数を取得
 * 値が存在しない場合は明確なエラーメッセージでthrow
 */
export function getRequiredEnvVar(key: string): string {
  const value = (getEnv() as unknown as Record<string, string | undefined>)[key];
  if (!value) {
    const errorMessage = `Missing required environment variable: ${key}`;
    handleServerError("ENV_VAR_MISSING", {
      category: "system",
      action: "env_validation",
      actorType: "system",
      additionalData: {
        variable_name: key,
      },
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
  return (getEnv() as unknown as Record<string, string | undefined>)[key] ?? defaultValue;
}

/**
 * 複数の必須環境変数を一括チェック
 * いずれかが不足している場合はまとめてエラーを報告
 */
export function validateRequiredEnvVars(keys: string[]): Record<string, string> {
  const missing: string[] = [];
  const result: Record<string, string> = {};
  const env = getEnv() as unknown as Record<string, string | undefined>;

  for (const key of keys) {
    const value = env[key];
    if (!value) {
      missing.push(key);
    } else {
      result[key] = value;
    }
  }

  if (missing.length > 0) {
    const errorMessage = `Missing required environment variables: ${missing.join(", ")}`;
    handleServerError("ENV_VAR_MISSING", {
      category: "system",
      action: "env_validation",
      actorType: "system",
      additionalData: {
        missing_variables: missing,
      },
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
  if (!(getEnv() as unknown as Record<string, string | undefined>)[key]) {
    const message = `Environment variable ${key} is not set${description ? ` - ${description}` : ""}`;
    logger.warn(message, {
      category: "system",
      action: "env_validation",
      actor_type: "system",
      variable_name: key,
      description,
      outcome: "failure",
    });
  }
}
