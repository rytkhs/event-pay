// API エラーハンドリング共通ユーティリティ

import { NextResponse } from "next/server";
import { ApiError, ApiResponse } from "@/lib/types/api-response";

/**
 * API エラーオブジェクトを作成
 */
export function createApiError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiError {
  return { code, message, details };
}

/**
 * エラーレスポンスを作成
 */
export function createErrorResponse(
  error: ApiError,
  status: number = 500
): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * 成功レスポンスを作成
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * 定義済みエラーコード
 */
export const ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  DATABASE_ERROR: "DATABASE_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;
