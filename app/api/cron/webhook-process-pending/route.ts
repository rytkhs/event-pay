import { NextRequest } from "next/server";
import { validateCronSecret, logCronActivity } from "@/lib/cron-auth";
import { stripe as sharedStripe } from "@/lib/stripe/client";
import { SupabaseWebhookIdempotencyService, IdempotentWebhookProcessor } from "@/lib/services/webhook/webhook-idempotency";
import { StripeWebhookEventHandler } from "@/lib/services/webhook/webhook-event-handler";
import { SecurityAuditorImpl } from "@/lib/security/security-auditor.impl";
import { AnomalyDetectorImpl } from "@/lib/security/anomaly-detector";
import { SecurityReporterImpl } from "@/lib/security/security-reporter.impl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const start = Date.now();

  const auth = validateCronSecret(request);
  if (!auth.isValid) {
    return new Response("Unauthorized", { status: 401 });
  }

  const auditor = new SecurityAuditorImpl();
  const anomaly = new AnomalyDetectorImpl(auditor);
  const securityReporter = new SecurityReporterImpl(auditor, anomaly);
  const idempotencyService = new SupabaseWebhookIdempotencyService();
  const processor = new IdempotentWebhookProcessor(idempotencyService);
  const handler = new StripeWebhookEventHandler(securityReporter);

  // 未処理(pending/failed)のイベントを取得し、一定件数だけ処理
  const MAX_BATCH = Number.parseInt(process.env.WEBHOOK_PROCESS_MAX_BATCH || "50", 10);
  let pending: Array<{ stripe_event_id: string; event_type: string; status: string; stripe_event_created: number | null; created_at: string | null }> = [];
  try {
    pending = await idempotencyService.listPendingOrFailedEventsOrdered(MAX_BATCH);
  } catch (err) {
    logCronActivity("error", "Failed to fetch pending webhook events", { error: err instanceof Error ? err.message : String(err) });
    return new Response("OK", { status: 200 });
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // 重複検知の対象とする「確定系イベント」
  const DEDUP_BY_OBJECT_EVENT_TYPES = new Set<string>([
    "payment_intent.succeeded",
    "charge.succeeded",
    "charge.failed",
    "charge.refunded",
    "payment_intent.payment_failed",
    "payment_intent.canceled",
    "charge.dispute.created",
    "charge.dispute.closed",
  ]);

  for (const row of pending ?? []) {
    try {
      const evtId: string = row.stripe_event_id;
      const event = await sharedStripe.events.retrieve(evtId);

      // data.object.id を抽出（イベントにより存在しない場合あり）
      const objectId: string | undefined = ((): string | undefined => {
        const data: unknown = (event as unknown as { data?: unknown }).data;
        if (!data || typeof data !== 'object') return undefined;
        const obj: unknown = (data as { object?: unknown }).object;
        if (!obj || typeof obj !== 'object') return undefined;
        const idVal = (obj as { id?: unknown }).id;
        return typeof idVal === 'string' && idVal.length > 0 ? idVal : undefined;
      })();

      // 必要であれば欠損している object_id を補完（以前のenqueueで取れなかった場合）
      if (objectId) {
        try { await idempotencyService.attachObjectIdIfMissing(event.id, objectId); } catch { /* noop */ }
      }

      // 確定系イベントに限り、object_id + event.type (+ account) で重複処理済みか確認
      if (objectId && DEDUP_BY_OBJECT_EVENT_TYPES.has(event.type)) {
        const alreadyProcessed = await idempotencyService.hasProcessedByObject(
          event.type,
          objectId,
          { stripe_account_id: (event as unknown as { account?: string | null }).account ?? null }
        );
        if (alreadyProcessed) {
          await idempotencyService.markEventAsProcessed(
            event.id,
            event.type,
            ({ success: true, skipped: true, reason: "duplicate_by_object" } as unknown) as { success: boolean; skipped: boolean; reason: string },
            { stripe_account_id: (event as unknown as { account?: string | null }).account ?? null }
          );
          processed++;
          succeeded++;
          continue;
        }
      }
      const res = await processor.processWithIdempotency(
        event.id,
        event.type,
        () => handler.handleEvent(event),
        { metadata: { stripe_account_id: (event as unknown as { account?: string | null }).account ?? null } }
      );
      processed++;
      if ((res.result as { success?: boolean })?.success) succeeded++; else failed++;
    } catch (e) {
      failed++;
      try {
        await idempotencyService.markEventFailed(
          row.stripe_event_id,
          row.event_type,
          e instanceof Error ? e.message : "process_error",
          { stripe_account_id: null }
        );
      } catch { }
    }
  }

  logCronActivity("info", "webhook-process-pending finished", {
    processed,
    succeeded,
    failed,
    ms: Date.now() - start,
  });

  return new Response("OK", { status: 200 });
}
