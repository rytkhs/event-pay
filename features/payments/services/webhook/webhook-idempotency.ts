import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import type { Json } from "@/types/database";

export interface WebhookIdempotencyService<T extends Json = Json> {
  isEventProcessed(eventId: string): Promise<boolean>;
  markEventAsProcessed(
    eventId: string,
    eventType: string,
    processingResult: T,
    metadata?: { stripe_account_id?: string | null }
  ): Promise<void>;
  getProcessingResult(eventId: string): Promise<T | null>;
  markEventFailed(
    eventId: string,
    eventType: string,
    errorMessage: string,
    metadata?: { stripe_account_id?: string | null },
    maxRetries?: number
  ): Promise<void>;
  /**
   * 受信済みイベントを非同期処理用にエンキューする（最小トランザクションで即時ACK用）
   */
  enqueueEventForProcessing(
    eventId: string,
    eventType: string,
    metadata?: { stripe_account_id?: string | null; stripe_event_created?: number; object_id?: string | null }
  ): Promise<void>;
  listPendingOrFailedEventsOrdered(
    maxBatch: number
  ): Promise<Array<{
    stripe_event_id: string;
    event_type: string;
    status: string;
    stripe_event_created: number | null;
    created_at: string | null;
    stripe_account_id: string | null;
  }>>;
  /**
   * 既に同一の (event_type, object_id, stripe_account_id) が processed 済みかを確認（限定的に使用）
   */
  hasProcessedByObject(
    eventType: string,
    objectId: string,
    metadata?: { stripe_account_id?: string | null }
  ): Promise<boolean>;
  /**
   * 既存の webhook_events 行に対して、object_id が未設定であれば補完する。
   * すでに値が入っている場合は上書きしない（安全側）。
   */
  attachObjectIdIfMissing(
    eventId: string,
    objectId: string
  ): Promise<void>;
}

export class SupabaseWebhookIdempotencyService<T extends Json = Json>
  implements WebhookIdempotencyService<T> {
  private readonly supabase;

  constructor() {
    this.supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  /**
   * 受信イベントを pending として保存（存在する場合は変更しない）。
   * 極力軽量にし、Webhook応答をブロックしないことを目的とする。
   */
  async enqueueEventForProcessing(
    eventId: string,
    eventType: string,
    metadata?: { stripe_account_id?: string | null; stripe_event_created?: number; object_id?: string | null }
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    // 既存なら何もしない（UNIQUE違反を拾ってスキップ）
    const { error } = await this.supabase
      .from("webhook_events")
      .insert({
        stripe_event_id: eventId,
        event_type: eventType,
        processing_result: { enqueuedAt: nowIso } as unknown as T,
        processed_at: nowIso,
        created_at: nowIso,
        status: "pending",
        processing_error: null,
        retry_count: 0,
        stripe_account_id: metadata?.stripe_account_id ?? null,
        stripe_event_created: typeof metadata?.stripe_event_created === "number"
          ? Math.trunc(metadata!.stripe_event_created)
          : null,
        object_id: metadata?.object_id ?? null,
      } as never);

    // 一意制約違反(23505)は無視。他のエラーは投げる。
    if (error && (error as unknown as { code?: string }).code !== "23505") {
      throw new Error(`Failed to enqueue webhook event: ${error.message}`);
    }
  }

  async hasProcessedByObject(
    eventType: string,
    objectId: string,
    metadata?: { stripe_account_id?: string | null }
  ): Promise<boolean> {
    try {
      if (!objectId) return false;
      const query = this.supabase
        .from("webhook_events")
        .select("id")
        .eq("event_type", eventType)
        .eq("status", "processed")
        .eq("object_id", objectId)
        .limit(1);

      const { data, error } = metadata?.stripe_account_id
        ? await query.eq("stripe_account_id", metadata.stripe_account_id).maybeSingle()
        : await query.maybeSingle();

      if (error && (error as unknown as { code?: string }).code !== "PGRST116") {
        // PGRST116 = Results contain 0 rows - treat as not found without error
        throw new Error(error.message);
      }
      return !!data;
    } catch (_error) {
      // エラー時は保守的に false を返す（重複スキップを諦めて通常処理）
      return false;
    }
  }

  async attachObjectIdIfMissing(eventId: string, objectId: string): Promise<void> {
    try {
      if (!objectId) return;
      const { error } = await this.supabase
        .from("webhook_events")
        .update({ object_id: objectId })
        .eq("stripe_event_id", eventId)
        .is("object_id", null);
      if (error) {
        throw new Error(error.message);
      }
    } catch (_e) {
      // 失敗しても致命的ではないため握りつぶす（次回以降の処理で再補完されうる）
      return;
    }
  }

  async listPendingOrFailedEventsOrdered(
    maxBatch: number
  ): Promise<Array<{
    stripe_event_id: string;
    event_type: string;
    status: string;
    stripe_event_created: number | null;
    created_at: string | null;
    stripe_account_id: string | null;
  }>> {
    const { data, error } = await this.supabase
      .from("webhook_events")
      .select("stripe_event_id, event_type, status, stripe_event_created, created_at, stripe_account_id")
      .in("status", ["pending", "failed"])
      .order("stripe_event_created", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(maxBatch);

    if (error) {
      throw new Error(`Failed to fetch pending webhook events: ${error.message}`);
    }
    return ((data ?? []) as unknown) as Array<{
      stripe_event_id: string;
      event_type: string;
      status: string;
      stripe_event_created: number | null;
      created_at: string | null;
      stripe_account_id: string | null;
    }>;
  }

  // 予約ロック: 存在しない場合にロック行を作成（重複時はfalse）
  async acquireProcessingLock(
    eventId: string,
    eventType: string,
    metadata?: { stripe_account_id?: string | null }
  ): Promise<boolean> {
    const now = new Date();
    const lockPayload: Record<string, unknown> = {
      locked: true,
      lockedAt: now.toISOString(),
    };

    // 1) 新規ロック作成を試行
    const insertRes = await this.supabase.from("webhook_events").insert({
      stripe_event_id: eventId,
      event_type: eventType,
      processing_result: lockPayload as T,
      processed_at: now.toISOString(),
      created_at: now.toISOString(),
      stripe_account_id: metadata?.stripe_account_id ?? null,
    });

    const insertError = insertRes.error as unknown as { code?: string; message: string } | null;
    if (!insertError) return true;

    // 2) 既存ロックがある場合はstaleか確認し、TTL超過なら上書き（stale lock回復）
    if (insertError?.code === "23505") {
      const ttlSec = Number.parseInt(process.env.WEBHOOK_LOCK_TTL_SECONDS || "300", 10); // デフォルト5分
      const { data, error: fetchError } = await this.supabase
        .from("webhook_events")
        .select("processing_result")
        .eq("stripe_event_id", eventId)
        .single();

      if (fetchError) return false; // 存在するが読み取り失敗→他ワーカーが進行中とみなす

      type LockPayload = { locked?: boolean; lockedAt?: string };
      const prev = (data as unknown as { processing_result?: LockPayload | null })
        ?.processing_result as LockPayload | null;
      const lockedAtStr: string | undefined = prev?.lockedAt;
      const lockedAtMs = lockedAtStr ? Date.parse(lockedAtStr) : NaN;
      const isStale = Number.isFinite(lockedAtMs) && now.getTime() - lockedAtMs > ttlSec * 1000;

      if (!isStale) return false;

      // stale と判断できる場合は上書きでロックを再取得
      const { error: overwriteError } = await this.supabase
        .from("webhook_events")
        .upsert({
          stripe_event_id: eventId,
          event_type: eventType,
          processing_result: lockPayload as T,
          processed_at: now.toISOString(),
          created_at: now.toISOString(),
          stripe_account_id: metadata?.stripe_account_id ?? null,
        }, { onConflict: "stripe_event_id" });

      if (!overwriteError) return true;
      return false;
    }

    throw new Error(`Failed to acquire processing lock: ${insertError?.message}`);
  }

  // 処理結果の更新（ロック行を最終結果へ更新）
  async updateProcessingResult(
    eventId: string,
    eventType: string,
    processingResult: T,
    metadata?: { stripe_account_id?: string | null }
  ): Promise<void> {
    const { error } = await this.supabase
      .from("webhook_events")
      .upsert({
        stripe_event_id: eventId,
        event_type: eventType,
        processing_result: processingResult,
        processed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        status: "processed",
        processing_error: null,
        last_retry_at: null,
        stripe_account_id: metadata?.stripe_account_id ?? null,
      }, { onConflict: "stripe_event_id" });

    if (error) {
      throw new Error(`Failed to update processing result: ${error.message}`);
    }
  }

  // エラー時のロック解放（挿入済み行を削除）
  async releaseProcessingLock(eventId: string): Promise<void> {
    const { error } = await this.supabase
      .from("webhook_events")
      .delete()
      .eq("stripe_event_id", eventId);

    if (error) {
      // ロック解放失敗は致命的ではないが、次回は acquire で 23505 となる可能性がある
      // ここではエラーを投げて上位で捕捉させる
      throw new Error(`Failed to release processing lock: ${error.message}`);
    }
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from("webhook_events")
        .select("processing_result")
        .eq("stripe_event_id", eventId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to check event processing status: ${error.message}`);
      }

      if (!data) return false;
      // success === true または terminal === true の時のみ処理済みと判定（ロック行や一時失敗は未処理扱い）
      try {
        const result = (data as unknown as { processing_result?: T | null }).processing_result ?? null;
        const bag = (result as unknown as { success?: boolean; terminal?: boolean } | null) ?? null;
        const isProcessed = bag?.success === true || bag?.terminal === true;
        return !!isProcessed;
      } catch {
        return false;
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Error checking event processing status: Unknown error");
    }
  }

  async markEventAsProcessed(
    eventId: string,
    eventType: string,
    processingResult: T,
    metadata?: { stripe_account_id?: string | null }
  ): Promise<void> {
    try {
      // upsertで確実に最終結果を記録
      const { error: upsertError } = await this.supabase
        .from("webhook_events")
        .upsert(
          {
            stripe_event_id: eventId,
            event_type: eventType,
            processing_result: processingResult,
            processed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            status: "processed",
            processing_error: null,
            last_retry_at: null,
            stripe_account_id: metadata?.stripe_account_id ?? null,
          },
          { onConflict: "stripe_event_id" }
        );

      if (upsertError) {
        throw new Error(upsertError.message);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to mark event as processed: ${error.message}`);
      }
      throw new Error("Error marking event as processed: Unknown error");
    }
  }

  async getProcessingResult(eventId: string): Promise<T | null> {
    try {
      const { data, error } = await this.supabase
        .from("webhook_events")
        .select("processing_result")
        .eq("stripe_event_id", eventId)
        .maybeSingle();
      if (error) {
        throw new Error(`Failed to get processing result: ${error.message}`);
      }

      return (data?.processing_result as T | undefined) ?? null;
    } catch (error) {
      // 内側のエラー文言を維持する
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Error getting processing result: Unknown error");
    }
  }

  // 失敗イベントの記録（DLQ用途）。processed扱いにはしない。
  async markEventFailed(
    eventId: string,
    eventType: string,
    errorMessage: string,
    metadata?: { stripe_account_id?: string | null }
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    // 既存の retry_count を取得
    let retryCount = 0;
    try {
      const { data } = await this.supabase
        .from("webhook_events")
        .select("retry_count")
        .eq("stripe_event_id", eventId)
        .maybeSingle();
      retryCount = (data as unknown as { retry_count?: number } | null)?.retry_count ?? 0;
    } catch {
      /* noop */
    }

    const effectiveMax = 5;
    const nextRetry = retryCount + 1;
    const isDead = nextRetry >= effectiveMax;
    const statusVal = isDead ? "dead" : "failed";

    const processingResult = ({
      success: false,
      error: errorMessage,
      failedAt: nowIso,
      terminal: isDead,
    } as unknown) as T;

    const { error } = await this.supabase
      .from("webhook_events")
      .upsert(
        {
          stripe_event_id: eventId,
          event_type: eventType,
          processing_result: processingResult,
          processed_at: nowIso,
          created_at: nowIso,
          status: statusVal,
          processing_error: errorMessage,
          retry_count: nextRetry,
          last_retry_at: nowIso,
          stripe_account_id: metadata?.stripe_account_id ?? null,
        },
        { onConflict: "stripe_event_id" }
      );
    if (error) {
      throw new Error(`Failed to mark event failed: ${error.message}`);
    }
  }
}

// Webhook処理の冪等性を保証するラッパー
export class IdempotentWebhookProcessor<T extends Json = Json> {
  private readonly idempotencyService: WebhookIdempotencyService<T>;

  constructor(idempotencyService: WebhookIdempotencyService<T>) {
    this.idempotencyService = idempotencyService;
  }

  async processWithIdempotency(
    eventId: string,
    eventType: string,
    processor: () => Promise<T>,
    options?: { shouldMark?: (result: T) => boolean; metadata?: { stripe_account_id?: string | null } }
  ): Promise<{ result: T; wasAlreadyProcessed: boolean }> {
    // 新しいロック方式が実装されている場合は利用。なければ従来方式にフォールバック
    const svc = this.idempotencyService as unknown as {
      acquireProcessingLock?: (eventId: string, eventType: string, metadata?: { stripe_account_id?: string | null }) => Promise<boolean>;
      updateProcessingResult?: (
        eventId: string,
        eventType: string,
        processingResult: T,
        metadata?: { stripe_account_id?: string | null }
      ) => Promise<void>;
      releaseProcessingLock?: (eventId: string) => Promise<void>;
    };
    if (typeof svc.acquireProcessingLock === "function") {
      const acquired: boolean = await svc.acquireProcessingLock(eventId, eventType, options?.metadata);
      if (!acquired) {
        const previousResult = await this.idempotencyService.getProcessingResult(eventId);
        const normalizedResult = previousResult ?? (({ success: false } as unknown) as T);
        return { result: normalizedResult, wasAlreadyProcessed: true };
      }

      try {
        const result = await processor();
        const shouldMark = options?.shouldMark ?? (() => true);
        if (shouldMark(result)) {
          if (typeof svc.updateProcessingResult === "function") {
            await svc.updateProcessingResult(eventId, eventType, result, options?.metadata);
          } else {
            await this.idempotencyService.markEventAsProcessed(eventId, eventType, result, options?.metadata);
          }
        } else {
          // 失敗等で確定保存しない場合はロックを解放してStripeの再試行を許容
          if (typeof svc.releaseProcessingLock === "function") {
            await svc.releaseProcessingLock(eventId);
          }
        }
        return { result, wasAlreadyProcessed: false };
      } catch (error) {
        // ロック解放を試みる
        try {
          if (typeof svc.releaseProcessingLock === "function") {
            await svc.releaseProcessingLock(eventId);
          }
        } catch (_e) { }
        throw error;
      }
    }

    // フォールバック（従来方式）
    const isProcessed = await this.idempotencyService.isEventProcessed(eventId);
    if (isProcessed) {
      const previousResult = await this.idempotencyService.getProcessingResult(eventId);
      const normalizedResult = previousResult ?? (({ success: false } as unknown) as T);
      return { result: normalizedResult, wasAlreadyProcessed: true };
    }

    const result = await processor();
    const shouldMark = options?.shouldMark ?? (() => true);
    if (shouldMark(result)) {
      await this.idempotencyService.markEventAsProcessed(eventId, eventType, result);
    }
    return { result, wasAlreadyProcessed: false };
  }
}
