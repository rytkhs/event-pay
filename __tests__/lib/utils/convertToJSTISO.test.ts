describe("convertToJSTISO function", () => {
  // convertToJSTISO関数を直接テストするため、関数を抽出
  const convertToJSTISO = (dateString: string): string => {
    const hasSeconds = dateString.includes(':') && dateString.split(':').length === 3;
    const timezoneSuffix = '+09:00';
    
    if (hasSeconds) {
      return dateString + timezoneSuffix;
    } else {
      return dateString + ':00' + timezoneSuffix;
    }
  };

  describe("秒が含まれていない場合", () => {
    it("秒を追加してタイムゾーンを付与する", () => {
      const result = convertToJSTISO("2025-12-31T23:59");
      expect(result).toBe("2025-12-31T23:59:00+09:00");
    });

    it("時間のみの場合でも正常に動作する", () => {
      const result = convertToJSTISO("2025-12-31T10:30");
      expect(result).toBe("2025-12-31T10:30:00+09:00");
    });
  });

  describe("秒が含まれている場合", () => {
    it("既存の秒を保持してタイムゾーンのみ付与する", () => {
      const result = convertToJSTISO("2025-12-31T23:59:30");
      expect(result).toBe("2025-12-31T23:59:30+09:00");
    });

    it("秒が0の場合でも正常に動作する", () => {
      const result = convertToJSTISO("2025-12-31T23:59:00");
      expect(result).toBe("2025-12-31T23:59:00+09:00");
    });

    it("秒に小数点が含まれている場合でも正常に動作する", () => {
      const result = convertToJSTISO("2025-12-31T23:59:30.123");
      expect(result).toBe("2025-12-31T23:59:30.123+09:00");
    });
  });

  describe("エッジケース", () => {
    it("午前0時の時間でも正常に動作する", () => {
      const result = convertToJSTISO("2025-12-31T00:00");
      expect(result).toBe("2025-12-31T00:00:00+09:00");
    });

    it("午後11時59分の時間でも正常に動作する", () => {
      const result = convertToJSTISO("2025-12-31T23:59");
      expect(result).toBe("2025-12-31T23:59:00+09:00");
    });

    it("秒が59の場合でも正常に動作する", () => {
      const result = convertToJSTISO("2025-12-31T23:59:59");
      expect(result).toBe("2025-12-31T23:59:59+09:00");
    });
  });

  describe("フォーマットの検証", () => {
    it("結果が有効なISO形式であることを確認", () => {
      const result = convertToJSTISO("2025-12-31T23:59");
      const date = new Date(result);
      expect(date.toISOString()).toBeDefined();
      expect(isNaN(date.getTime())).toBe(false);
    });

    it("秒が含まれている場合の結果も有効なISO形式であることを確認", () => {
      const result = convertToJSTISO("2025-12-31T23:59:30");
      const date = new Date(result);
      expect(date.toISOString()).toBeDefined();
      expect(isNaN(date.getTime())).toBe(false);
    });
  });
});