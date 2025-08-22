import { NextRequest } from "next/server";
import { validateCronSecret, logCronActivity } from "@/lib/cron-auth";
import { stripe as sharedStripe } from "@/lib/stripe/client";
import { SupabaseWebhookIdempotencyService, IdempotentWebhookProcessor } from "@/lib/services/webhook/webhook-idempotency";
import { StripeWebhookEventHandler } from "@/lib/services/webhook/webhook-event-handler";
import { SecurityAuditorImpl } from "@/lib/security/security-auditor.impl";
import { AnomalyDetectorImpl } from "@/lib/security/anomaly-detector";
import { SecurityReporterImpl } from "@/lib/security/security-reporter.impl";
import { ConnectWebhookHandler } from "@/lib/services/webhook/connect-webhook-handler";
import Stripe from "stripe";

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
  const connectHandler = await ConnectWebhookHandler.create();

  // 未処理(pending/failed)のイベントを取得し、一定件数だけ処理
  const MAX_BATCH = Number.parseInt(process.env.WEBHOOK_PROCESS_MAX_BATCH || "50", 10);
  let pending: Array<{ stripe_event_id: string; event_type: string; status: string; stripe_event_created: number | null; created_at: string | null; stripe_account_id: string | null }> = [];
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
    "charge.dispute.funds_reinstated",
  ]);

  for (const row of pending ?? []) {
    try {
      const evtId: string = row.stripe_event_id;
      const event = await sharedStripe.events.retrieve(
        evtId,
        row.stripe_account_id ? { stripeAccount: row.stripe_account_id } : undefined
      );

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

      // Connectイベントの判定（connected accountから届いたイベントを優先判定）
      const isConnectEvent = !!row.stripe_account_id && (
        event.type.startsWith("account.") ||
        event.type.startsWith("payout.") ||
        event.type.startsWith("person.") ||
        event.type.startsWith("capability.")
      );

      if (isConnectEvent) {
        const res = await processor.processWithIdempotency(
          event.id,
          event.type,
          async () => {
            const evt: Stripe.Event = event as Stripe.Event;
            switch (evt.type) {
              case "account.updated":
                await connectHandler.handleAccountUpdated(evt.data.object as Stripe.Account);
                break;
              case "account.application.deauthorized": {
                // data.object は application、connected account id は event.account
                const app = evt.data.object as Stripe.Application;
                const acct = (evt as unknown as { account?: string | null }).account ?? null;
                await connectHandler.handleAccountApplicationDeauthorized(app, acct);
                break;
              }
              case "payout.paid":
                await connectHandler.handlePayoutPaid(evt.data.object as Stripe.Payout);
                break;
              case "payout.failed":
                await connectHandler.handlePayoutFailed(evt.data.object as Stripe.Payout);
                break;
              // account.application.deauthorized は次タスクでDB更新実装予定
              default:
                // 未対応のConnectイベントはACKのみ
                break;
            }
            return ({ success: true, eventId: evt.id, eventType: evt.type } as unknown) as { success: boolean };
          },
          { metadata: { stripe_account_id: row.stripe_account_id } }
        );
        processed++;
        if ((res.result as { success?: boolean })?.success) succeeded++; else failed++;
        continue;
      }

      // 通常（プラットフォーム）イベント: 確定系の重複判定→標準ハンドラへ委譲
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
      {
        const res = await processor.processWithIdempotency(
          event.id,
          event.type,
          () => handler.handleEvent(event),
          { metadata: { stripe_account_id: (event as unknown as { account?: string | null }).account ?? null } }
        );
        processed++;
        if ((res.result as { success?: boolean })?.success) succeeded++; else failed++;
      }
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
