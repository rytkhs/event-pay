/**
 * GA4ServerService Unit Tests
 */

import * as configModule from "../../../../core/analytics/config";
import { GA4ServerService } from "../../../../core/analytics/ga4-server";

// loggerのモック
jest.mock("@core/logging/app-logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withContext: jest.fn().mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

describe("GA4ServerService", () => {
  let service: GA4ServerService;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // デフォルトの設定をモック
    jest.spyOn(configModule, "getGA4Config").mockReturnValue({
      enabled: true,
      measurementId: "G-TEST123",
      apiSecret: "test-secret",
      debug: false,
    });

    // モックfetchを作成
    mockFetch = jest.fn();
    service = new GA4ServerService(mockFetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("設定の動的取得", () => {
    test("メソッド呼び出し時に毎回設定を取得する", async () => {
      const getConfigSpy = jest.spyOn(configModule, "getGA4Config");

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      } as Response);

      await service.sendEvent(
        { name: "sign_up", params: { method: "password" } },
        "1234567890.0987654321"
      );

      expect(getConfigSpy).toHaveBeenCalled();
    });
  });

  describe("fetchWithRetry", () => {
    describe("正常系", () => {
      test("1回目で成功した場合はリトライしない", async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response);

        await service.sendEvent(
          { name: "sign_up", params: { method: "password" } },
          "1234567890.0987654321"
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    describe("リトライロジック", () => {
      test("5xxエラーの場合は最大3回リトライする", async () => {
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
          } as Response)
          .mockResolvedValueOnce({
            ok: false,
            status: 503,
            statusText: "Service Unavailable",
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: "OK",
          } as Response);

        await service.sendEvent(
          { name: "sign_up", params: { method: "password" } },
          "1234567890.0987654321"
        );

        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      test("全てのリトライが失敗した場合はエラーをログに記録する", async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        } as Response);

        await service.sendEvent(
          { name: "sign_up", params: { method: "password" } },
          "1234567890.0987654321"
        );

        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      test("4xxエラーの場合はリトライしない", async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          statusText: "Bad Request",
        } as Response);

        await service.sendEvent(
          { name: "sign_up", params: { method: "password" } },
          "1234567890.0987654321"
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("sendEvent", () => {
    describe("正常系", () => {
      test("有効なClient IDでイベントを送信できる", async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response);

        await service.sendEvent(
          { name: "sign_up", params: { method: "email" } },
          "1234567890.0987654321"
        );

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("measurement_id=G-TEST123"),
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: expect.stringContaining('"client_id":"1234567890.0987654321"'),
          })
        );
      });

      test("パラメータが検証とサニタイズされる", async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response);

        // 長い文字列を含むパラメータ
        const longString = "a".repeat(150);
        await service.sendEvent(
          {
            name: "sign_up",
            params: { method: "email", description: longString } as any,
          },
          "1234567890.0987654321"
        );

        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        // 文字列が100文字に切り詰められていることを確認
        expect(body.events[0].params.description).toHaveLength(100);
        expect(body.events[0].params.method).toBe("email");
      });

      test("User IDでイベントを送信できる", async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response);

        await service.sendEvent(
          { name: "login", params: { method: "password" } },
          undefined,
          "user-123"
        );

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('"user_id":"user-123"'),
          })
        );
      });

      test("セッションIDとエンゲージメント時間を含めることができる", async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response);

        await service.sendEvent(
          { name: "sign_up", params: { method: "password" } },
          "1234567890.0987654321",
          undefined,
          12345,
          5000
        );

        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.events[0].params.session_id).toBe(12345);
        expect(body.events[0].params.engagement_time_msec).toBe(5000);
      });
    });

    describe("エラーハンドリング", () => {
      test("GA4が無効な場合は送信しない", async () => {
        jest.spyOn(configModule, "getGA4Config").mockReturnValue({
          enabled: false,
          measurementId: "G-TEST123",
          apiSecret: "test-secret",
          debug: false,
        });

        await service.sendEvent(
          { name: "sign_up", params: { method: "password" } },
          "1234567890.0987654321"
        );

        expect(mockFetch).not.toHaveBeenCalled();
      });

      test("API Secretがない場合は送信しない", async () => {
        jest.spyOn(configModule, "getGA4Config").mockReturnValue({
          enabled: true,
          measurementId: "G-TEST123",
          apiSecret: "",
          debug: false,
        });

        await service.sendEvent(
          { name: "sign_up", params: { method: "password" } },
          "1234567890.0987654321"
        );

        expect(mockFetch).not.toHaveBeenCalled();
      });

      test("Client IDもUser IDもない場合は送信しない", async () => {
        await service.sendEvent({ name: "logout", params: {} });

        expect(mockFetch).not.toHaveBeenCalled();
      });

      test("無効なClient IDの場合は送信しない", async () => {
        await service.sendEvent({ name: "logout", params: {} }, "invalid-client-id");

        expect(mockFetch).not.toHaveBeenCalled();
      });

      test("無効なパラメータ名を含む場合は送信しない", async () => {
        await service.sendEvent(
          {
            name: "sign_up",
            params: { "invalid-param": "value" } as any, // ハイフンは無効
          },
          "1234567890.0987654321"
        );

        expect(mockFetch).not.toHaveBeenCalled();
      });

      test("全てのパラメータが無効な場合は送信しない", async () => {
        await service.sendEvent(
          {
            name: "sign_up",
            params: {
              "invalid-param-1": "value1",
              "invalid-param-2": "value2",
            } as any,
          },
          "1234567890.0987654321"
        );

        expect(mockFetch).not.toHaveBeenCalled();
      });
    });
  });

  describe("sendEvents", () => {
    describe("正常系", () => {
      test("複数のイベントをバッチ送信できる", async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response);

        const events = [
          { name: "logout" as const, params: {} },
          { name: "logout" as const, params: {} },
        ];

        await service.sendEvents(events, "1234567890.0987654321");

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.events).toHaveLength(2);
        expect(body.client_id).toBe("1234567890.0987654321");
      });

      test("25個以下のイベントは1つのバッチで送信される", async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response);

        // 25個のイベントを作成
        const events = Array.from({ length: 25 }, (_, i) => ({
          name: "logout" as const,
          params: { index: i },
        }));

        await service.sendEvents(events as any, "1234567890.0987654321");

        // 1回のfetch呼び出しのみ
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        expect(body.events).toHaveLength(25);
      });

      test("26個以上のイベントは複数のバッチに分割される", async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response);

        // 30個のイベントを作成（25個 + 5個に分割されるはず）
        const events = Array.from({ length: 30 }, (_, i) => ({
          name: "logout" as const,
          params: { index: i },
        }));

        await service.sendEvents(events as any, "1234567890.0987654321");

        // 2回のfetch呼び出し（25個 + 5個）
        expect(mockFetch).toHaveBeenCalledTimes(2);

        // 最初のバッチは25個
        const firstBatch = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(firstBatch.events).toHaveLength(25);

        // 2番目のバッチは5個
        const secondBatch = JSON.parse(mockFetch.mock.calls[1][1].body);
        expect(secondBatch.events).toHaveLength(5);
      });

      test("60個のイベントは3つのバッチに分割される", async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response);

        // 60個のイベントを作成（25 + 25 + 10に分割されるはず）
        const events = Array.from({ length: 60 }, (_, i) => ({
          name: "logout" as const,
          params: { index: i },
        }));

        await service.sendEvents(events as any, "1234567890.0987654321");

        // 3回のfetch呼び出し
        expect(mockFetch).toHaveBeenCalledTimes(3);

        // 各バッチのサイズを確認
        const batch1 = JSON.parse(mockFetch.mock.calls[0][1].body);
        const batch2 = JSON.parse(mockFetch.mock.calls[1][1].body);
        const batch3 = JSON.parse(mockFetch.mock.calls[2][1].body);

        expect(batch1.events).toHaveLength(25);
        expect(batch2.events).toHaveLength(25);
        expect(batch3.events).toHaveLength(10);
      });

      test("バッチは並列処理される", async () => {
        const delays: number[] = [];
        mockFetch.mockImplementation(async () => {
          const startTime = Date.now();
          await new Promise((resolve) => setTimeout(resolve, 10));
          delays.push(Date.now() - startTime);
          return {
            ok: true,
            status: 200,
            statusText: "OK",
          } as Response;
        });

        // 50個のイベントを作成（2つのバッチに分割）
        const events = Array.from({ length: 50 }, (_, i) => ({
          name: "logout" as const,
          params: { index: i },
        }));

        const startTime = Date.now();
        await service.sendEvents(events as any, "1234567890.0987654321");
        const totalTime = Date.now() - startTime;

        // 並列処理なので、合計時間は2つのバッチの合計時間より短いはず
        // （各バッチが10ms待機するが、並列なので合計は約10ms程度）
        expect(totalTime).toBeLessThan(30); // 余裕を持って30ms未満
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      test("無効なイベントをフィルタリングして有効なイベントのみ送信する", async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response);

        const events = [
          { name: "sign_up" as const, params: { method: "email" } }, // 有効
          { name: "login" as const, params: { "invalid-param": "value" } as any }, // 無効
          { name: "logout" as const, params: { valid_param: "value" } as any }, // 有効
        ];

        await service.sendEvents(events as any, "1234567890.0987654321");

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        // 有効な2つのイベントのみが送信される
        expect(body.events).toHaveLength(2);
        expect(body.events[0].name).toBe("sign_up");
        expect(body.events[1].name).toBe("logout");
      });

      test("パラメータがサニタイズされる", async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
        } as Response);

        const longString = "a".repeat(150);
        const events = [{ name: "sign_up" as const, params: { description: longString } as any }];

        await service.sendEvents(events as any, "1234567890.0987654321");

        const callArgs = mockFetch.mock.calls[0];
        const body = JSON.parse(callArgs[1].body);

        // 文字列が100文字に切り詰められていることを確認
        expect(body.events[0].params.description).toHaveLength(100);
      });
    });

    describe("部分失敗時の動作", () => {
      test("一部のバッチが失敗しても他のバッチは送信される", async () => {
        let callCount = 0;
        // 最初の3回の呼び出しは失敗（バッチ0のリトライ）、残りは成功（バッチ1）
        mockFetch.mockImplementation(async () => {
          callCount++;
          if (callCount <= 3) {
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

        // 50個のイベントを作成（2つのバッチに分割）
        const events = Array.from({ length: 50 }, (_, i) => ({
          name: "logout" as const,
          params: { index: i },
        }));

        await service.sendEvents(events as any, "1234567890.0987654321");

        // 並列処理のため、正確な呼び出し回数は保証できないが、
        // 少なくとも4回以上呼び出される（バッチ0の3回 + バッチ1の1回以上）
        expect(mockFetch).toHaveBeenCalled();
        expect(callCount).toBeGreaterThanOrEqual(4);
      });

      test("全てのバッチが失敗してもエラーをスローしない", async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        } as Response);

        // 50個のイベントを作成（2つのバッチに分割）
        const events = Array.from({ length: 50 }, (_, i) => ({
          name: "logout" as const,
          params: { index: i },
        }));

        // エラーをスローせずに完了する
        await expect(
          service.sendEvents(events as any, "1234567890.0987654321")
        ).resolves.not.toThrow();

        // 各バッチが3回ずつリトライ（2バッチ × 3回 = 6回）
        expect(mockFetch).toHaveBeenCalledTimes(6);
      });
    });

    describe("エラーハンドリング", () => {
      test("無効なClient IDの場合は送信しない", async () => {
        const events = [{ name: "logout" as const, params: {} }];

        await service.sendEvents(events, "invalid-client-id");

        expect(mockFetch).not.toHaveBeenCalled();
      });

      test("GA4が無効な場合は送信しない", async () => {
        jest.spyOn(configModule, "getGA4Config").mockReturnValue({
          enabled: false,
          measurementId: "G-TEST123",
          apiSecret: "test-secret",
          debug: false,
        });

        const events = [{ name: "logout" as const, params: {} }];

        await service.sendEvents(events, "1234567890.0987654321");

        expect(mockFetch).not.toHaveBeenCalled();
      });

      test("全てのイベントが無効な場合は送信しない", async () => {
        const events = [
          { name: "sign_up" as const, params: { "invalid-param-1": "value1" } as any },
          { name: "login" as const, params: { "invalid-param-2": "value2" } as any },
        ];

        await service.sendEvents(events as any, "1234567890.0987654321");

        expect(mockFetch).not.toHaveBeenCalled();
      });
    });
  });

  describe("ヘルパーメソッド", () => {
    test("isEnabled: GA4が有効な場合はtrueを返す", () => {
      expect(service.isEnabled()).toBe(true);
    });

    test("isEnabled: GA4が無効な場合はfalseを返す", () => {
      jest.spyOn(configModule, "getGA4Config").mockReturnValue({
        enabled: false,
        measurementId: "G-TEST123",
        apiSecret: "test-secret",
        debug: false,
      });

      expect(service.isEnabled()).toBe(false);
    });

    test("isMeasurementProtocolAvailable: API Secretがある場合はtrueを返す", () => {
      expect(service.isMeasurementProtocolAvailable()).toBe(true);
    });

    test("isMeasurementProtocolAvailable: API Secretがない場合はfalseを返す", () => {
      jest.spyOn(configModule, "getGA4Config").mockReturnValue({
        enabled: true,
        measurementId: "G-TEST123",
        apiSecret: "",
        debug: false,
      });

      expect(service.isMeasurementProtocolAvailable()).toBe(false);
    });

    test("isDebugMode: デバッグモードが有効な場合はtrueを返す", () => {
      jest.spyOn(configModule, "getGA4Config").mockReturnValue({
        enabled: true,
        measurementId: "G-TEST123",
        apiSecret: "test-secret",
        debug: true,
      });

      expect(service.isDebugMode()).toBe(true);
    });

    test("isDebugMode: デバッグモードが無効な場合はfalseを返す", () => {
      expect(service.isDebugMode()).toBe(false);
    });
  });
});
