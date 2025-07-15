import { convertDatetimeLocalToUtc, formatUtcToJst, getCurrentJstTime } from "@/lib/utils/timezone";

describe("timezone utilities", () => {
  describe("convertDatetimeLocalToUtc", () => {
    it("datetime-local形式の文字列をUTCに変換する", () => {
      const result = convertDatetimeLocalToUtc("2025-12-31T23:59");
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe("2025-12-31T14:59:00.000Z"); // JST -9時間
    });

    it("秒が含まれている場合も正しく変換する", () => {
      const result = convertDatetimeLocalToUtc("2025-12-31T23:59:30");
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe("2025-12-31T14:59:30.000Z"); // JST -9時間
    });

    it("午前0時の場合も正しく変換する", () => {
      const result = convertDatetimeLocalToUtc("2025-01-01T00:00");
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe("2024-12-31T15:00:00.000Z"); // JST -9時間
    });
  });

  describe("formatUtcToJst", () => {
    it("UTC日時をJSTに変換してフォーマットする", () => {
      const utcDate = new Date("2025-12-31T14:59:00.000Z");
      const result = formatUtcToJst(utcDate);
      expect(result).toBe("2025/12/31 23:59");
    });

    it("カスタムフォーマットを使用できる", () => {
      const utcDate = new Date("2025-12-31T14:59:00.000Z");
      const result = formatUtcToJst(utcDate, "yyyy-MM-dd HH:mm:ss");
      expect(result).toBe("2025-12-31 23:59:00");
    });

    it("文字列形式のUTC日時も処理できる", () => {
      const result = formatUtcToJst("2025-12-31T14:59:00.000Z");
      expect(result).toBe("2025/12/31 23:59");
    });
  });

  describe("getCurrentJstTime", () => {
    it("現在のJST時刻を取得する", () => {
      const result = getCurrentJstTime();
      expect(result).toBeInstanceOf(Date);

      // JST時刻が現在時刻の範囲内であることを確認
      const now = new Date();
      const timeDiff = Math.abs(result.getTime() - now.getTime());
      expect(timeDiff).toBeLessThan(1000); // 1秒以内の差
    });
  });
});
