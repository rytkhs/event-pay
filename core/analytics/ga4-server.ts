/**
 * GA4 Server-Side Analytics Service
 *
 * サーバー側でのGA4イベント送信を管理するサービス
 * Measurt Protocol APIを使用してサーバーからGA4にイベントを送信
 */

import "server-only";

import { logger } from "@core/logging/app-logger";

import { getGA4Config } from "./config";
import type { GA4Event } from "./event-types";
import { GA4Error, GA4ErrorCode } from "./ga4-error";

/**
 * GA4サーバー側サービスクラス
 */
export class GA4ServerService {
  private readonly MEASUREMENT_PROTOCOL_URL = "https://www.google-analytics.com/mp/collect";
  private readonly MAX_RETRIES = 3;
  private readonly MAX_RETRY_DELAY = 10000;
  private readonly MAX_JITTER = 1000;

  /**
   * 設定を動的に取得するgetter
   */
  private get config() {
    return getGA4Config();
  }

  /**
   * コンストラクタ
   *
   * @param fetcher - fetch関数（依存性注入用、テスト時にモック可能）
   */
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  /**
   * サーバー側からイベントを送信する（Measurement Protocol）
   *
   * @param event - 送信するGA4イベント
   * @param clientId - GA4 Client ID（オプショナル、_ga Cookieから取得した値）
   * @param userId - ユーザーID（オプショナル、clientIdがない場合のフォールバック）
   * @param sessionId - セッションID（オプショナル、正の整数）
   * @param engagementTimeMsec - エンゲージメント時間（ミリ秒、オプショナル）
   */
  async sendEvent(
    event: GA4Event,
    clientId?: string,
    userId?: string,
    sessionId?: number,
    engagementTimeMsec?: number
  ): Promise<void> {
    if (!this.config.enabled || !this.config.apiSecret) {
      logger.debug("[GA4] Server event skipped (disabled or no API secret)", {
        tag: "ga4-server",
        event_name: event.name,
        client_id: clientId,
        user_id: userId,
      });
      return;
    }

    // Client IDの検証（ある場合のみ）
    const validClientId = clientId && this.isValidClientId(clientId) ? clientId : null;

    // Client IDもUserIdもない場合は送信できない
    if (!validClientId && !userId) {
      logger.warn("[GA4] Neither client ID nor user ID provided", {
        tag: "ga4-server",
        client_id: clientId,
        user_id: userId,
        event_name: event.name,
      });
      return;
    }

    const url = `${this.MEASUREMENT_PROTOCOL_URL}?measurement_id=${this.config.measurementId}&api_secret=${this.config.apiSecret}`;

    // イベントパラメータに共通パラメータを追加
    const eventParams: Record<string, unknown> = { ...event.params };
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
      });

      if (!response.ok) {
        throw new GA4Error(
          `HTTP ${response.status}: ${response.statusText}`,
          GA4ErrorCode.API_ERROR,
          { status: response.status }
        );
      }

      logger.info("[GA4] Server event sent successfully", {
        tag: "ga4-server",
        event_name: event.name,
        client_id: validClientId,
        user_id: userId,
        session_id: sessionId,
      });

      if (this.config.debug) {
        logger.debug("[GA4] Server event payload", {
          tag: "ga4-server",
          event_name: event.name,
          payload: JSON.stringify(payload),
        });
      }
    } catch (error) {
      logger.error("[GA4] Failed to send server event", {
        tag: "ga4-server",
        event_name: event.name,
        client_id: validClientId,
        user_id: userId,
        error: error instanceof GA4Error ? error.message : String(error),
        error_code: error instanceof GA4Error ? error.code : undefined,
        error_context: error instanceof GA4Error ? error.context : undefined,
      });

      // エラーの詳細をデバッグログに出力
      if (this.config.debug) {
        logger.debug("[GA4] Server event error details", {
          tag: "ga4-server",
          error_stack: error instanceof Error ? error.stack : undefined,
          payload: JSON.stringify(payload),
        });
      }
    }
  }

  /**
   * 複数のイベントを一度に送信する（バッチ送信）
   *
   * @param events - 送信するGA4イベントの配列
   * @param clientId - GA4 Client ID
   */
  async sendEvents(events: GA4Event[], clientId: string): Promise<void> {
    if (!this.config.enabled || !this.config.apiSecret) {
      logger.debug("[GA4] Server batch events skipped (disabled or no API secret)", {
        tag: "ga4-server",
        event_count: events.length,
        client_id: clientId,
      });
      return;
    }

    if (!clientId || !this.isValidClientId(clientId)) {
      logger.warn("[GA4] Invalid client ID format for batch events", {
        tag: "ga4-server",
        client_id: clientId,
        event_count: events.length,
      });
      return;
    }

    const url = `${this.MEASUREMENT_PROTOCOL_URL}?measurement_id=${this.config.measurementId}&api_secret=${this.config.apiSecret}`;

    const payload = {
      client_id: clientId,
      events: events.map((event) => ({
        name: event.name,
        params: event.params,
      })),
    };

    try {
      const response = await this.fetchWithRetry(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new GA4Error(
          `HTTP ${response.status}: ${response.statusText}`,
          GA4ErrorCode.API_ERROR,
          { status: response.status }
        );
      }

      logger.info("[GA4] Server batch events sent successfully", {
        tag: "ga4-server",
        event_count: events.length,
        event_names: events.map((e) => e.name).join(", "),
        client_id: clientId,
      });

      if (this.config.debug) {
        logger.debug("[GA4] Server batch events payload", {
          tag: "ga4-server",
          event_count: events.length,
          payload: JSON.stringify(payload),
        });
      }
    } catch (error) {
      logger.error("[GA4] Failed to send server batch events", {
        tag: "ga4-server",
        event_count: events.length,
        event_names: events.map((e) => e.name).join(", "),
        client_id: clientId,
        error: error instanceof GA4Error ? error.message : String(error),
        error_code: error instanceof GA4Error ? error.code : undefined,
        error_context: error instanceof GA4Error ? error.context : undefined,
      });
    }
  }

  /**
   * リトライロジック付きfetch
   *
   * 指数バックオフとランダムジッターを使用して、一時的なエラーに対してリトライを実行する
   *
   * @param url - リクエストURL
   * @param options - fetchオプション
   * @param maxRetries - 最大リトライ回数（デフォルト: MAX_RETRIES）
   * @returns Response オブジェクト
   * @throws GA4Error リトライが全て失敗した場合
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
            logger.debug("[GA4] Retrying after error", {
              tag: "ga4-server",
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
   * Client IDフォーマット検証（XXXXXXXXXX.YYYYYYYYYY）
   *
   * @param clientId - 検証するClient ID
   * @returns boolean 有効なフォーマットの場合はtrue
   */
  private isValidClientId(clientId: string): boolean {
    // GA4 Client IDの形式: 数字.数字（例: 1234567890.1234567890）
    const clientIdPattern = /^\d+\.\d+$/;
    return clientIdPattern.test(clientId);
  }

  /**
   * GA4が有効かどうかを確認する
   *
   * @returns boolean GA4が有効な場合はtrue
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Measurement Protocol APIが利用可能かどうかを確認する
   *
   * @returns boolean API Secretが設定されている場合はtrue
   */
  isMeasurementProtocolAvailable(): boolean {
    return this.config.enabled && !!this.config.apiSecret;
  }

  /**
   * デバッグモードかどうかを確認する
   *
   * @returns boolean デバッグモードの場合はtrue
   */
  isDebugMode(): boolean {
    return this.config.debug;
  }
}

// シングルトンインスタンス（デフォルトのfetchを使用）
export const ga4Server = new GA4ServerService();
