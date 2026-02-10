/**
 * Event Creation Data Conversion: サニタイズ処理が適用されるテスト
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";

import { createEventAction } from "@/app/(app)/events/create/actions";

import {
  setupEventCreationDataConversionTest,
  setupBeforeEach,
  cleanupAfterEach,
  cleanupAfterAll,
  createFormDataFromFields,
  getFutureDateTime,
  type EventCreationDataConversionTestContext,
} from "./event-creation-data-conversion-test-setup";

describe("1.2.4 サニタイズ処理が適用される", () => {
  let context: EventCreationDataConversionTestContext;

  beforeAll(async () => {
    context = await setupEventCreationDataConversionTest();
  });

  afterAll(async () => {
    await cleanupAfterAll(context);
  });

  beforeEach(() => {
    setupBeforeEach(context);
  });

  afterEach(() => {
    cleanupAfterEach(context);
  });

  describe("タイトル、場所、説明のXSS対策", () => {
    test("タイトルのHTMLタグが除去される", async () => {
      const maliciousTitle =
        '<script>alert("XSS")</script>テストイベント<img src="x" onerror="alert(1)">';
      const expectedTitle = "テストイベント"; // HTMLタグが除去される

      const formData = createFormDataFromFields({
        title: maliciousTitle,
        date: getFutureDateTime(72),
        fee: "0",
        registration_deadline: getFutureDateTime(24),
        payment_methods: "",
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data!;
        context.createdEventIds.push(event.id);

        expect(event.title).toBe(expectedTitle);
        expect(event.title).not.toContain("<script>");
        expect(event.title).not.toContain("<img");
        expect(event.title).not.toContain("onerror");
        expect(event.title).not.toContain("alert");
      }
    });

    test("場所のHTMLタグが除去される", async () => {
      const maliciousLocation =
        '東京都<script>alert("location")</script>渋谷区<iframe src="evil.com"></iframe>';
      const expectedLocation = "東京都渋谷区"; // HTMLタグが除去される

      const formData = createFormDataFromFields({
        title: "場所サニタイズテスト",
        date: getFutureDateTime(72),
        fee: "0",
        location: maliciousLocation,
        registration_deadline: getFutureDateTime(24),
        payment_methods: "",
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data!;
        context.createdEventIds.push(event.id);

        expect(event.location).toBe(expectedLocation);
        expect(event.location).not.toContain("<script>");
        expect(event.location).not.toContain("<iframe>");
        expect(event.location).not.toContain('src="evil.com"');
        expect(event.location).not.toContain("alert");
      }
    });

    test("説明のHTMLタグが除去される（改行は保持）", async () => {
      const maliciousDescription = `テストイベントの説明です。
<script>alert("desc")</script>
改行は保持されます。
<img src="x" onerror="alert('xss')">
<a href="javascript:alert('link')">悪意のあるリンク</a>
最後の行です。`;

      const expectedDescription = `テストイベントの説明です。

改行は保持されます。

悪意のあるリンク
最後の行です。`; // HTMLタグは除去、改行とテキストは保持

      const formData = createFormDataFromFields({
        title: "説明サニタイズテスト",
        date: getFutureDateTime(72),
        fee: "0",
        description: maliciousDescription,
        registration_deadline: getFutureDateTime(24),
        payment_methods: "",
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data!;
        context.createdEventIds.push(event.id);

        expect(event.description).toBe(expectedDescription);
        expect(event.description).not.toContain("<script>");
        expect(event.description).not.toContain("<img");
        expect(event.description).not.toContain("<a");
        expect(event.description).not.toContain("onerror");
        expect(event.description).not.toContain("javascript:");
        expect(event.description).not.toContain("alert");

        // 改行は保持される
        expect(event.description).toContain("\n");
      }
    });

    test("複数のフィールドが同時にサニタイズされる", async () => {
      const maliciousData = {
        title: '<script>alert("title")</script>複数フィールドテスト',
        location: '東京都<img src="x" onerror="alert(2)">渋谷区',
        description: `説明文です。
<script>document.cookie="stolen"</script>
<style>body{display:none}</style>
危険なコンテンツを含みます。`,
      };

      const expectedData = {
        title: "複数フィールドテスト",
        location: "東京都渋谷区",
        description: `説明文です。


危険なコンテンツを含みます。`,
      };

      const formData = createFormDataFromFields({
        title: maliciousData.title,
        date: getFutureDateTime(72),
        fee: "0",
        location: maliciousData.location,
        description: maliciousData.description,
        registration_deadline: getFutureDateTime(24),
        payment_methods: "",
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data!;
        context.createdEventIds.push(event.id);

        // 全フィールドが適切にサニタイズされる
        expect(event.title).toBe(expectedData.title);
        expect(event.location).toBe(expectedData.location);
        expect(event.description).toBe(expectedData.description);

        // 危険なタグが全て除去されている
        const dangerousTags = [
          "<script>",
          "<img",
          "<style>",
          "onerror",
          "document.cookie",
          "alert",
        ];
        dangerousTags.forEach((tag) => {
          expect(event.title).not.toContain(tag);
          expect(event.location).not.toContain(tag);
          expect(event.description).not.toContain(tag);
        });
      }
    });

    test("通常のテキストはサニタイズの影響を受けない", async () => {
      const normalData = {
        title: "通常のイベントタイトル 123 ★",
        location: "東京都渋谷区神宮前1-1-1 (テストビル3F)",
        description: `これは通常のイベント説明です。
日本語、English、数字123、記号!@#$%^&*()が含まれます。
URL: https://example.com
メール: test@example.com
改行も含まれています。`,
      };

      // sanitize-htmlはデフォルトで特殊文字をHTMLエンティティに変換する
      const expectedDescription = normalData.description.replace("&", "&amp;");

      const formData = createFormDataFromFields({
        title: normalData.title,
        date: getFutureDateTime(72),
        fee: "0",
        location: normalData.location,
        description: normalData.description,
        registration_deadline: getFutureDateTime(24),
        payment_methods: "",
      });

      const result = await createEventAction(formData);

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.data!;
        context.createdEventIds.push(event.id);

        // 通常のテキストは変更されない（特殊文字のエンティティ化は除く）
        expect(event.title).toBe(normalData.title);
        expect(event.location).toBe(normalData.location);
        expect(event.description).toBe(expectedDescription);
      }
    });
  });
});
