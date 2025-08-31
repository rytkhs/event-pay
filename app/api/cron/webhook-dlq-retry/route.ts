import { NextRequest, NextResponse } from "next/server";
import { createProblemResponse } from "@core/api/problem-details";
import { stripe as sharedStripe } from "@core/stripe/client";
import { StripeWebhookEventHandler } from "@features/payments/services/webhook/webhook-event-handler";
import {
  SupabaseWebhookIdempotencyService,
  IdempotentWebhookProcessor,
} from "@features/payments/services/webhook/webhook-idempotency";
import { logger } from "@core/logging/app-logger";
import type { WebhookProcessingResult } from "@features/payments/services/webhook";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { validateCronSecret } from "@core/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Cron は GET 呼び出し推奨

const MAX_RETRIES = 5;
const BASE_INTERVAL_SEC = 60; // 1 分

function createServices() {
  const eventHandler = new StripeWebhookEventHandler();
  const idempotencyService = new SupabaseWebhookIdempotencyService<WebhookProcessingResult>();
  const idempotentProcessor = new IdempotentWebhookProcessor<WebhookProcessingResult>(
    idempotencyService
  );
  return { eventHandler, idempotentProcessor, idempotencyService };
}

export async function GET(request: NextRequest) {
  const auth = validateCronSecret(request);
  if (!auth.isValid) {
    return createProblemResponse("UNAUTHORIZED", {
      instance: "/api/cron/webhook-dlq-retry",
      detail: auth.error || "Unauthorized",
    });
  }

  const { eventHandler, idempotentProcessor, idempotencyService } = createServices();

  try {
    const now = Date.now();

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 失敗イベント取得
    const { data: failedEvents, error } = await supabase
      .from("webhook_events")
      .select("*")
      .eq("status", "failed")
      .lt("retry_count", MAX_RETRIES);

    if (error) throw new Error(`Failed to fetch failed events: ${error.message}`);

    let processed = 0;
    let success = 0;

    for (const evt of failedEvents ?? []) {
      const retryCount: number = evt.retry_count ?? 0;
      const lastRetryAtStr: string | null = evt.last_retry_at ?? null;
      const lastRetryMs = lastRetryAtStr ? Date.parse(lastRetryAtStr) : 0;
      const delaySec = Math.pow(2, retryCount) * BASE_INTERVAL_SEC;
      if (now - lastRetryMs < delaySec * 1000) continue; // まだ待機

      processed++;
      const eventId: string = evt.stripe_event_id;
      let stripeEvent;
      try {
        stripeEvent = await sharedStripe.events.retrieve(eventId);
      } catch (_err) {
        // Event not found → terminal failure
        await idempotencyService.markEventFailed(eventId, evt.event_type, "event_not_found", {
          stripe_account_id: evt.stripe_account_id ?? null,
        });
        continue;
      }

      const result = await idempotentProcessor.processWithIdempotency(
        stripeEvent.id,
        stripeEvent.type,
        () => eventHandler.handleEvent(stripeEvent),
        { metadata: { stripe_account_id: stripeEvent.account ?? null } }
      );

      if (result.result.success) {
        success++;
      } else {
        const errorMessage =
          typeof result.result === "object" && result.result !== null && "error" in result.result
            ? (result.result.error as string)
            : "retry_failed";
        await idempotencyService.markEventFailed(stripeEvent.id, stripeEvent.type, errorMessage, {
          stripe_account_id: stripeEvent.account ?? null,
        });
      }
    }

    logger.info("Webhook DLQ retry completed", { processed, success });

    return NextResponse.json({ processed, success });
  } catch (e) {
    logger.error("Webhook DLQ retry failed", { error: e instanceof Error ? e.message : "unknown" });
    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/cron/webhook-dlq-retry",
      detail: "DLQ retry worker failed",
    });
  }
}
