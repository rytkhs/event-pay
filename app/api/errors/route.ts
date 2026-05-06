import { NextRequest, NextResponse } from "next/server";

import type { User } from "@supabase/supabase-js";

import { AppError, isErrorCode } from "@core/errors";
import { respondWithCode } from "@core/errors/server";
import type { ErrorCategory, ErrorCode } from "@core/errors/types";
import {
  createErrorDedupeHash,
  releaseErrorDedupeHash,
  shouldLogError,
} from "@core/logging/deduplication";
import { POLICIES, buildKey, enforceRateLimit } from "@core/rate-limit";
import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { createRouteHandlerSupabaseClient } from "@core/supabase/factory";
import { handleServerError, notifyError } from "@core/utils/error-handler.server";
import { getClientIP } from "@core/utils/ip-detection";
import { errorReportSchema } from "@core/validation/error-report";

import type { Database, Json } from "@/types/database";

export const dynamic = "force-dynamic";

type LogCategory = Database["public"]["Enums"]["log_category_enum"];
type SystemLogInsert = Database["public"]["Tables"]["system_logs"]["Insert"];

const LOG_CATEGORY_VALUES: LogCategory[] = [
  "authentication",
  "authorization",
  "event_management",
  "attendance",
  "payment",
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

const API_INSTANCE = "/api/errors";
const MAX_ACTION_LENGTH = 120;
const MAX_CLIENT_MESSAGE_LENGTH = 200;

const SUCCESS_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Content-Type-Options": "nosniff",
} as const;

const BASE_LOG_CONTEXT = { category: "system" as const, actorType: "system" as const };

function toNoContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: SUCCESS_HEADERS });
}

function sanitizeText(message: string, maxLength: number): string {
  return message.replace(/[\r\n]+/g, " ").slice(0, maxLength);
}

function sanitizeClientMessage(message: string): string {
  return sanitizeText(message, MAX_CLIENT_MESSAGE_LENGTH);
}

function sanitizeAction(raw: unknown): string {
  if (typeof raw !== "string") {
    return "client_error";
  }
  const value = sanitizeText(raw, MAX_ACTION_LENGTH).trim();
  return value.length > 0 ? value : "client_error";
}

function isDedupeUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? error.code : undefined;
  const message = "message" in error ? error.message : undefined;
  return (
    code === "23505" && typeof message === "string" && message.toLowerCase().includes("dedupe_key")
  );
}

async function resolveAuthenticatedUser(): Promise<User | null> {
  try {
    const client = await createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();

    if (error) {
      handleServerError(error, {
        category: "authentication",
        actorType: "system",
        action: "error_collection_auth_lookup_failed",
      });
      return null;
    }

    return user;
  } catch (error) {
    handleServerError(error, {
      category: "authentication",
      actorType: "system",
      action: "error_collection_auth_lookup_unhandled",
    });
    return null;
  }
}

function queueErrorNotification(
  appError: AppError,
  userId: string | undefined,
  payload: unknown
): void {
  const severity = appError.severity;
  const shouldAlert = severity === "high" || severity === "critical";
  if (!shouldAlert) {
    return;
  }

  void import("@core/utils/cloudflare-ctx")
    .then(({ waitUntil }) =>
      waitUntil(
        notifyError(appError, {
          action: "client_error_report",
          userId,
          additionalData: payload as Record<string, unknown>,
        }).catch((error) => {
          handleServerError(error, {
            ...BASE_LOG_CONTEXT,
            action: "error_collection_notification_failed",
            additionalData: { error_code: appError.code },
          });
        })
      )
    )
    .catch((error) => {
      handleServerError(error, {
        ...BASE_LOG_CONTEXT,
        action: "error_collection_wait_until_failed",
        additionalData: { error_code: appError.code },
      });
    });
}

export async function POST(req: NextRequest) {
  const clientIp = getClientIP(req) ?? undefined;
  const requestUserAgent = req.headers.get("user-agent") || undefined;

  try {
    const rateLimitKey = buildKey({
      scope: POLICIES["error.report"].scope,
      ip: clientIp,
    });
    const rateLimitKeys = Array.isArray(rateLimitKey) ? rateLimitKey : [rateLimitKey];
    const rateLimitResult = await enforceRateLimit({
      keys: rateLimitKeys,
      policy: POLICIES["error.report"],
    });
    if (!rateLimitResult.allowed) {
      return respondWithCode("RATE_LIMITED", {
        instance: API_INSTANCE,
        detail: "Too many requests",
        logContext: { ...BASE_LOG_CONTEXT, action: "error_collection_rate_limited" },
        headers: {
          "Retry-After": String(rateLimitResult.retryAfter || 60),
          "X-RateLimit-Remaining": "0",
        },
      });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      return respondWithCode("INVALID_JSON", {
        instance: API_INSTANCE,
        detail: "Invalid JSON in request body",
        logContext: {
          ...BASE_LOG_CONTEXT,
          action: "error_collection_invalid_json",
          additionalData: {
            error_message: error instanceof Error ? error.message : String(error),
          },
        },
      });
    }

    const validation = errorReportSchema.safeParse(body);
    if (!validation.success) {
      return respondWithCode("VALIDATION_ERROR", {
        instance: API_INSTANCE,
        detail: "Invalid request body",
        logContext: { ...BASE_LOG_CONTEXT, action: "error_collection_invalid_request" },
      });
    }

    const { data } = validation;
    const rawContext = (data.error.context ?? {}) as Record<string, unknown>;
    const rawLogCategory =
      (typeof rawContext.logCategory === "string" && rawContext.logCategory) ||
      (typeof rawContext.category === "string" && rawContext.category) ||
      data.error.category;
    const action = sanitizeAction(rawContext.action);
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

    const authUser = await resolveAuthenticatedUser();
    const actorType: SystemLogInsert["actor_type"] = authUser ? "user" : "anonymous";
    const actorIdentifier = authUser?.email ?? undefined;
    const userId = authUser?.id;
    const userAgent = data.user?.userAgent || requestUserAgent;

    const dedupeHash = await createErrorDedupeHash(sanitizedMessage, data.stackTrace);
    const shouldLog = await shouldLogError(sanitizedMessage, data.stackTrace, { dedupeHash });
    if (!shouldLog) {
      return toNoContentResponse();
    }

    let shouldReleaseDedupeKey = true;
    try {
      const supabase = await createAuditedAdminClient(
        AdminReason.ERROR_COLLECTION,
        "Client Error Collection",
        {
          userId,
          ipAddress: clientIp,
          userAgent,
          requestPath: API_INSTANCE,
          requestMethod: req.method,
          operationType: "INSERT",
          accessedTables: ["system_logs"],
        }
      );

      const insertPayload: SystemLogInsert = {
        log_level: "error",
        log_category: logCategory,
        actor_type: actorType,
        actor_identifier: actorIdentifier,
        user_id: userId,
        action,
        message: sanitizedMessage,
        outcome: "failure",
        ip_address: clientIp,
        user_agent: userAgent,
        error_code: appError.code,
        error_message: sanitizedMessage,
        error_stack: data.stackTrace,
        dedupe_key: dedupeHash,
        metadata: {
          error_info: {
            ...data.error,
            message: sanitizedMessage,
            userMessage: sanitizedUserMessage ?? null,
          },
          resolved_error: {
            code: appError.code,
            severity: appError.severity,
            retryable: appError.retryable,
            correlationId: appError.correlationId,
            category: appError.category,
          },
          auth_user: authUser ? { id: authUser.id, email: authUser.email ?? null } : null,
          client_reported_user: data.user ?? null,
          page: data.page,
          breadcrumbs: data.breadcrumbs,
          environment: data.environment,
        } as Json,
        tags: [logCategory, `severity:${appError.severity}`],
      };

      const { error: insertError } = await supabase.from("system_logs").insert(insertPayload);
      if (insertError) {
        if (isDedupeUniqueViolation(insertError)) {
          shouldReleaseDedupeKey = false;
          return toNoContentResponse();
        }
        throw insertError;
      }
      shouldReleaseDedupeKey = false;
    } catch (error) {
      handleServerError(error, {
        ...BASE_LOG_CONTEXT,
        action: "error_collection_insert_failed",
        additionalData: {
          code: appError.code,
          log_category: logCategory,
          action_name: action,
        },
      });
    } finally {
      if (shouldReleaseDedupeKey) {
        await releaseErrorDedupeHash(dedupeHash).catch((error) => {
          handleServerError(error, {
            ...BASE_LOG_CONTEXT,
            action: "error_collection_dedupe_release_failed",
            additionalData: {
              dedupe_hash: dedupeHash,
              code: appError.code,
            },
          });
        });
      }
    }

    queueErrorNotification(appError, userId, {
      clientMessage: sanitizedMessage,
      clientUserMessage: sanitizedUserMessage,
      userAgent,
      page: data.page,
      environment: data.environment,
      stack: data.stackTrace,
      breadcrumbs: data.breadcrumbs,
    });

    return toNoContentResponse();
  } catch (error) {
    handleServerError(error, {
      ...BASE_LOG_CONTEXT,
      action: "error_collection_unhandled",
      additionalData: {
        path: API_INSTANCE,
      },
    });
    return toNoContentResponse();
  }
}
