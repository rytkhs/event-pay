import { NextRequest, NextResponse } from "next/server";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { z } from "zod";

import { AdminReason, createSecureSupabaseClient } from "@core/security";
import type { ErrorDetails } from "@core/utils/error-details";
import { notifyError } from "@core/utils/error-handler.server";

// レート制限設定
const ratelimit =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(50, "1 m"), // 1分間に50リクエスト
        analytics: true,
      })
    : null;

// Validation schema for error report
const errorReportSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    category: z.string().optional(),
    severity: z.string().optional(),
    title: z.string().optional(),
    message: z.string(),
  }),
  stackTrace: z.string().optional(),
  user: z
    .object({
      id: z.string().optional(),
      email: z.string().optional(),
      userAgent: z.string().optional(),
    })
    .optional(),
  page: z
    .object({
      url: z.string().optional(),
      pathname: z.string().optional(),
      referrer: z.string().optional(),
    })
    .optional(),
  breadcrumbs: z.array(z.any()).optional(),
  environment: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. レート制限チェック
    if (ratelimit) {
      const forwarded = req.headers.get("x-forwarded-for");
      const ip =
        req.headers.get("cf-connecting-ip") || (forwarded ? forwarded.split(",")[0] : "unknown");

      const { success: rateLimitOk, remaining } = await ratelimit.limit(`error_log_${ip}`);

      if (!rateLimitOk) {
        // eslint-disable-next-line no-console
        console.warn("[ErrorAPI] Rate limit exceeded", { ip, remaining });
        return NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              "Retry-After": "60",
              "X-RateLimit-Remaining": String(remaining),
            },
          }
        );
      }
    }

    // 2. バリデーション
    const body = await req.json();
    const validation = errorReportSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { data } = validation;

    const factory = createSecureSupabaseClient();
    const supabase = await factory.createAuditedAdminClient(
      AdminReason.ERROR_COLLECTION,
      "Client Error Collection"
    );

    // 4. 重複チェック
    const { shouldLogError } = await import("@core/logging/deduplication");
    const shouldLog = await shouldLogError(data.error.message, data.stackTrace);

    if (!shouldLog) {
      return NextResponse.json({ success: true, deduplicated: true });
    }

    // 5. DB保存
    const { error: insertError } = await supabase.from("system_logs").insert({
      log_level: "error",
      log_category: data.error.category || "client_error",
      actor_type: data.user?.id ? "user" : "anonymous",
      actor_identifier: data.user?.email,
      user_id: data.user?.id,
      action: "client_error",
      message: data.error.message,
      outcome: "failure",
      ip_address:
        req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || undefined,
      user_agent: data.user?.userAgent || req.headers.get("user-agent") || undefined,
      error_code: data.error.code,
      error_message: data.error.message,
      error_stack: data.stackTrace,
      metadata: {
        error_info: data.error,
        page: data.page,
        breadcrumbs: data.breadcrumbs,
        environment: data.environment,
      },
      tags: [data.error.category || "client", `severity:${data.error.severity || "unknown"}`],
    });

    if (insertError) {
      // eslint-disable-next-line no-console
      console.error("[ErrorAPI] Failed to insert log:", insertError);
      return NextResponse.json(
        { error: "Failed to save log" },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    // 6. 重要エラーの通知（Sentry/Slack）
    // クライアント側で判断された severity を尊重する
    const severity = (data.error.severity || "medium") as ErrorDetails["severity"];
    const shouldAlert = severity === "high" || severity === "critical";

    if (shouldAlert) {
      // const { notifyError } = await import("@core/utils/error-handler.server");
      const { waitUntil } = await import("@core/utils/cloudflare-ctx");

      const errorDetails: ErrorDetails = {
        code: data.error.code || "CLIENT_ERROR",
        message: data.error.message,
        userMessage: "エラーが発生しました", // 通知用なのでデフォルトでOK
        severity,
        shouldLog: false, // 既にDB保存済み
        shouldAlert: true,
        retryable: false,
      };

      waitUntil(
        notifyError(errorDetails, {
          action: "client_error_report",
          // actorType: data.user?.id ? "user" : "anonymous",
          userId: data.user?.id,
          additionalData: {
            userAgent: data.user?.userAgent,
            page: data.page,
            environment: data.environment,
            stack: data.stackTrace,
            breadcrumbs: data.breadcrumbs,
          },
        })
      );
    }

    return NextResponse.json(
      { success: true },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[ErrorAPI] Unhandled error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
