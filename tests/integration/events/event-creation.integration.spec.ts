/**
 * イベント作成統合テスト - 1.1 基本的なイベント作成
 *
 * このテストファイルは、イベント作成機能の基本的な正常系のテストケースを実装します。
 * - 1.1.1 最小限の必須項目のみでの無料イベント作成
 * - 1.1.2 全項目入力での有料イベント作成
 * - 1.1.3 現金決済のみの有料イベント作成
 * - 1.1.4 オンライン決済のみの有料イベント作成
 * - 1.1.5 複数決済方法（現金+オンライン）の有料イベント作成
 */

import { createEventAction } from "@features/events/actions/create-event";

import { deleteTestEvent } from "@/tests/helpers/test-event";
import { createTestUser, deleteTestUser, type TestUser } from "@/tests/helpers/test-user";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

describe("イベント作成統合テスト - 1.1 基本的なイベント作成", () => {
  let testUser: TestUser;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    // テスト用ユーザーを作成
    testUser = await createTestUser(
      `event-creation-test-${Date.now()}@example.com`,
      "TestPassword123"
    );
  });

  afterAll(async () => {
    // 作成したイベントをクリーンアップ
    for (const eventId of createdEventIds) {
      try {
        await deleteTestEvent(eventId);
      } catch (error) {
        console.warn(`Failed to cleanup event ${eventId}:`, error);
      }
    }

    // テストユーザーを削除
    await deleteTestUser(testUser.email);
  });

  beforeEach(() => {
    // 各テストでユーザーを認証済み状態にする
    process.env.TEST_USER_ID = testUser.id;
    process.env.TEST_USER_EMAIL = testUser.email;
  });

  afterEach(() => {
    // テスト環境の認証情報をクリア
    delete process.env.TEST_USER_ID;
    delete process.env.TEST_USER_EMAIL;
  });

  /**
   * テストヘルパー: FormDataを作成する
   */
  function createFormDataFromEvent(eventData: {
    title: string;
    date: string;
    fee: string;
    payment_methods?: string[];
    location?: string;
    description?: string;
    capacity?: string;
    registration_deadline?: string;
    payment_deadline?: string;
    allow_payment_after_deadline?: boolean;
    grace_period_days?: string;
  }): FormData {
    const formData = new FormData();

    formData.append("title", eventData.title);
    formData.append("date", eventData.date);
    formData.append("fee", eventData.fee);

    // 決済方法（配列から文字列に変換）
    if (eventData.payment_methods) {
      formData.append("payment_methods", eventData.payment_methods.join(","));
    } else {
      formData.append("payment_methods", "");
    }

    // オプショナルフィールド
    if (eventData.location) {
      formData.append("location", eventData.location);
    }
    if (eventData.description) {
      formData.append("description", eventData.description);
    }
    if (eventData.capacity) {
      formData.append("capacity", eventData.capacity);
    }
    if (eventData.registration_deadline) {
      formData.append("registration_deadline", eventData.registration_deadline);
    }
    if (eventData.payment_deadline) {
      formData.append("payment_deadline", eventData.payment_deadline);
    }
    if (eventData.allow_payment_after_deadline) {
      formData.append(
        "allow_payment_after_deadline",
        String(eventData.allow_payment_after_deadline)
      );
    }
    if (eventData.grace_period_days) {
      formData.append("grace_period_days", eventData.grace_period_days);
    }

    return formData;
  }

  /**
   * テストヘルパー: 将来の日時を生成する
   */
  function getFutureDateTime(hoursFromNow: number = 24): string {
    // テスト実行時間を考慮してより長い時間を設定
    const futureDate = new Date(Date.now() + (hoursFromNow + 1) * 60 * 60 * 1000);
    // datetime-localフォーマット（YYYY-MM-DDTHH:mm）
    return futureDate.toISOString().slice(0, 16);
  }

  /**
   * テストヘルパー: 作成されたイベントを検証する
   */
  function validateCreatedEvent(
    event: EventRow,
    expectedData: {
      title: string;
      fee: number;
      payment_methods: string[];
      location?: string | null;
      description?: string | null;
      capacity?: number | null;
    }
  ) {
    expect(event.title).toBe(expectedData.title);
    expect(event.fee).toBe(expectedData.fee);
    expect(event.payment_methods).toEqual(expectedData.payment_methods);
    expect(event.location).toBe(expectedData.location ?? null);
    expect(event.description).toBe(expectedData.description ?? null);
    expect(event.capacity).toBe(expectedData.capacity ?? null);
    expect(event.created_by).toBe(testUser.id);
    expect(event.invite_token).toBeDefined();
    expect(event.invite_token).not.toBeNull();
    if (event.invite_token) {
      expect(event.invite_token.length).toBeGreaterThan(0);
    }
    expect(event.id).toBeDefined();
    expect(event.created_at).toBeDefined();
    expect(event.updated_at).toBeDefined();
  }

  describe("1.1.1 最小限の必須項目のみでの無料イベント作成", () => {
    test("タイトル、開催日時、参加費0円、参加申込締切のみで無料イベントが作成される", async () => {
      const eventDate = getFutureDateTime(48); // 48時間後（確実に将来）
      const registrationDeadline = getFutureDateTime(24); // 24時間後（確実に将来）

      const formData = createFormDataFromEvent({
        title: "最小限無料イベント",
        date: eventDate,
        fee: "0",
        registration_deadline: registrationDeadline,
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        validateCreatedEvent(event, {
          title: "最小限無料イベント",
          fee: 0,
          payment_methods: [], // 無料イベントは決済方法が空配列
          location: null,
          description: null,
          capacity: null,
        });

        // 無料イベントの決済関連設定が適切にリセットされることを確認
        expect(event.payment_methods).toEqual([]);
        expect(event.payment_deadline).toBeNull();
        expect(event.allow_payment_after_deadline).toBe(false);
        expect(event.grace_period_days).toBe(0);

        // 日時が正しく変換されていることを確認
        expect(new Date(event.date)).toBeInstanceOf(Date);
        if (event.registration_deadline) {
          expect(new Date(event.registration_deadline)).toBeInstanceOf(Date);
        }
      }
    });

    test("無料イベントでも決済方法を指定した場合は空配列になる", async () => {
      const eventDate = getFutureDateTime(48);
      const registrationDeadline = getFutureDateTime(24);
      const paymentDeadline = getFutureDateTime(36); // オンライン決済を指定する場合は決済締切も必要

      const formData = createFormDataFromEvent({
        title: "決済方法指定無料イベント",
        date: eventDate,
        fee: "0", // 無料だが決済方法を指定
        payment_methods: ["stripe", "cash"], // バリデーション通過のため決済締切も指定
        registration_deadline: registrationDeadline,
        payment_deadline: paymentDeadline, // バリデーションエラーを回避
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        // 無料イベントの場合、決済関連の設定はすべてリセットされる
        expect(event.payment_methods).toEqual([]);
        expect(event.fee).toBe(0);
        expect(event.payment_deadline).toBeNull();
        expect(event.allow_payment_after_deadline).toBe(false);
        expect(event.grace_period_days).toBe(0);
      }
    });
  });

  describe("1.1.2 全項目入力での有料イベント作成", () => {
    test("全フィールドを含む有料イベントが正しく作成される", async () => {
      const eventDate = getFutureDateTime(48); // 48時間後
      const registrationDeadline = getFutureDateTime(24); // 24時間後
      const paymentDeadline = getFutureDateTime(36); // 36時間後

      const formData = createFormDataFromEvent({
        title: "全項目入力イベント",
        date: eventDate,
        fee: "5000",
        payment_methods: ["stripe", "cash"],
        location: "東京都渋谷区テストビル3F",
        description:
          "全項目を入力したテスト用イベントです。参加費は5000円で、現金とオンライン決済の両方を受け付けます。",
        capacity: "100",
        registration_deadline: registrationDeadline,
        payment_deadline: paymentDeadline,
        allow_payment_after_deadline: true,
        grace_period_days: "7",
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        validateCreatedEvent(event, {
          title: "全項目入力イベント",
          fee: 5000,
          payment_methods: ["stripe", "cash"],
          location: "東京都渋谷区テストビル3F",
          description:
            "全項目を入力したテスト用イベントです。参加費は5000円で、現金とオンライン決済の両方を受け付けます。",
          capacity: 100,
        });

        // 特殊項目の確認
        expect(event.allow_payment_after_deadline).toBe(true);
        expect(event.grace_period_days).toBe(7);

        // 日時項目の確認
        if (event.payment_deadline && event.registration_deadline) {
          expect(new Date(event.payment_deadline)).toBeInstanceOf(Date);
          expect(new Date(event.payment_deadline).getTime()).toBeGreaterThan(
            new Date(event.registration_deadline).getTime()
          );
        }
      }
    });
  });

  describe("1.1.3 現金決済のみの有料イベント作成", () => {
    test("現金決済のみの有料イベントが作成される", async () => {
      const eventDate = getFutureDateTime(48);
      const registrationDeadline = getFutureDateTime(24);

      const formData = createFormDataFromEvent({
        title: "現金決済のみイベント",
        date: eventDate,
        fee: "3000",
        payment_methods: ["cash"],
        location: "現金決済会場",
        description: "現金決済のみを受け付けるイベントです",
        registration_deadline: registrationDeadline,
        // 現金決済のみの場合、payment_deadlineは不要
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        validateCreatedEvent(event, {
          title: "現金決済のみイベント",
          fee: 3000,
          payment_methods: ["cash"],
          location: "現金決済会場",
          description: "現金決済のみを受け付けるイベントです",
        });

        // 現金決済のみの場合、決済締切は不要
        expect(event.payment_deadline).toBeNull();
      }
    });
  });

  describe("1.1.4 オンライン決済のみの有料イベント作成", () => {
    test("オンライン決済のみの有料イベントが作成される", async () => {
      const eventDate = getFutureDateTime(72); // 72時間後
      const registrationDeadline = getFutureDateTime(24); // 24時間後
      const paymentDeadline = getFutureDateTime(48); // 48時間後（オンライン決済では必須）

      const formData = createFormDataFromEvent({
        title: "オンライン決済のみイベント",
        date: eventDate,
        fee: "8000",
        payment_methods: ["stripe"],
        location: "オンライン決済会場",
        description: "Stripeによるオンライン決済のみを受け付けるイベントです",
        capacity: "50",
        registration_deadline: registrationDeadline,
        payment_deadline: paymentDeadline,
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        validateCreatedEvent(event, {
          title: "オンライン決済のみイベント",
          fee: 8000,
          payment_methods: ["stripe"],
          location: "オンライン決済会場",
          description: "Stripeによるオンライン決済のみを受け付けるイベントです",
          capacity: 50,
        });

        // オンライン決済の場合、決済締切が必要
        expect(event.payment_deadline).not.toBeNull();
        if (event.payment_deadline) {
          expect(new Date(event.payment_deadline)).toBeInstanceOf(Date);
        }
      }
    });
  });

  describe("1.1.5 複数決済方法（現金+オンライン）の有料イベント作成", () => {
    test("現金とオンライン決済の両方を受け付けるイベントが作成される", async () => {
      const eventDate = getFutureDateTime(96); // 96時間後（4日後）
      const registrationDeadline = getFutureDateTime(24); // 24時間後
      const paymentDeadline = getFutureDateTime(72); // 72時間後

      const formData = createFormDataFromEvent({
        title: "複数決済方法イベント",
        date: eventDate,
        fee: "12000",
        payment_methods: ["cash", "stripe"], // 両方を指定
        location: "複数決済対応会場",
        description:
          "現金決済とオンライン決済の両方に対応したイベントです。便利な決済方法をお選びください。",
        capacity: "200",
        registration_deadline: registrationDeadline,
        payment_deadline: paymentDeadline,
        allow_payment_after_deadline: true,
        grace_period_days: "14",
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        validateCreatedEvent(event, {
          title: "複数決済方法イベント",
          fee: 12000,
          payment_methods: ["cash", "stripe"], // 両方が保存される
          location: "複数決済対応会場",
          description:
            "現金決済とオンライン決済の両方に対応したイベントです。便利な決済方法をお選びください。",
          capacity: 200,
        });

        // 複数決済方法の場合、決済方法配列に両方が含まれる
        expect(event.payment_methods).toContain("cash");
        expect(event.payment_methods).toContain("stripe");
        expect(event.payment_methods.length).toBe(2);

        // オンライン決済を含む場合、決済締切が必要
        expect(event.payment_deadline).not.toBeNull();

        // 猶予期間設定の確認
        expect(event.allow_payment_after_deadline).toBe(true);
        expect(event.grace_period_days).toBe(14);
      }
    });

    test("重複した決済方法は自動的に重複除去される", async () => {
      const eventDate = getFutureDateTime(72);
      const registrationDeadline = getFutureDateTime(36);
      const paymentDeadline = getFutureDateTime(48);

      // FormDataで重複した決済方法を送信
      const formData = new FormData();
      formData.append("title", "重複決済方法テスト");
      formData.append("date", eventDate);
      formData.append("fee", "1000");
      formData.append("payment_methods", "stripe,cash,stripe,cash,stripe"); // 重複あり
      formData.append("registration_deadline", registrationDeadline);
      formData.append("payment_deadline", paymentDeadline);

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        // 重複が除去されて2つの方法のみが保存される
        expect(event.payment_methods).toContain("cash");
        expect(event.payment_methods).toContain("stripe");
        expect(event.payment_methods.length).toBe(2);
      }
    });
  });

  describe("データ変換・処理の確認", () => {
    test("日時のタイムゾーン変換が正しく行われる", async () => {
      const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
      const localDateTime = futureDate.toISOString().slice(0, 16); // 将来の時間
      const regDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const registrationDeadline = regDate.toISOString().slice(0, 16);

      const formData = createFormDataFromEvent({
        title: "タイムゾーンテスト",
        date: localDateTime,
        fee: "0",
        registration_deadline: registrationDeadline,
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        // UTC形式のISO文字列として保存される（+00:00またはZ形式）
        expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(\+00:00|Z)$/);
        if (event.registration_deadline) {
          expect(event.registration_deadline).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(\+00:00|Z)$/
          );
        }

        // 日時として解析可能
        expect(new Date(event.date)).toBeInstanceOf(Date);
        if (event.registration_deadline) {
          expect(new Date(event.registration_deadline)).toBeInstanceOf(Date);
        }
      }
    });

    test("FormDataの適切な抽出と型変換", async () => {
      const eventDate = getFutureDateTime(48);
      const registrationDeadline = getFutureDateTime(24);
      const paymentDeadline = getFutureDateTime(36); // 有料イベントなので決済締切が必要

      const formData = createFormDataFromEvent({
        title: "型変換テスト",
        date: eventDate,
        fee: "15000", // 文字列から数値に変換
        payment_methods: ["stripe"], // 有料イベントなので決済方法を指定
        capacity: "75", // 文字列から数値に変換
        grace_period_days: "5", // 文字列から数値に変換
        registration_deadline: registrationDeadline,
        payment_deadline: paymentDeadline, // オンライン決済のため必須
        allow_payment_after_deadline: true, // booleanの処理
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        // 文字列が適切に数値に変換される
        expect(typeof event.fee).toBe("number");
        expect(event.fee).toBe(15000);

        expect(typeof event.capacity).toBe("number");
        expect(event.capacity).toBe(75);

        expect(typeof event.grace_period_days).toBe("number");
        expect(event.grace_period_days).toBe(5);

        // booleanの処理
        expect(typeof event.allow_payment_after_deadline).toBe("boolean");
        expect(event.allow_payment_after_deadline).toBe(true);
      }
    });
  });

  describe("データベース保存の確認", () => {
    test("招待トークンが自動生成される", async () => {
      const eventDate = getFutureDateTime(48);
      const registrationDeadline = getFutureDateTime(24);

      const formData = createFormDataFromEvent({
        title: "招待トークンテスト",
        date: eventDate,
        fee: "0",
        registration_deadline: registrationDeadline,
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        // 招待トークンが生成される
        expect(event.invite_token).toBeDefined();
        expect(event.invite_token).not.toBeNull();
        expect(typeof event.invite_token).toBe("string");
        if (event.invite_token) {
          expect(event.invite_token.length).toBeGreaterThan(10); // 適切な長さ
          expect(event.invite_token).not.toContain(" "); // スペースを含まない
        }
      }
    });

    test("作成者IDと日時が正しく設定される", async () => {
      const eventDate = getFutureDateTime(48);
      const registrationDeadline = getFutureDateTime(24);

      const formData = createFormDataFromEvent({
        title: "作成者情報テスト",
        date: eventDate,
        fee: "0",
        registration_deadline: registrationDeadline,
      });

      const beforeCreate = new Date();
      const result = await createEventAction(formData);
      const afterCreate = new Date();

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data;
        createdEventIds.push(event.id);

        // 作成者IDが正しく設定される
        expect(event.created_by).toBe(testUser.id);

        // 作成日時・更新日時が適切に設定される
        expect(event.created_at).toBeDefined();
        expect(event.updated_at).toBeDefined();

        const createdAt = new Date(event.created_at);
        const updatedAt = new Date(event.updated_at);

        // 作成時刻が妥当な範囲内
        expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
        expect(createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());

        // 作成時は作成日時と更新日時が同じ
        expect(Math.abs(createdAt.getTime() - updatedAt.getTime())).toBeLessThan(1000);
      }
    });
  });

  describe("レスポンス形式の確認", () => {
    test("成功時の適切なServerActionResult構造", async () => {
      const eventDate = getFutureDateTime(48);
      const registrationDeadline = getFutureDateTime(24);
      const paymentDeadline = getFutureDateTime(36); // 正しい順序で設定

      const formData = createFormDataFromEvent({
        title: "レスポンス形式テスト",
        date: eventDate,
        fee: "2000",
        payment_methods: ["stripe"],
        payment_deadline: paymentDeadline, // registrationDeadline より後に設定
        registration_deadline: registrationDeadline,
      });

      const result = await createEventAction(formData);

      // ServerActionResultの構造確認
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result).toHaveProperty("data");
        expect(result.data).toBeDefined();
        expect(typeof result.data).toBe("object");

        const event = result.data;
        createdEventIds.push(event.id);

        // 必須フィールドの存在確認
        const requiredFields = [
          "id",
          "title",
          "date",
          "fee",
          "payment_methods",
          "created_by",
          "invite_token",
          "created_at",
          "updated_at",
        ];

        for (const field of requiredFields) {
          expect(event).toHaveProperty(field);
        }

        // データ型の確認
        expect(typeof event.id).toBe("string");
        expect(typeof event.title).toBe("string");
        expect(typeof event.date).toBe("string");
        expect(typeof event.fee).toBe("number");
        expect(Array.isArray(event.payment_methods)).toBe(true);
        expect(typeof event.created_by).toBe("string");
        expect(typeof event.invite_token).toBe("string");
        expect(typeof event.created_at).toBe("string");
        expect(typeof event.updated_at).toBe("string");
      }
    });
  });
});
