import {
  extractOptionalValue,
  extractRequiredValue,
  extractArrayValues,
  extractNumberValue,
  extractBooleanValue,
  createFormDataExtractor,
  extractEventCreateFormData,
  extractEventUpdateFormData,
} from "@/lib/utils/form-data-extractors";

describe("FormData抽出ユーティリティ", () => {
  let formData: FormData;

  beforeEach(() => {
    formData = new FormData();
  });

  describe("extractOptionalValue", () => {
    it("値が存在する場合は値を返す", () => {
      formData.set("test", "value");
      expect(extractOptionalValue(formData, "test")).toBe("value");
    });

    it("値がnullの場合はundefinedを返す", () => {
      expect(extractOptionalValue(formData, "nonexistent")).toBeUndefined();
    });

    it("値が空文字の場合はundefinedを返す", () => {
      formData.set("test", "");
      expect(extractOptionalValue(formData, "test")).toBeUndefined();
    });

    it("値が空白のみの場合は値を返す", () => {
      formData.set("test", "   ");
      expect(extractOptionalValue(formData, "test")).toBe("   ");
    });
  });

  describe("extractRequiredValue", () => {
    it("値が存在する場合は値を返す", () => {
      formData.set("test", "value");
      expect(extractRequiredValue(formData, "test")).toBe("value");
    });

    it("値がnullの場合は空文字を返す", () => {
      expect(extractRequiredValue(formData, "nonexistent")).toBe("");
    });

    it("値が空文字の場合は空文字を返す", () => {
      formData.set("test", "");
      expect(extractRequiredValue(formData, "test")).toBe("");
    });
  });

  describe("extractArrayValues", () => {
    it("複数の値が存在する場合は配列を返す", () => {
      formData.append("test", "value1");
      formData.append("test", "value2");
      expect(extractArrayValues(formData, "test")).toEqual(["value1", "value2"]);
    });

    it("値が存在しない場合はundefinedを返す", () => {
      expect(extractArrayValues(formData, "nonexistent")).toBeUndefined();
    });

    it("空文字は除外される", () => {
      formData.append("test", "value1");
      formData.append("test", "");
      formData.append("test", "value2");
      expect(extractArrayValues(formData, "test")).toEqual(["value1", "value2"]);
    });

    it("全て空文字の場合はundefinedを返す", () => {
      formData.append("test", "");
      formData.append("test", "");
      expect(extractArrayValues(formData, "test")).toBeUndefined();
    });
  });

  describe("extractNumberValue", () => {
    it("有効な数値の場合は数値を返す", () => {
      formData.set("test", "123");
      expect(extractNumberValue(formData, "test")).toBe(123);
    });

    it("小数点数の場合は数値を返す", () => {
      formData.set("test", "123.45");
      expect(extractNumberValue(formData, "test")).toBe(123.45);
    });

    it("無効な数値の場合はundefinedを返す", () => {
      formData.set("test", "invalid");
      expect(extractNumberValue(formData, "test")).toBeUndefined();
    });

    it("値が存在しない場合はundefinedを返す", () => {
      expect(extractNumberValue(formData, "nonexistent")).toBeUndefined();
    });
  });

  describe("extractBooleanValue", () => {
    it("'true'の場合はtrueを返す", () => {
      formData.set("test", "true");
      expect(extractBooleanValue(formData, "test")).toBe(true);
    });

    it("'on'の場合はtrueを返す", () => {
      formData.set("test", "on");
      expect(extractBooleanValue(formData, "test")).toBe(true);
    });

    it("その他の値の場合はfalseを返す", () => {
      formData.set("test", "false");
      expect(extractBooleanValue(formData, "test")).toBe(false);
    });

    it("値が存在しない場合はfalseを返す", () => {
      expect(extractBooleanValue(formData, "nonexistent")).toBe(false);
    });
  });

  describe("createFormDataExtractor", () => {
    it("FormDataExtractorオブジェクトを返す", () => {
      const extractor = createFormDataExtractor(formData);

      expect(typeof extractor.extractOptionalValue).toBe("function");
      expect(typeof extractor.extractRequiredValue).toBe("function");
      expect(typeof extractor.extractArrayValues).toBe("function");
      expect(typeof extractor.extractNumberValue).toBe("function");
      expect(typeof extractor.extractBooleanValue).toBe("function");
    });

    it("各メソッドが正しく動作する", () => {
      formData.set("test", "value");
      const extractor = createFormDataExtractor(formData);

      expect(extractor.extractOptionalValue("test")).toBe("value");
      expect(extractor.extractRequiredValue("test")).toBe("value");
    });
  });

  describe("extractEventCreateFormData", () => {
    beforeEach(() => {
      formData.set("title", "テストイベント");
      formData.set("date", "2024-12-31T23:59");
      formData.set("fee", "1000");
      formData.set("payment_methods", "stripe");
      formData.set("location", "東京");
      formData.set("description", "テストの説明");
      formData.set("capacity", "50");
      formData.set("registration_deadline", "2024-12-30T23:59");
      formData.set("payment_deadline", "2024-12-31T12:00");
    });

    it("必須フィールドが正しく抽出される", () => {
      const result = extractEventCreateFormData(formData);

      expect(result.title).toBe("テストイベント");
      expect(result.date).toBe("2024-12-31T23:59");
      expect(result.fee).toBe("1000");
      expect(result.payment_methods).toBe("stripe");
    });

    it("オプショナルフィールドが正しく抽出される", () => {
      const result = extractEventCreateFormData(formData);

      expect(result.location).toBe("東京");
      expect(result.description).toBe("テストの説明");
      expect(result.capacity).toBe("50");
      expect(result.registration_deadline).toBe("2024-12-30T23:59");
      expect(result.payment_deadline).toBe("2024-12-31T12:00");
    });

    it("オプショナルフィールドが空の場合はundefinedになる", () => {
      formData.set("location", "");
      formData.set("description", "");

      const result = extractEventCreateFormData(formData);

      expect(result.location).toBeUndefined();
      expect(result.description).toBeUndefined();
    });
  });

  describe("extractEventUpdateFormData", () => {
    beforeEach(() => {
      formData.set("title", "更新されたイベント");
      formData.append("payment_methods", "stripe");
      formData.append("payment_methods", "cash");
      formData.set("location", "大阪");
    });

    it("値が存在するフィールドが正しく抽出される", () => {
      const result = extractEventUpdateFormData(formData);

      expect(result.title).toBe("更新されたイベント");
      expect(result.payment_methods).toEqual(["stripe", "cash"]);
      expect(result.location).toBe("大阪");
    });

    it("値が存在しないフィールドはundefinedになる", () => {
      const result = extractEventUpdateFormData(formData);

      expect(result.date).toBeUndefined();
      expect(result.fee).toBeUndefined();
      expect(result.description).toBeUndefined();
    });

    it("空文字のフィールドはundefinedになる", () => {
      formData.set("description", "");

      const result = extractEventUpdateFormData(formData);

      expect(result.description).toBeUndefined();
    });
  });
});

describe("型安全性テスト", () => {
  it("nullが通らないことを確認", () => {
    const formData = new FormData();

    // FormData.get()がnullを返す場合のテスト
    jest.spyOn(formData, "get").mockReturnValue(null);

    expect(extractOptionalValue(formData, "test")).toBeUndefined();
    expect(extractRequiredValue(formData, "test")).toBe("");

    formData.get.mockRestore();
  });

  it("型キャストが安全に行われることを確認", () => {
    const formData = new FormData();
    formData.set("test", "value");

    // 型安全な抽出が行われることを確認
    const optional = extractOptionalValue(formData, "test");
    const required = extractRequiredValue(formData, "test");

    expect(typeof optional).toBe("string");
    expect(typeof required).toBe("string");
  });
});
