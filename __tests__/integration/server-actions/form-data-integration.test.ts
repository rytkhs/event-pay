import {
  extractEventCreateFormData,
  extractEventUpdateFormData,
} from "@/lib/utils/form-data-extractors";

describe("Server Actions FormData統合テスト", () => {
  describe("extractEventCreateFormData統合テスト", () => {
    it("実際のFormDataでイベント作成データが正しく抽出される", () => {
      // 実際のFormDataを作成
      const formData = new FormData();
      formData.set("title", "新年会2024");
      formData.set("date", "2024-12-31T18:00");
      formData.set("fee", "3000");
      formData.set("payment_methods", "stripe,cash");
      formData.set("location", "東京都渋谷区");
      formData.set("description", "楽しい新年会です！");
      formData.set("capacity", "50");
      formData.set("registration_deadline", "2024-12-30T18:00");
      formData.set("payment_deadline", "2024-12-31T12:00");

      const result = extractEventCreateFormData(formData);

      expect(result).toEqual({
        title: "新年会2024",
        date: "2024-12-31T18:00",
        fee: "3000",
        payment_methods: "stripe,cash",
        location: "東京都渋谷区",
        description: "楽しい新年会です！",
        capacity: "50",
        registration_deadline: "2024-12-30T18:00",
        payment_deadline: "2024-12-31T12:00",
      });
    });

    it("空文字フィールドが適切にundefinedに変換される", () => {
      const formData = new FormData();
      formData.set("title", "テストイベント");
      formData.set("date", "2024-12-31T18:00");
      formData.set("fee", "1000");
      formData.set("payment_methods", "stripe");
      formData.set("location", ""); // 空文字
      formData.set("description", ""); // 空文字
      formData.set("capacity", "");
      formData.set("registration_deadline", "");
      formData.set("payment_deadline", "");

      const result = extractEventCreateFormData(formData);

      expect(result).toEqual({
        title: "テストイベント",
        date: "2024-12-31T18:00",
        fee: "1000",
        payment_methods: "stripe",
        location: undefined,
        description: undefined,
        capacity: undefined,
        registration_deadline: undefined,
        payment_deadline: undefined,
      });
    });
  });

  describe("extractEventUpdateFormData統合テスト", () => {
    it("実際のFormDataでイベント更新データが正しく抽出される", () => {
      const formData = new FormData();
      formData.set("title", "更新されたイベント");
      formData.append("payment_methods", "stripe");
      formData.append("payment_methods", "cash");
      formData.set("location", "大阪府大阪市");
      formData.set("fee", "2000");

      const result = extractEventUpdateFormData(formData);

      expect(result).toEqual({
        title: "更新されたイベント",
        payment_methods: ["stripe", "cash"],
        location: "大阪府大阪市",
        fee: "2000",
        date: undefined,
        description: undefined,
        capacity: undefined,
        registration_deadline: undefined,
        payment_deadline: undefined,
      });
    });

    it("部分的な更新データが正しく抽出される", () => {
      const formData = new FormData();
      formData.set("title", "部分更新テスト");
      formData.set("description", "新しい説明");
      // 他のフィールドは設定しない

      const result = extractEventUpdateFormData(formData);

      expect(result).toEqual({
        title: "部分更新テスト",
        description: "新しい説明",
        date: undefined,
        fee: undefined,
        payment_methods: undefined,
        location: undefined,
        capacity: undefined,
        registration_deadline: undefined,
        payment_deadline: undefined,
      });
    });
  });

  describe("型安全性の統合テスト", () => {
    it("nullが適切にundefinedに変換される", () => {
      const formData = new FormData();
      formData.set("title", "テスト");
      formData.set("date", "2024-12-31T18:00");
      formData.set("fee", "1000");
      formData.set("payment_methods", "stripe");
      // location, description, capacity等は設定しない（nullが返される）

      const result = extractEventCreateFormData(formData);

      // 必須フィールドは値が設定されている
      expect(result.title).toBe("テスト");
      expect(result.date).toBe("2024-12-31T18:00");
      expect(result.fee).toBe("1000");
      expect(result.payment_methods).toBe("stripe");

      // オプショナルフィールドはundefinedになる
      expect(result.location).toBeUndefined();
      expect(result.description).toBeUndefined();
      expect(result.capacity).toBeUndefined();
      expect(result.registration_deadline).toBeUndefined();
      expect(result.payment_deadline).toBeUndefined();
    });

    it("空文字列が適切にundefinedに変換される", () => {
      const formData = new FormData();
      formData.set("title", "テスト");
      formData.set("location", "");
      formData.set("description", "");

      const result = extractEventUpdateFormData(formData);

      expect(result.title).toBe("テスト");
      expect(result.location).toBeUndefined();
      expect(result.description).toBeUndefined();
    });
  });

  describe("実際のServer Actions使用パターン", () => {
    it("create-event.tsでの使用パターンをシミュレート", () => {
      // 実際のブラウザから送信されるFormDataをシミュレート
      const formData = new FormData();
      formData.set("title", "実際のイベント");
      formData.set("date", "2024-12-31T19:00");
      formData.set("fee", "5000");
      formData.set("payment_methods", "stripe");
      formData.set("location", "東京都新宿区");
      formData.set("description", "実際のイベントの説明");

      const extractedData = extractEventCreateFormData(formData);

      // Server Actionで期待される形式でデータが抽出される
      expect(typeof extractedData.title).toBe("string");
      expect(typeof extractedData.date).toBe("string");
      expect(typeof extractedData.fee).toBe("string");
      expect(typeof extractedData.payment_methods).toBe("string");
      expect(typeof extractedData.location).toBe("string");
      expect(typeof extractedData.description).toBe("string");

      // 必須フィールドは空文字列ではない
      expect(extractedData.title).not.toBe("");
      expect(extractedData.date).not.toBe("");
      expect(extractedData.fee).not.toBe("");
      expect(extractedData.payment_methods).not.toBe("");
    });

    it("update-event.tsでの使用パターンをシミュレート", () => {
      // 部分的な更新データをシミュレート
      const formData = new FormData();
      formData.set("title", "更新されたタイトル");
      formData.set("description", "更新された説明");
      formData.append("payment_methods", "stripe");
      formData.append("payment_methods", "cash");

      const extractedData = extractEventUpdateFormData(formData);

      // 更新されたフィールドのみが値を持つ
      expect(extractedData.title).toBe("更新されたタイトル");
      expect(extractedData.description).toBe("更新された説明");
      expect(extractedData.payment_methods).toEqual(["stripe", "cash"]);

      // 更新されていないフィールドはundefined
      expect(extractedData.date).toBeUndefined();
      expect(extractedData.fee).toBeUndefined();
      expect(extractedData.location).toBeUndefined();
    });
  });
});
