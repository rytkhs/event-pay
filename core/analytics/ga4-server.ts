/**
 * GA4 Server-Side Analytics Service
 *
 * サーバー側でのGA4イベント送信を管理するサービス
 * Measurt Protocol APIを使用してサーバーからGA4にイベントを送信
 */

import "server-only";

import { logger } from "@core/logging/app-logger";
import { handleServerError } from "@core/utils/error-handler";

import { getGA4Config } from "./config";
import type { GA4Event } from "./event-types";
import { GA4Error, GA4ErrorCode } from "./ga4-error";
import { GA4Validator } from "./ga4-validator";

/**
 * GA4サーバー側サービスクラス
 */
export class GA4ServerService {
  private readonly MEASUREMENT_PROTOCOL_URL = "https://www.google-analytics.com/mp/collect";
  private readonly MAX_RETRIES = 3;
  private readonly MAX_RETRY_DELAY = 10000;
  private readonly MAX_JITTER = 1000;
  private readonly MAX_EVENTS_PER_BATCH = 25;

  /**
   * 設定を動的に取得するgetter
   */
  private get config() {
    return getGA4Config();
  }

  private get logger() {
    return logger.withContext({
      category: "system",
      action: "ga4_server_side",
    });
  }

  /**
   * コンストラクタ
   *
   * 依存性注入をサポートし、テスト時にモックfetchを使用できます。
   *
   * @param fetcher - fetch関数（依存性注入用、テスト時にモック可能）
   *
   * @example
   * ```typescript
   * // デフォルトのfetchを使用
   * const service = new GA4ServerService();
   *
   * // テスト用にモックfetchを注入
   * const mockFetch = jest.fn();
   * const testService = new GA4ServerService(mockFetch);
   * ```
   */
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  /**
   * サーバー側からイベントを送信する（Measurement Protocol）
   *
   * Client IDとイベントパラメータの検証を自動的に実行します。
   * 5xxエラーの場合は自動的にリトライします（最大3回、指数バックオフ）。
   * Client IDまたはUser IDのいずれかが必須です。
   *
   * @param event - 送信するGA4イベント
   * @param clientId - GA4 Client ID（オプショナル、_ga Cookieから取得した値）
   * @param userId - ユーザーID（オプショナル、clientIdがない場合のフォールバック）
   * @param sessionId - セッションID（オプショナル、正の整数）
   * @param engagementTimeMsec - エンゲージメント時間（ミリ秒、オプショナル）
   *
   * @example
   * ```typescript
   * // Client IDを使用
   * await ga4Server.sendEvent(
   *   {
   *     name: 'purchase',
   *     params: {
   *       transaction_id: 'T12345',
   *       value: 99.99,
   *       currency: 'JPY',
   *     },
   *   },
   *   '1234567890.0987654321'
   * );
   *
   * // User IDとセッション情報を使用
   * await ga4Server.sendEvent(
   *   event,
   *   undefined,
   *   'user123',
   *   1234567890,
   *   5000
   * );
   * ```
   */
  async sendEvent(
    event: GA4Event,
    clientId?: string,
    userId?: string,
    sessionId?: number,
    engagementTimeMsec?: number
  ): Promise<void> {
    if (!this.config.enabled || !this.config.apiSecret) {
      this.logger.debug("[GA4] Server event skipped (disabled or no API secret)", {
        event_name: event.name,
        client_id: clientId,
        user_id: userId,
      });
      return;
    }

    // Client ID検証（GA4Validator使用）
    let validClientId: string | null = null;
    if (clientId) {
      // プレフィックス（GA1.1.など）を除去してサニタイズ
      const sanitizedClientId = GA4Validator.sanitizeClientId(clientId);
      const validation = GA4Validator.validateClientId(sanitizedClientId);
      if (validation.isValid) {
        validClientId = sanitizedClientId;
      } else if (this.config.debug) {
        this.logger.debug("[GA4] Invalid client ID", {
          client_id: clientId,
          errors: validation.errors,
        });
      }
    }

    // Client IDもUserIdもない場合は送信できない
    if (!validClientId && !userId) {
      this.logger.warn("[GA4] Neither valid client ID nor user ID provided", {
        client_id: clientId,
        user_id: userId,
        event_name: event.name,
      });
      return;
    }

    // パラメータ検証とサニタイズ（GA4Validator使用）
    const paramValidation = GA4Validator.validateAndSanitizeParams(
      event.params as Record<string, unknown>,
      this.config.debug
    );

    // sanitizedParamsが存在しない、または元のパラメータが空でないのにサニタイズ後が空の場合はエラー
    if (
      !paramValidation.sanitizedParams ||
      (Object.keys(event.params).length > 0 &&
        Object.keys(paramValidation.sanitizedParams).length === 0)
    ) {
      this.logger.warn("[GA4] Event parameters validation failed", {
        event_name: event.name,
        original_param_count: Object.keys(event.params).length,
        sanitized_param_count: paramValidation.sanitizedParams
          ? Object.keys(paramValidation.sanitizedParams).length
          : 0,
        errors: paramValidation.errors,
      });
      return;
    }

    const url = `${this.MEASUREMENT_PROTOCOL_URL}?measurement_id=${this.config.measurementId}&api_secret=${this.config.apiSecret}`;

    // 検証済みパラメータに共通パラメータを追加
    const eventParams: Record<string, unknown> = { ...paramValidation.sanitizedParams };
    if (sessionId !== undefined && sessionId > 0) {
      eventParams.session_id = sessionId;
    }
    if (engagementTimeMsec !== undefined && engagementTimeMsec >= 0) {
      eventParams.engagement_time_msec = engagementTimeMsec;
    }

    // ペイロードを構築（client_id優先、なければuser_id）
    const payload: {
      client_id?: string;
      user_id?: string;
      events: Array<{
        name: string;
        params: Record<string, unknown>;
      }>;
    } = {
      events: [
        {
          name: event.name,
          params: eventParams,
        },
      ],
    };

    if (validClientId) {
      payload.client_id = validClientId;
    } else if (userId) {
      payload.user_id = userId;
    }

    try {
      const response = await this.fetchWithRetry(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      if (!response.ok) {
        throw new GA4Error(
          `HTTP ${response.status}: ${response.statusText}`,
          GA4ErrorCode.API_ERROR,
          { status: response.status }
        );
      }

      this.logger.info("[GA4] Server event sent successfully", {
        event_name: event.name,
        client_id: validClientId,
        user_id: userId,
        session_id: sessionId,
        outcome: "success",
      });

      if (this.config.debug) {
        this.logger.debug("[GA4] Server event payload", {
          event_name: event.name,
          payload: JSON.stringify(payload),
        });
      }
    } catch (error) {
      handleServerError("GA4_TRACKING_FAILED", {
        category: "system",
        action: "ga4_send_event",
        actorType: "system",
        additionalData: {
          event_name: event.name,
          client_id: validClientId,
          user_id: userId,
          error: error instanceof GA4Error ? error.message : String(error),
          error_code: error instanceof GA4Error ? error.code : undefined,
        },
      });

      // エラーの詳細をデバッグログに出力
      if (this.config.debug) {
        this.logger.debug("[GA4] Server event error details", {
          error_stack: error instanceof Error ? error.stack : undefined,
          payload: JSON.stringify(payload),
        });
      }
    }
  }

  /**
   * 複数のイベントを一度に送信する（バッチ送信）
   *
   * イベントを25個ずつに自動分割し、並列処理で送信します。
   * 各イベントのパラメータは自動的に検証・サニタイズされます。
   * 一部のバッチが失敗しても、他のバッチの送信は継続されます。
   *
   * @param events - 送信するGA4イベントの配列
   * @param clientId - GA4 Client ID
   *
   * @example
   * ```typescript
   * const events = [
   *   { name: 'page_view', params: { page_title: 'Home' } },
   *   { name: 'scroll', params: { percent_scrolled: 90 } },
   *   // ... 最大数百イベント
   * ];
   *
   * // 自動的に25イベントずつに分割して並列送信
   * await ga4Server.sendEvents(events, clientId);
   * ```
   */
  async sendEvents(events: GA4Event[], clientId: string): Promise<void> {
    if (!this.config.enabled || !this.config.apiSecret) {
      this.logger.debug("[GA4] Server batch events skipped (disabled or no API secret)", {
        event_count: events.length,
        client_id: clientId,
      });
      return;
    }

    // Client ID検証（GA4Validator使用）
    // プレフィックス（GA1.1.など）を除去してサニタイズ
    const sanitizedClientId = GA4Validator.sanitizeClientId(clientId);
    const validation = GA4Validator.validateClientId(sanitizedClientId);
    if (!validation.isValid) {
      this.logger.warn("[GA4] Invalid client ID for batch events", {
        client_id: clientId,
        errors: validation.errors,
        event_count: events.length,
      });
      return;
    }

    // 各イベントのパラメータを検証し、無効なイベントをフィルタリング
    const validatedEvents = events
      .map((event) => {
        const paramValidation = GA4Validator.validateAndSanitizeParams(
          event.params as Record<string, unknown>,
          this.config.debug
        );

        // sanitizedParamsが存在し、かつ元のパラメータが空でないのにサニタイズ後が空でない場合のみ有効
        if (
          paramValidation.sanitizedParams &&
          !(
            Object.keys(event.params).length > 0 &&
            Object.keys(paramValidation.sanitizedParams).length === 0
          )
        ) {
          return {
            name: event.name,
            params: paramValidation.sanitizedParams,
          };
        }

        // 無効なイベントをログに記録
        if (this.config.debug) {
          this.logger.debug("[GA4] Skipping invalid event in batch", {
            event_name: event.name,
            original_param_count: Object.keys(event.params).length,
            sanitized_param_count: paramValidation.sanitizedParams
              ? Object.keys(paramValidation.sanitizedParams).length
              : 0,
            errors: paramValidation.errors,
          });
        }

        return null;
      })
      .filter(
        (
          e
        ): e is {
          name: GA4Event["name"];
          params: Record<string, unknown>;
        } => e !== null
      );

    // 有効なイベントがない場合は送信しない
    if (validatedEvents.length === 0) {
      this.logger.warn("[GA4] No valid events in batch after validation", {
        original_count: events.length,
        client_id: clientId,
      });
      return;
    }

    // イベントを25個ずつに分割
    const batches: Array<{ name: string; params: Record<string, unknown> }[]> = [];
    for (let i = 0; i < validatedEvents.length; i += this.MAX_EVENTS_PER_BATCH) {
      batches.push(validatedEvents.slice(i, i + this.MAX_EVENTS_PER_BATCH));
    }

    this.logger.info("[GA4] Starting batch processing", {
      total_events: validatedEvents.length,
      total_batches: batches.length,
      max_events_per_batch: this.MAX_EVENTS_PER_BATCH,
      client_id: clientId,
    });

    // 並列処理でバッチを送信（同時実行数を制限）
    const results = await this.runWithConcurrencyLimit(
      batches.map((batch, index) => () => this.sendBatch(batch, sanitizedClientId, index)),
      5 // 同時5バッチまで
    );

    // 結果集計
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    this.logger.info("[GA4] Batch processing completed", {
      total_batches: batches.length,
      succeeded_batches: succeeded,
      failed_batches: failed,
      total_events: validatedEvents.length,
      client_id: clientId,
      outcome: failed === 0 ? "success" : "failure",
    });

    // 失敗したバッチの詳細をログに記録
    if (failed > 0 && this.config.debug) {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          this.logger.debug("[GA4] Batch failed", {
            batch_index: index,
            error: result.reason,
          });
        }
      });
    }
  }

  /**
   * 単一バッチの送信（内部メソッド）
   *
   * リトライロジックを使用してバッチを送信します。
   * 送信に失敗した場合はエラーをスローし、Promise.allSettledで捕捉されます。
   *
   * @param batch - 送信するイベントの配列（検証済み）
   * @param clientId - GA4 Client ID
   * @param batchIndex - バッチのインデックス（ログ用）
   * @throws GA4Error 送信に失敗した場合
   */
  private async sendBatch(
    batch: Array<{ name: string; params: Record<string, unknown> }>,
    clientId: string,
    batchIndex: number
  ): Promise<void> {
    const url = `${this.MEASUREMENT_PROTOCOL_URL}?measurement_id=${this.config.measurementId}&api_secret=${this.config.apiSecret}`;

    const payload = {
      client_id: clientId,
      events: batch,
    };

    if (this.config.debug) {
      this.logger.debug("[GA4] Sending batch", {
        batch_index: batchIndex,
        batch_size: batch.length,
        event_names: batch.map((e) => e.name).join(", "),
      });
    }

    try {
      const response = await this.fetchWithRetry(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      if (!response.ok) {
        throw new GA4Error(
          `Batch ${batchIndex} failed: HTTP ${response.status}`,
          GA4ErrorCode.API_ERROR,
          { batch_index: batchIndex, status: response.status, batch_size: batch.length }
        );
      }

      this.logger.info("[GA4] Batch sent successfully", {
        batch_index: batchIndex,
        batch_size: batch.length,
        event_names: batch.map((e) => e.name).join(", "),
        outcome: "success",
      });

      if (this.config.debug) {
        this.logger.debug("[GA4] Batch payload", {
          batch_index: batchIndex,
          payload: JSON.stringify(payload),
        });
      }
    } catch (error) {
      handleServerError("GA4_TRACKING_FAILED", {
        category: "system",
        action: "ga4_send_batch",
        actorType: "system",
        additionalData: {
          batch_index: batchIndex,
          batch_size: batch.length,
          error: error instanceof GA4Error ? error.message : String(error),
          error_code: error instanceof GA4Error ? error.code : undefined,
        },
      });

      // エラーを再スローして、Promise.allSettledで捕捉できるようにする
      throw error;
    }
  }

  /**
   * リトライロジック付きfetch（内部メソッド）
   *
   * 指数バックオフとランダムジッターを使用して、一時的なエラーに対してリトライを実行します。
   * - 5xxエラー: リトライ対象
   * - 4xxエラー: リトライせず即座に返す
   * - バックオフ: 2^attempt × 1000ms（最大10秒）
   * - ジッター: 0〜1000msのランダム遅延
   *
   * @param url - リクエストURL
   * @param options - fetchオプション
   * @param maxRetries - 最大リトライ回数（デフォルト: 3）
   * @returns Response オブジェクト
   * @throws GA4Error リトライが全て失敗した場合
   *
   * @example
   * ```typescript
   * // 内部で自動的に使用されます
   * const response = await this.fetchWithRetry(url, options);
   * ```
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.fetcher(url, options);

        // 5xxエラーの場合はリトライ対象
        if (response.status >= 500 && response.status < 600) {
          throw new GA4Error(
            `HTTP ${response.status}: ${response.statusText}`,
            GA4ErrorCode.API_ERROR,
            { status: response.status, attempt: attempt + 1 }
          );
        }

        // 成功またはリトライ不要なエラー（4xx）の場合は即座に返す
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 最後の試行以外は待機してリトライ
        if (attempt < maxRetries - 1) {
          // 指数バックオフ: 2^attempt * 1000ms、最大MAX_RETRY_DELAYまで
          const baseDelay = Math.min(1000 * Math.pow(2, attempt), this.MAX_RETRY_DELAY);
          // ランダムジッター: 0〜MAX_JITTERミリ秒
          const jitter = Math.random() * this.MAX_JITTER;
          const delay = baseDelay + jitter;

          if (this.config.debug) {
            this.logger.debug("[GA4] Retrying after error", {
              attempt: attempt + 1,
              max_retries: maxRetries,
              delay_ms: Math.round(delay),
              error: lastError.message,
            });
          }

          // 待機
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // 全てのリトライが失敗
    throw new GA4Error("Retry exhausted", GA4ErrorCode.RETRY_EXHAUSTED, {
      lastError: lastError?.message,
      attempts: maxRetries,
    });
  }

  /**
   * 並列実行数を制限してタスクを実行する
   *
   * @param tasks - 実行するタスク（Promiseを返す関数）の配列
   * @param concurrency - 最大同時実行数
   * @returns PromiseSettledResultの配列
   */
  private async runWithConcurrencyLimit<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number
  ): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = new Array(tasks.length);
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < tasks.length) {
        const index = currentIndex++;
        try {
          const value = await tasks[index]();
          results[index] = { status: "fulfilled", value };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    };

    const workers = Array(Math.min(concurrency, tasks.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);
    return results;
  }

  /**
   * GA4が有効かどうかを確認する
   *
   * 環境変数 `NEXT_PUBLIC_GA4_ENABLED` の値を動的に取得します。
   *
   * @returns boolean GA4が有効な場合はtrue
   *
   * @example
   * ```typescript
   * if (ga4Server.isEnabled()) {
   *   await ga4Server.sendEvent(event, clientId);
   * }
   * ```
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Measurement Protocol APIが利用可能かどうかを確認する
   *
   * GA4が有効で、かつAPI Secretが設定されている場合にtrueを返します。
   * 環境変数 `GA_API_SECRET` の値を動的に取得します。
   *
   * @returns boolean API Secretが設定されている場合はtrue
   *
   * @example
   * ```typescript
   * if (ga4Server.isMeasurementProtocolAvailable()) {
   *   // サーバー側イベント送信が可能
   * }
   * ```
   */
  isMeasurementProtocolAvailable(): boolean {
    return this.config.enabled && !!this.config.apiSecret;
  }

  /**
   * デバッグモードかどうかを確認する
   *
   * `NODE_ENV === "development"` の場合にtrueを返します。
   * デバッグモードが有効な場合、詳細なログが出力されます。
   *
   * @returns boolean デバッグモードの場合はtrue
   *
   * @example
   * ```typescript
   * if (ga4Server.isDebugMode()) {
   *   console.log('GA4 debug mode is enabled');
   * }
   * ```
   */
  isDebugMode(): boolean {
    return this.config.debug;
  }
}

// シングルトンインスタンス（デフォルトのfetchを使用）
export const ga4Server = new GA4ServerService();
