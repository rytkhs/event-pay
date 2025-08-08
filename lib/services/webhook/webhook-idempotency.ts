import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import type { Json } from "@/types/database";

export interface WebhookIdempotencyService<T extends Json = Json> {
  isEventProcessed(eventId: string): Promise<boolean>;
  markEventAsProcessed(eventId: string, eventType: string, processingResult: T): Promise<void>;
  getProcessingResult(eventId: string): Promise<T | null>;
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

  // 予約ロック: 存在しない場合にロック行を作成（重複時はfalse）
  async acquireProcessingLock(eventId: string, eventType: string): Promise<boolean> {
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
        .upsert(
          {
            stripe_event_id: eventId,
            event_type: eventType,
            processing_result: lockPayload as T,
            processed_at: now.toISOString(),
            created_at: now.toISOString(),
          },
          { onConflict: "stripe_event_id" }
        );

      if (!overwriteError) return true;
      return false;
    }

    throw new Error(`Failed to acquire processing lock: ${insertError?.message}`);
  }

  // 処理結果の更新（ロック行を最終結果へ更新）
  async updateProcessingResult(eventId: string, eventType: string, processingResult: T): Promise<void> {
    const { error } = await this.supabase
      .from("webhook_events")
      .upsert(
        {
          stripe_event_id: eventId,
          event_type: eventType,
          processing_result: processingResult,
          processed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        { onConflict: "stripe_event_id" }
      );

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
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = No rows returned
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
    processingResult: T
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
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = No rows returned
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
    options?: { shouldMark?: (result: T) => boolean }
  ): Promise<{ result: T; wasAlreadyProcessed: boolean }> {
    // 新しいロック方式が実装されている場合は利用。なければ従来方式にフォールバック
    const svc = this.idempotencyService as unknown as {
      acquireProcessingLock?: (eventId: string, eventType: string) => Promise<boolean>;
      updateProcessingResult?: (eventId: string, eventType: string, processingResult: T) => Promise<void>;
      releaseProcessingLock?: (eventId: string) => Promise<void>;
    };
    if (typeof svc.acquireProcessingLock === "function") {
      const acquired: boolean = await svc.acquireProcessingLock(eventId, eventType);
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
            await svc.updateProcessingResult(eventId, eventType, result);
          } else {
            await this.idempotencyService.markEventAsProcessed(eventId, eventType, result);
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

// Redis を使用した高速な冪等性チェック（オプション）
interface RedisLike {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
}

export class RedisWebhookIdempotencyService<T extends Json = Json>
  implements WebhookIdempotencyService<T> {
  private readonly redis: RedisLike; // Redis クライアント
  private readonly ttl: number = 86400; // 24時間

  constructor(redisClient: RedisLike) {
    this.redis = redisClient;
  }

  async isEventProcessed(eventId: string): Promise<boolean> {
    try {
      const result = await this.redis.get(`webhook:processed:${eventId}`);
      return result !== null;
    } catch (error) {
      throw new Error(
        `Redis error checking event processing: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async markEventAsProcessed(
    eventId: string,
    eventType: string,
    processingResult: T
  ): Promise<void> {
    try {
      const data = {
        eventType,
        processingResult,
        processedAt: new Date().toISOString(),
      };

      await this.redis.setex(`webhook:processed:${eventId}`, this.ttl, JSON.stringify(data));
    } catch (error) {
      throw new Error(
        `Redis error marking event as processed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async getProcessingResult(eventId: string): Promise<T | null> {
    try {
      const result = await this.redis.get(`webhook:processed:${eventId}`);
      if (!result) return null;

      const data = JSON.parse(result) as { processingResult: T };
      return data.processingResult;
    } catch (error) {
      throw new Error(
        `Redis error getting processing result: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}
