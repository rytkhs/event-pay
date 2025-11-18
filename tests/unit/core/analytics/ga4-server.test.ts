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
