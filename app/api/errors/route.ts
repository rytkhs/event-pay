import { NextRequest, NextResponse } from "next/server";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { AppError, isErrorCode } from "@core/errors";
import { respondWithCode, respondWithProblem } from "@core/errors/server";
import type { ErrorCategory, ErrorCode } from "@core/errors/types";
import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { notifyError } from "@core/utils/error-handler.server";
import { errorReportSchema } from "@core/validation/error-report";

import type { Database } from "@/types/database";

// レート制限設定
const ratelimit =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(50, "1 m"), // 1分間に50リクエスト
        analytics: true,
      })
    : null;

type LogCategory = Database["public"]["Enums"]["log_category_enum"];

const LOG_CATEGORY_VALUES: LogCategory[] = [
  "authentication",
  "authorization",
  "event_management",
  "attendance",
  "payment",
  "settlement",
  "stripe_webhook",
  "stripe_connect",
  "email",
  "export",
  "security",
  "system",
];

const ERROR_CATEGORY_VALUES: ErrorCategory[] = [
  "system",
  "business",
  "validation",
  "auth",
  "payment",
  "external",
  "not-found",
  "security",
  "unknown",
];

const ERROR_CATEGORY_TO_LOG_CATEGORY: Record<ErrorCategory, LogCategory> = {
  system: "system",
  external: "system",
  auth: "authentication",
  validation: "event_management",
  business: "event_management",
  payment: "payment",
  "not-found": "event_management",
  security: "security",
  unknown: "system",
};

function isLogCategory(value: string): value is LogCategory {
  return LOG_CATEGORY_VALUES.includes(value as LogCategory);
}

function isErrorCategory(value: string): value is ErrorCategory {
  return ERROR_CATEGORY_VALUES.includes(value as ErrorCategory);
}

function resolveLogCategory(raw: unknown, fallback: ErrorCategory): LogCategory {
  if (typeof raw === "string") {
    if (isLogCategory(raw)) {
      return raw;
    }
    if (isErrorCategory(raw)) {
      return ERROR_CATEGORY_TO_LOG_CATEGORY[raw];
    }
  }
  return ERROR_CATEGORY_TO_LOG_CATEGORY[fallback];
}

const MAX_CLIENT_MESSAGE_LENGTH = 200;

function sanitizeClientMessage(message: string): string {
  return message.replace(/[\r\n]+/g, " ").slice(0, MAX_CLIENT_MESSAGE_LENGTH);
}

export async function POST(req: NextRequest) {
  try {
    const baseLogContext = { category: "system" as const, actorType: "system" as const };
    const successHeaders = {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    };

    // 1. レート制限チェック
    if (ratelimit) {
      const forwarded = req.headers.get("x-forwarded-for");
      const ip =
        req.headers.get("cf-connecting-ip") || (forwarded ? forwarded.split(",")[0] : "unknown");

      const { success: rateLimitOk, remaining } = await ratelimit.limit(`error_log_${ip}`);

      if (!rateLimitOk) {
        return respondWithCode("RATE_LIMITED", {
          instance: "/api/errors",
          detail: "Too many requests",
          logContext: { ...baseLogContext, action: "error_collection_rate_limited" },
          headers: {
            "X-RateLimit-Remaining": String(remaining),
          },
        });
      }
    }

    // 2. バリデーション
    const body = await req.json();
    const validation = errorReportSchema.safeParse(body);

    if (!validation.success) {
      return respondWithCode("VALIDATION_ERROR", {
        instance: "/api/errors",
        detail: "Invalid request body",
        logContext: { ...baseLogContext, action: "error_collection_invalid_request" },
      });
    }

    const { data } = validation;
    const rawContext = (data.error.context ?? {}) as Record<string, unknown>;
    const rawLogCategory =
      (typeof rawContext.logCategory === "string" && rawContext.logCategory) ||
      (typeof rawContext.category === "string" && rawContext.category) ||
      data.error.category;
    const action = (typeof rawContext.action === "string" && rawContext.action) || "client_error";
    const resolvedCode: ErrorCode =
      data.error.code && isErrorCode(data.error.code) ? data.error.code : "UNKNOWN_ERROR";
    const sanitizedMessage = sanitizeClientMessage(data.error.message);
    const sanitizedUserMessage = data.error.userMessage
      ? sanitizeClientMessage(data.error.userMessage)
      : undefined;
    const appError = new AppError(resolvedCode, {
      message: `Client error reported: ${resolvedCode}`,
      retryable: data.error.retryable,
      correlationId: data.error.correlationId,
      details: {
        title: data.error.title,
        context: rawContext,
        clientMessage: sanitizedMessage,
        clientUserMessage: sanitizedUserMessage,
      },
    });
    const logCategory = resolveLogCategory(rawLogCategory, appError.category);

    const supabase = await createAuditedAdminClient(
      AdminReason.ERROR_COLLECTION,
      "Client Error Collection"
    );

    // 4. 重複チェック
    const { shouldLogError } = await import("@core/logging/deduplication");
    const shouldLog = await shouldLogError(data.error.message, data.stackTrace);

    if (!shouldLog) {
      return new NextResponse(null, { status: 204, headers: successHeaders });
    }

    // 5. DB保存
    const { error: insertError } = await supabase.from("system_logs").insert({
      log_level: "error",
      log_category: logCategory,
      actor_type: data.user?.id ? "user" : "anonymous",
      actor_identifier: data.user?.email,
      user_id: data.user?.id,
      action,
      message: data.error.message,
      outcome: "failure",
      ip_address:
        req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || undefined,
      user_agent: data.user?.userAgent || req.headers.get("user-agent") || undefined,
      error_code: appError.code,
      error_message: data.error.message,
      error_stack: data.stackTrace,
      metadata: {
        error_info: data.error,
        resolved_error: {
          code: appError.code,
          severity: appError.severity,
          retryable: appError.retryable,
          correlationId: appError.correlationId,
          category: appError.category,
        },
        page: data.page,
        breadcrumbs: data.breadcrumbs,
        environment: data.environment,
      },
      tags: [logCategory, `severity:${appError.severity}`],
    });

    if (insertError) {
      return respondWithProblem(insertError, {
        instance: "/api/errors",
        detail: "Failed to save log",
        defaultCode: "DATABASE_ERROR",
        logContext: { ...baseLogContext, action: "error_collection_insert_failed" },
      });
    }

    // 6. 重要エラーの通知（Sentry/Slack）
    // Registry 由来の severity を使用する
    const severity = appError.severity;
    const shouldAlert = severity === "high" || severity === "critical";

    if (shouldAlert) {
      // const { notifyError } = await import("@core/utils/error-handler.server");
      const { waitUntil } = await import("@core/utils/cloudflare-ctx");

      waitUntil(
        notifyError(appError, {
          action: "client_error_report",
          // actorType: data.user?.id ? "user" : "anonymous",
          userId: data.user?.id,
          additionalData: {
            clientMessage: sanitizedMessage,
            clientUserMessage: sanitizedUserMessage,
            userAgent: data.user?.userAgent,
            page: data.page,
            environment: data.environment,
            stack: data.stackTrace,
            breadcrumbs: data.breadcrumbs,
          },
        })
      );
    }

    return new NextResponse(null, { status: 204, headers: successHeaders });
  } catch (error) {
    return respondWithProblem(error, {
      instance: "/api/errors",
      detail: "Internal Server Error",
      defaultCode: "INTERNAL_ERROR",
      logContext: { category: "system", actorType: "system", action: "error_collection_unhandled" },
    });
  }
}
