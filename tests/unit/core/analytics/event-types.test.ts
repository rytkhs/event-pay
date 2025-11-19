/**
 * @jest-environment node
 */

import type {
  GA4ParamValue,
  GA4EventParams,
  BaseEventParams,
  GA4Event,
  SignUpEventParams,
  LoginEventParams,
  EventCreatedParams,
  BeginCheckoutParams,
  PurchaseParams,
  ExceptionParams,
} from "../../../../core/analytics/event-types";

describe("GA4 Event Type Definitions", () => {
  describe("GA4ParamValue型", () => {
    test("string型の値を受け入れる", () => {
      const value: GA4ParamValue = "test";
      expect(typeof value).toBe("string");
    });

    test("number型の値を受け入れる", () => {
      const value: GA4ParamValue = 123;
      expect(typeof value).toBe("number");
    });

    test("boolean型の値を受け入れる", () => {
      const value: GA4ParamValue = true;
      expect(typeof value).toBe("boolean");
    });

    test("undefined型の値を受け入れる", () => {
      const value: GA4ParamValue = undefined;
      expect(value).toBeUndefined();
    });
  });

  describe("GA4EventParams型", () => {
    test("単純なキー・バリューペアを受け入れる", () => {
      const params: GA4EventParams = {
        event_category: "test",
        value: 100,
        is_active: true,
      };

      expect(params.event_category).toBe("test");
      expect(params.value).toBe(100);
      expect(params.is_active).toBe(true);
    });

    test("配列値を受け入れる", () => {
      const params: GA4EventParams = {
        tags: ["tag1", "tag2"],
        numbers: [1, 2, 3],
        flags: [true, false],
      };

      expect(Array.isArray(params.tags)).toBe(true);
      expect(Array.isArray(params.numbers)).toBe(true);
      expect(Array.isArray(params.flags)).toBe(true);
    });

    test("ネストされたオブジェクトを受け入れる", () => {
      const params: GA4EventParams = {
        metadata: {
          source: "web",
          version: 1,
          enabled: true,
        },
      };

      expect(typeof params.metadata).toBe("object");
      expect((params.metadata as Record<string, GA4ParamValue>).source).toBe("web");
    });

    test("混合型のパラメータを受け入れる", () => {
      const params: GA4EventParams = {
        string_param: "value",
        number_param: 42,
        boolean_param: true,
        undefined_param: undefined,
        array_param: ["a", "b"],
        object_param: { key: "value" },
      };

      expect(Object.keys(params).length).toBe(6);
    });
  });

  describe("BaseEventParams型", () => {
    test("基本プロパティを持つ", () => {
      const params: BaseEventParams = {
        event_category: "engagement",
        event_label: "button_click",
        value: 1,
      };

      expect(params.event_category).toBe("engagement");
      expect(params.event_label).toBe("button_click");
      expect(params.value).toBe(1);
    });

    test("event_callbackプロパティを持つ", () => {
      const callback = jest.fn();
      const params: BaseEventParams = {
        event_callback: callback,
      };

      expect(typeof params.event_callback).toBe("function");
      params.event_callback?.();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test("すべてのプロパティがオプショナル", () => {
      const params: BaseEventParams = {};
      expect(Object.keys(params).length).toBe(0);
    });
  });

  describe("GA4Event型の型安全性", () => {
    test("sign_upイベントは正しいパラメータ型を要求する", () => {
      const event: GA4Event = {
        name: "sign_up",
        params: {
          method: "password",
        },
      };

      expect(event.name).toBe("sign_up");
      expect(event.params.method).toBe("password");
    });

    test("loginイベントは正しいパラメータ型を要求する", () => {
      const event: GA4Event = {
        name: "login",
        params: {
          method: "google",
        },
      };

      expect(event.name).toBe("login");
      expect(event.params.method).toBe("google");
    });

    test("event_createdイベントは必須フィールドを要求する", () => {
      const event: GA4Event = {
        name: "event_created",
        params: {
          event_id: "evt_123",
          event_title: "Test Event",
          event_date: "2024-01-01",
          amount: 1000,
          currency: "JPY",
        },
      };

      expect(event.name).toBe("event_created");
      expect(event.params.event_id).toBe("evt_123");
      expect(event.params.currency).toBe("JPY");
    });

    test("begin_checkoutイベントはitemsプロパティを要求する", () => {
      const event: GA4Event = {
        name: "begin_checkout",
        params: {
          event_id: "evt_123",
          currency: "JPY",
          value: 1000,
          items: [
            {
              item_id: "item_1",
              item_name: "Test Item",
              price: 1000,
              quantity: 1,
            },
          ],
        },
      };

      expect(event.name).toBe("begin_checkout");
      expect(event.params.items.length).toBe(1);
      expect(event.params.items[0].item_id).toBe("item_1");
    });

    test("purchaseイベントはtransaction_idを要求する", () => {
      const event: GA4Event = {
        name: "purchase",
        params: {
          transaction_id: "txn_123",
          event_id: "evt_123",
          currency: "JPY",
          value: 1000,
          items: [
            {
              item_id: "item_1",
              item_name: "Test Item",
              price: 1000,
              quantity: 1,
            },
          ],
        },
      };

      expect(event.name).toBe("purchase");
      expect(event.params.transaction_id).toBe("txn_123");
    });

    test("exceptionイベントは正しいパラメータ型を要求する", () => {
      const event: GA4Event = {
        name: "exception",
        params: {
          description: "Test error",
          fatal: false,
        },
      };

      expect(event.name).toBe("exception");
      expect(event.params.description).toBe("Test error");
      expect(event.params.fatal).toBe(false);
    });
  });

  describe("型制約の検証", () => {
    test("BaseEventParamsを継承したパラメータ型", () => {
      const signUpParams: SignUpEventParams = {
        method: "password",
        event_category: "auth",
        event_label: "signup",
        value: 1,
        event_callback: () => {},
      };

      expect(signUpParams.method).toBe("password");
      expect(signUpParams.event_category).toBe("auth");
      expect(typeof signUpParams.event_callback).toBe("function");
    });

    test("LoginEventParamsにBaseEventParamsのプロパティが含まれる", () => {
      const loginParams: LoginEventParams = {
        method: "google",
        event_category: "auth",
        event_label: "login",
        value: 1,
      };

      expect(loginParams.method).toBe("google");
      expect(loginParams.event_category).toBe("auth");
    });

    test("EventCreatedParamsに必須フィールドが含まれる", () => {
      const params: EventCreatedParams = {
        event_id: "evt_123",
        event_title: "Test Event",
        event_date: "2024-01-01",
        amount: 1000,
        currency: "JPY",
      };

      expect(params.event_id).toBe("evt_123");
      expect(params.currency).toBe("JPY");
    });

    test("BeginCheckoutParamsのitemsが正しい構造を持つ", () => {
      const params: BeginCheckoutParams = {
        event_id: "evt_123",
        currency: "JPY",
        value: 1000,
        items: [
          {
            item_id: "item_1",
            item_name: "Test Item",
            price: 1000,
            quantity: 1,
          },
        ],
      };

      expect(params.items[0]).toHaveProperty("item_id");
      expect(params.items[0]).toHaveProperty("item_name");
      expect(params.items[0]).toHaveProperty("price");
      expect(params.items[0]).toHaveProperty("quantity");
    });

    test("PurchaseParamsにtransaction_idが含まれる", () => {
      const params: PurchaseParams = {
        transaction_id: "txn_123",
        event_id: "evt_123",
        currency: "JPY",
        value: 1000,
        items: [],
      };

      expect(params.transaction_id).toBe("txn_123");
    });

    test("ExceptionParamsに必須フィールドが含まれる", () => {
      const params: ExceptionParams = {
        description: "Test error",
        fatal: false,
      };

      expect(params.description).toBe("Test error");
      expect(params.fatal).toBe(false);
    });
  });

  describe("実用的なユースケース", () => {
    test("サインアップイベントの完全な例", () => {
      const event: GA4Event = {
        name: "sign_up",
        params: {
          method: "password",
          event_category: "authentication",
          event_label: "email_signup",
          value: 1,
        },
      };

      expect(event.name).toBe("sign_up");
      expect(event.params.method).toBe("password");
    });

    test("購入イベントの完全な例", () => {
      const event: GA4Event = {
        name: "purchase",
        params: {
          transaction_id: "txn_abc123",
          event_id: "evt_xyz789",
          currency: "JPY",
          value: 5000,
          items: [
            {
              item_id: "ticket_001",
              item_name: "Event Ticket",
              price: 5000,
              quantity: 1,
            },
          ],
          event_category: "ecommerce",
          event_label: "event_payment",
        },
      };

      expect(event.name).toBe("purchase");
      expect(event.params.transaction_id).toBe("txn_abc123");
      expect(event.params.items.length).toBe(1);
      expect(event.params.items[0].price).toBe(5000);
    });

    test("エラーイベントの完全な例", () => {
      const event: GA4Event = {
        name: "exception",
        params: {
          description: "Payment processing failed",
          fatal: true,
        },
      };

      expect(event.name).toBe("exception");
      expect(event.params.fatal).toBe(true);
    });

    test("コールバック付きログインイベント", () => {
      const callback = jest.fn();
      const event: GA4Event = {
        name: "login",
        params: {
          method: "google",
          event_callback: callback,
        },
      };

      expect(event.name).toBe("login");
      expect(typeof event.params.event_callback).toBe("function");
      event.params.event_callback?.();
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("型の互換性", () => {
    test("GA4EventParams型はBaseEventParamsと互換性がある", () => {
      const baseParams: BaseEventParams = {
        event_category: "test",
        value: 100,
      };

      const eventParams: GA4EventParams = baseParams;

      expect(eventParams.event_category).toBe("test");
      expect(eventParams.value).toBe(100);
    });

    test("具体的なイベントパラメータ型はBaseEventParamsを拡張する", () => {
      const signUpParams: SignUpEventParams = {
        method: "password",
        event_category: "auth",
      };

      const baseParams: BaseEventParams = signUpParams;

      expect(baseParams.event_category).toBe("auth");
    });
  });
});
