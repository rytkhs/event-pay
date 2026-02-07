/**
 * GA4 Analytics - 統合テスト
 * Client ID取得からサーバー送信までのエンドツーエンドフローを検証
 */

import { jest } from "@jest/globals";

import type { GA4Event } from "@core/analytics/event-types";
import { GA4ClientService } from "@core/analytics/ga4-client";
import { GA4ServerService } from "@core/analytics/ga4-server";

// ロガーのモック（ログ出力を抑制）
// jest.mock は巻き上げられるため、モック内で直接定義する
jest.mock("@core/logging/app-logger", () => {
  const mockMethods = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return {
    logger: {
      ...mockMethods,
      withContext: jest.fn(() => mockMethods),
    },
  };
});

// GA4設定のモック（テスト環境でもGA4を有効化）
jest.mock("@core/analytics/config", () => ({
  getGA4Config: jest.fn(() => ({
    measurementId: "G-TEST123456",
    apiSecret: "test-api-secret",
    enabled: true, // テスト環境でも有効化
    debug: false,
  })),
  isGA4Enabled: jest.fn(() => true),
  isMeasurementProtocolAvailable: jest.fn(() => true),
}));

// handleServerErrorのモック（エラーハンドリング）
jest.mock("@core/utils/error-handler.server", () => ({
  handleServerError: jest.fn(),
}));

type LooseGA4Event = {
  name: string;
  params: Record<string, unknown>;
};

function asGA4Event(event: LooseGA4Event): GA4Event {
  return event as unknown as GA4Event;
}

function asGA4Events(events: LooseGA4Event[]): GA4Event[] {
  return events as unknown as GA4Event[];
}

describe("GA4 Analytics - 統合テスト", () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let ga4Server: GA4ServerService;
  let ga4Client: GA4ClientService;

  beforeEach(() => {
    // モックfetchを作成
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

    // GA4ServerServiceをモックfetchで初期化
    ga4Server = new GA4ServerService(mockFetch);

    // GA4ClientServiceを初期化
    ga4Client = new GA4ClientService();

    // デフォルトのモックレスポンス（成功）
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    } as Response);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Client ID取得からサーバー送信までのフロー", () => {
    test("有効なClient IDを取得してサーバーにイベントを送信できる", async () => {
      // Arrange
      const mockClientId = "1234567890.0987654321";
      const mockGtag = jest.fn(
        (
          _command: string,
          _targetId: string,
          _config: string,
          _callback?: (value: string) => void
        ) => {
          if (_command === "get" && _config === "client_id" && _callback) {
            // 非同期でコールバックを実行
            setTimeout(() => _callback(mockClientId), 10);
          }
        }
      );

      // グローバルwindowオブジェクトをモック
      global.window = {
        gtag: mockGtag,
      } as any;

      const testEvent: GA4Event = {
        name: "page_view",
        params: {
          page_title: "Test Page",
          page_location: "https://example.com/test",
        },
      };

      // Act
      const clientId = await ga4Client.getClientId();
      expect(clientId).toBe(mockClientId);

      if (clientId) {
        await ga4Server.sendEvent(testEvent, clientId);
      }

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("measurement_id=G-TEST123456"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining(mockClientId),
        })
      );

      // ペイロードの検証
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body).toEqual({
        client_id: mockClientId,
        events: [
          {
            name: "page_view",
            params: {
              page_title: "Test Page",
              page_location: "https://example.com/test",
            },
          },
        ],
      });
    });

    test("Client ID取得がタイムアウトした場合、nullを返す", async () => {
      // Arrange
      const mockGtag = jest.fn(() => {
        // コールバックを実行しない（タイムアウトをシミュレート）
      });

      global.window = {
        gtag: mockGtag,
      } as any;

      // Act
      const clientId = await ga4Client.getClientId(100); // 100msでタイムアウト

      // Assert
      expect(clientId).toBeNull();
      expect(mockGtag).toHaveBeenCalled();
    });

    test("無効なClient IDの場合、サーバー送信をスキップする", async () => {
      // Arrange
      const invalidClientId = "GA1.invalid.format";
      const testEvent: GA4Event = {
        name: "page_view",
        params: {
          page_title: "Test Page",
        },
      };

      // Act
      await ga4Server.sendEvent(testEvent, invalidClientId);

      // Assert - 無効なClient IDのため、fetchは呼ばれない
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("タイムアウトとリトライの動作確認", () => {
    test("5xxエラーの場合、自動的にリトライする", async () => {
      // Arrange
      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          // 最初の2回は503エラー
          return {
            ok: false,
            status: 503,
            statusText: "Service Unavailable",
          } as Response;
        }
        // 3回目は成功
        return {
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response;
      });

      const testEvent: GA4Event = asGA4Event({
        name: "test_event",
        params: {
          test_param: "test_value",
        },
      });

      // Act
      await ga4Server.sendEvent(testEvent, "1234567890.0987654321");

      // Assert - 3回呼ばれる（2回失敗 + 1回成功）
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(callCount).toBe(3);
    });

    test("全てのリトライが失敗した場合、エラーをログに記録する", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response);

      const testEvent: GA4Event = asGA4Event({
        name: "test_event",
        params: {
          test_param: "test_value",
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { logger } = require("@core/logging/app-logger");

      // Act
      await ga4Server.sendEvent(testEvent, "1234567890.0987654321");

      // Assert - 最大リトライ回数（3回）呼ばれる
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // handleServerError 経由でエラーが記録される（新形式）
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { handleServerError } = require("@core/utils/error-handler.server");
      expect(handleServerError).toHaveBeenCalledWith(
        "GA4_TRACKING_FAILED",
        expect.objectContaining({
          category: "system",
          action: "ga4_send_event",
        })
      );
    });

    test("4xxエラーの場合、リトライせず即座に返す", async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      } as Response);

      const testEvent: GA4Event = asGA4Event({
        name: "test_event",
        params: {
          test_param: "test_value",
        },
      });

      // Act
      await ga4Server.sendEvent(testEvent, "1234567890.0987654321");

      // Assert - 1回のみ呼ばれる（リトライしない）
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("大量イベントのバッチ処理テスト", () => {
    test("25イベント以下の場合、1回のリクエストで送信される", async () => {
      // Arrange
      const events: GA4Event[] = asGA4Events(
        Array.from({ length: 20 }, (_, i) => ({
          name: "test_event",
          params: {
            event_index: i,
            test_param: `value_${i}`,
          },
        }))
      );

      // Act
      await ga4Server.sendEvents(events, "1234567890.0987654321");

      // Assert - 1回のリクエスト
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // ペイロードの検証
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.events).toHaveLength(20);
    });

    test("26イベント以上の場合、25イベントずつに分割して送信される", async () => {
      // Arrange
      const events: GA4Event[] = asGA4Events(
        Array.from({ length: 60 }, (_, i) => ({
          name: "test_event",
          params: {
            event_index: i,
            test_param: `value_${i}`,
          },
        }))
      );

      // Act
      await ga4Server.sendEvents(events, "1234567890.0987654321");

      // Assert - 3回のリクエスト（25 + 25 + 10）
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // 各バッチのサイズを検証
      const batch1 = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const batch2 = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
      const batch3 = JSON.parse(mockFetch.mock.calls[2][1]?.body as string);

      expect(batch1.events).toHaveLength(25);
      expect(batch2.events).toHaveLength(25);
      expect(batch3.events).toHaveLength(10);
    });

    test("一部のバッチが失敗しても、他のバッチは送信される", async () => {
      // Arrange
      // バッチインデックスを追跡して、特定のバッチを失敗させる
      mockFetch.mockImplementation(async (_url: RequestInfo | URL, options?: RequestInit) => {
        // リクエストボディからバッチの内容を確認
        const body = JSON.parse((options as RequestInit).body as string);
        const firstEventIndex = body.events[0].params.event_index;

        // 2番目のバッチ（event_index 25-49）を失敗させる
        if (firstEventIndex >= 25 && firstEventIndex < 50) {
          return {
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response;
      });

      const events: GA4Event[] = asGA4Events(
        Array.from({ length: 60 }, (_, i) => ({
          name: "test_event",
          params: {
            event_index: i,
          },
        }))
      );

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { logger } = require("@core/logging/app-logger");

      // Act
      await ga4Server.sendEvents(events, "1234567890.0987654321");

      // Assert - 全てのバッチが試行される
      // バッチ1 (0-24): 1回成功
      // バッチ2 (25-49): 3回失敗（最初の試行 + 2回リトライ）
      // バッチ3 (50-59): 1回成功
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(5);

      // 成功と失敗のログが記録される
      const batchCompletedCalls = (logger.info as jest.MockedFunction<any>).mock.calls.filter(
        (call: any[]) => call[0]?.includes("Batch processing completed")
      );
      expect(batchCompletedCalls.length).toBeGreaterThan(0);

      // 最後のバッチ完了ログを確認
      const lastBatchLog = batchCompletedCalls[batchCompletedCalls.length - 1][1];
      expect(lastBatchLog).toMatchObject({
        succeeded_batches: 2,
        failed_batches: 1,
      });
    });

    test("無効なパラメータを含むイベントはフィルタリングされる", async () => {
      // Arrange
      const events: GA4Event[] = asGA4Events([
        {
          name: "valid_event",
          params: {
            valid_param: "valid_value",
          },
        },
        {
          name: "invalid_event",
          params: {
            "invalid-param-name": "value", // ハイフンは無効
          },
        },
        {
          name: "another_valid_event",
          params: {
            another_param: "another_value",
          },
        },
      ]);

      // Act
      await ga4Server.sendEvents(events, "1234567890.0987654321");

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // ペイロードの検証 - 無効なイベントは除外される
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.events).toHaveLength(2); // 有効なイベントのみ
      expect(body.events[0].name).toBe("valid_event");
      expect(body.events[1].name).toBe("another_valid_event");
    });
  });

  describe("パラメータ検証とサニタイズ", () => {
    test("長すぎる文字列パラメータは100文字に切り詰められる", async () => {
      // Arrange
      const longString = "a".repeat(150);
      const testEvent: GA4Event = asGA4Event({
        name: "test_event",
        params: {
          long_param: longString,
        },
      });

      // Act
      await ga4Server.sendEvent(testEvent, "1234567890.0987654321");

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.events[0].params.long_param).toHaveLength(100);
    });

    test("無効なパラメータ名は除外される", async () => {
      // Arrange
      const testEvent: GA4Event = asGA4Event({
        name: "test_event",
        params: {
          valid_param: "valid",
          "invalid-param": "invalid", // ハイフンは無効
          another_valid: "valid",
        },
      });

      // Act
      await ga4Server.sendEvent(testEvent, "1234567890.0987654321");

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.events[0].params).toEqual({
        valid_param: "valid",
        another_valid: "valid",
      });
      expect(body.events[0].params).not.toHaveProperty("invalid-param");
    });

    test("セッションIDとエンゲージメント時間が正しく追加される", async () => {
      // Arrange
      const testEvent: GA4Event = asGA4Event({
        name: "test_event",
        params: {
          test_param: "test_value",
        },
      });

      const sessionId = 1234567890;
      const engagementTimeMsec = 5000;

      // Act
      await ga4Server.sendEvent(
        testEvent,
        "1234567890.0987654321",
        undefined,
        sessionId,
        engagementTimeMsec
      );

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.events[0].params).toEqual({
        test_param: "test_value",
        session_id: sessionId,
        engagement_time_msec: engagementTimeMsec,
      });
    });
  });

  describe("エラーハンドリング", () => {
    test("Client IDもUser IDもない場合、送信をスキップする", async () => {
      // Arrange
      const testEvent: GA4Event = asGA4Event({
        name: "test_event",
        params: {
          test_param: "test_value",
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { logger } = require("@core/logging/app-logger");

      // Act
      await ga4Server.sendEvent(testEvent);

      // Assert
      expect(mockFetch).not.toHaveBeenCalled();
      // withContextで返されるロガーのwarnを確認
      expect(logger.withContext().warn).toHaveBeenCalledWith(
        expect.stringContaining("Neither valid client ID nor user ID provided"),
        expect.any(Object)
      );
    });

    test("User IDのみでイベントを送信できる", async () => {
      // Arrange
      const testEvent: GA4Event = asGA4Event({
        name: "test_event",
        params: {
          test_param: "test_value",
        },
      });

      const userId = "user123";

      // Act
      await ga4Server.sendEvent(testEvent, undefined, userId);

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body).toEqual({
        user_id: userId,
        events: [
          {
            name: "test_event",
            params: {
              test_param: "test_value",
            },
          },
        ],
      });
      expect(body).not.toHaveProperty("client_id");
    });

    test("全てのイベントが無効な場合、バッチ送信をスキップする", async () => {
      // Arrange
      const events: GA4Event[] = asGA4Events([
        {
          name: "invalid_event_1",
          params: {
            "invalid-param": "value",
          },
        },
        {
          name: "invalid_event_2",
          params: {
            "another-invalid": "value",
          },
        },
      ]);

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { logger } = require("@core/logging/app-logger");

      // Act
      await ga4Server.sendEvents(events, "1234567890.0987654321");

      // Assert
      expect(mockFetch).not.toHaveBeenCalled();
      // withContextで返されるロガーのwarnを確認
      expect(logger.withContext().warn).toHaveBeenCalledWith(
        expect.stringContaining("No valid events in batch after validation"),
        expect.any(Object)
      );
    });
  });
});
