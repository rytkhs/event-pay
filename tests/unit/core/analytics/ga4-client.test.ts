/**
 * @jest-environment jsdom
 */

import { GA4ClientService } from "../../../../core/analytics/ga4-client";
import { GA4Validator } from "../../../../core/analytics/ga4-validator";
import * as configModule from "../../../../core/analytics/config";

// sendGAEventのモック
jest.mock("@next/third-parties/google", () => ({
  sendGAEvent: jest.fn(),
}));

const { sendGAEvent } = require("@next/third-parties/google");

describe("GA4ClientService", () => {
  let service: GA4ClientService;
  let mockGtag: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // デフォルトの設定をモック（インスタンス化の前に設定する必要がある）
    jest.spyOn(configModule, "getGA4Config").mockReturnValue({
      enabled: true,
      measurementId: "G-TEST123",
      apiSecret: "test-secret",
      debug: false,
    });

    service = new GA4ClientService();

    // window.gtagのモック
    mockGtag = jest.fn();
    (global as any).window = {
      gtag: mockGtag,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("設定の初期化", () => {
    test("コンストラクタで設定を取得する", () => {
      const getConfigSpy = jest.spyOn(configModule, "getGA4Config");
      new GA4ClientService();
      expect(getConfigSpy).toHaveBeenCalled();
    });
  });

  describe("getClientId", () => {
    describe("正常系", () => {
      test("有効なClient IDを取得できる", async () => {
        const validClientId = "1234567890.0987654321";

        // window.gtagを直接設定
        (global as any).window.gtag = jest.fn((command, targetId, config, callback) => {
          if (command === "get" && config === "client_id" && typeof callback === "function") {
            // 即座にコールバックを実行
            callback(validClientId);
          }
        });

        const result = await service.getClientId();

        expect(result).toBe(validClientId);
        expect((global as any).window.gtag).toHaveBeenCalledWith(
          "get",
          "G-TEST123",
          "client_id",
          expect.any(Function)
        );
      });

      test("カスタムタイムアウトを指定できる", async () => {
        const validClientId = "1234567890.0987654321";

        (global as any).window.gtag = jest.fn((command, targetId, config, callback) => {
          if (command === "get" && config === "client_id" && typeof callback === "function") {
            callback(validClientId);
          }
        });

        const result = await service.getClientId(5000);

        expect(result).toBe(validClientId);
      });
    });

    describe("Client ID検証", () => {
      test("GA1.1.プレフィックス付きのClient IDを正しく処理する", async () => {
        const prefixedClientId = "GA1.1.1234567890.0987654321";
        const expectedClientId = "1234567890.0987654321";

        (global as any).window.gtag = jest.fn((command, targetId, config, callback) => {
          if (command === "get" && config === "client_id" && typeof callback === "function") {
            // 実際のwindow.gtagはプレフィックス付きで返す
            callback(prefixedClientId);
          }
        });

        const result = await service.getClientId();

        // サニタイズ後の値が返されるべき
        expect(result).toBe(expectedClientId);
      });

      test("GA1.2.プレフィックス付きのClient IDを正しく処理する", async () => {
        const prefixedClientId = "GA1.2.9876543210.1234567890";
        const expectedClientId = "9876543210.1234567890";

        (global as any).window.gtag = jest.fn((command, targetId, config, callback) => {
          if (command === "get" && config === "client_id" && typeof callback === "function") {
            callback(prefixedClientId);
          }
        });

        const result = await service.getClientId();

        expect(result).toBe(expectedClientId);
      });

      test("不完全なプレフィックスのClient IDを拒否する", async () => {
        const invalidClientId = "GA1.1234567890.0987654321";

        (global as any).window.gtag = jest.fn((command, targetId, config, callback) => {
          if (command === "get" && config === "client_id" && typeof callback === "function") {
            callback(invalidClientId);
          }
        });

        const result = await service.getClientId();

        expect(result).toBeNull();
      });

      test("形式が正しくないClient IDを拒否する", async () => {
        const invalidClientId = "invalid-format";

        (global as any).window.gtag = jest.fn((command, targetId, config, callback) => {
          if (command === "get" && config === "client_id" && typeof callback === "function") {
            callback(invalidClientId);
          }
        });

        const result = await service.getClientId();

        expect(result).toBeNull();
      });
    });

    describe("タイムアウト処理", () => {
      test("タイムアウト時にnullを返す", async () => {
        // コールバックを呼ばないことでタイムアウトをシミュレート
        mockGtag.mockImplementation(() => {
          // コールバックを呼ばない
        });

        const result = await service.getClientId(100);

        expect(result).toBeNull();
      });

      test("タイムアウト後にコールバックが呼ばれても無視する", async () => {
        const validClientId = "1234567890.0987654321";
        let delayedCallback: ((id: string) => void) | null = null;

        (global as any).window.gtag = jest.fn((command, targetId, config, callback) => {
          if (command === "get" && config === "client_id" && typeof callback === "function") {
            // コールバックを保存して遅延実行
            delayedCallback = callback;
          }
        });

        const resultPromise = service.getClientId(100);

        // タイムアウト後にコールバックを実行
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (delayedCallback) {
          (delayedCallback as (id: string) => void)(validClientId);
        }

        const result = await resultPromise;

        // タイムアウトしているのでnull
        expect(result).toBeNull();
      });
    });

    describe("エラーハンドリング", () => {
      test("gtagが存在しない場合はnullを返す", async () => {
        (global as any).window = {};

        const result = await service.getClientId();

        expect(result).toBeNull();
      });

      test("windowが存在しない場合はnullを返す", async () => {
        delete (global as any).window;

        const result = await service.getClientId();

        expect(result).toBeNull();
      });

      test("gtag呼び出しでエラーが発生した場合はnullを返す", async () => {
        mockGtag.mockImplementation(() => {
          throw new Error("gtag error");
        });

        const result = await service.getClientId();

        expect(result).toBeNull();
      });
    });

    describe("GA4無効時", () => {
      test("GA4が無効な場合はnullを返す", async () => {
        jest.spyOn(configModule, "getGA4Config").mockReturnValue({
          enabled: false,
          measurementId: "G-TEST123",
          apiSecret: "test-secret",
          debug: false,
        });
        // 設定変更を反映させるために再インスタンス化
        service = new GA4ClientService();

        const result = await service.getClientId();

        expect(result).toBeNull();
        expect(mockGtag).not.toHaveBeenCalled();
      });
    });
  });

  describe("sendEventWithCallback", () => {
    describe("正常系", () => {
      test("イベント送信後にコールバックが実行される", (done) => {
        const event = { name: "test_event", params: { value: 1 } } as any;

        sendGAEvent.mockImplementation((name: string, params: any) => {
          // event_callbackを即座に実行
          if (params.event_callback) {
            params.event_callback();
          }
        });

        service.sendEventWithCallback(event, () => {
          expect(sendGAEvent).toHaveBeenCalledWith(
            "test_event",
            expect.objectContaining({
              value: 1,
              event_callback: expect.any(Function),
            })
          );
          done();
        });
      });

      test("カスタムタイムアウトを指定できる", (done) => {
        const event = { name: "test_event", params: {} } as any;

        sendGAEvent.mockImplementation((name: string, params: any) => {
          if (params.event_callback) {
            params.event_callback();
          }
        });

        service.sendEventWithCallback(event, done, 5000);
      });
    });

    describe("タイムアウト処理", () => {
      test("タイムアウト時にコールバックが実行される", (done) => {
        const event = { name: "test_event", params: {} } as any;

        // event_callbackを呼ばないことでタイムアウトをシミュレート
        sendGAEvent.mockImplementation(() => {
          // コールバックを呼ばない
        });

        service.sendEventWithCallback(event, done, 100);
      });

      test("コールバックは一度だけ実行される", (done) => {
        const event = { name: "test_event", params: {} } as any;
        let callbackCount = 0;

        sendGAEvent.mockImplementation((name: string, params: any) => {
          // 少し遅延してコールバックを実行（タイムアウトと競合）
          setTimeout(() => {
            if (params.event_callback) {
              params.event_callback();
            }
          }, 50);
        });

        service.sendEventWithCallback(
          event,
          () => {
            callbackCount++;
            // 少し待ってからカウントを確認
            setTimeout(() => {
              expect(callbackCount).toBe(1);
              done();
            }, 100);
          },
          100
        );
      });
    });

    describe("エラーハンドリング", () => {
      test("sendGAEventでエラーが発生してもコールバックは実行される", (done) => {
        const event = { name: "test_event", params: {} } as any;

        sendGAEvent.mockImplementation(() => {
          throw new Error("sendGAEvent error");
        });

        service.sendEventWithCallback(event, done);
      });
    });

    describe("GA4無効時", () => {
      test("GA4が無効でもコールバックは実行される", (done) => {
        jest.spyOn(configModule, "getGA4Config").mockReturnValue({
          enabled: false,
          measurementId: "G-TEST123",
          apiSecret: "test-secret",
          debug: false,
        });
        service = new GA4ClientService();

        const event = { name: "test_event", params: {} } as any;

        service.sendEventWithCallback(event, () => {
          expect(sendGAEvent).not.toHaveBeenCalled();
          done();
        });
      });
    });
  });

  describe("sendEvent", () => {
    test("イベントを送信する", () => {
      const event = { name: "test_event", params: { value: 1 } } as any;

      service.sendEvent(event);

      expect(sendGAEvent).toHaveBeenCalledWith("test_event", { value: 1 });
    });

    test("GA4が無効な場合は送信しない", () => {
      jest.spyOn(configModule, "getGA4Config").mockReturnValue({
        enabled: false,
        measurementId: "G-TEST123",
        apiSecret: "test-secret",
        debug: false,
      });
      service = new GA4ClientService();

      const event = { name: "test_event", params: {} } as any;

      service.sendEvent(event);

      expect(sendGAEvent).not.toHaveBeenCalled();
    });
  });

  describe("isEnabled", () => {
    test("GA4が有効な場合はtrueを返す", () => {
      expect(service.isEnabled()).toBe(true);
    });

    test("GA4が無効な場合はfalseを返す", () => {
      jest.spyOn(configModule, "getGA4Config").mockReturnValue({
        enabled: false,
        measurementId: "G-TEST123",
        apiSecret: "test-secret",
        debug: false,
      });
      service = new GA4ClientService();

      expect(service.isEnabled()).toBe(false);
    });
  });

  describe("isDebugMode", () => {
    test("デバッグモードが有効な場合はtrueを返す", () => {
      jest.spyOn(configModule, "getGA4Config").mockReturnValue({
        enabled: true,
        measurementId: "G-TEST123",
        apiSecret: "test-secret",
        debug: true,
      });
      service = new GA4ClientService();

      expect(service.isDebugMode()).toBe(true);
    });

    test("デバッグモードが無効な場合はfalseを返す", () => {
      expect(service.isDebugMode()).toBe(false);
    });
  });
});
