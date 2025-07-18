import {
  convertDatetimeLocalToUtc,
  formatUtcToJst,
  convertJstDateToUtcRange,
  getCurrentJstTime,
  getMinDatetimeLocal,
  isUtcDateFuture,
  JST_TIMEZONE,
  // Phase 1: 新しいユーティリティ関数
  formatUtcToDatetimeLocal,
  formatUtcToJapaneseDisplay,
  formatUtcToJstSafe,
  formatUtcToJstByType,
} from "@/lib/utils/timezone";

describe("timezone utility functions", () => {
  describe("convertDatetimeLocalToUtc", () => {
    it("should convert JST datetime-local string to UTC", () => {
      // JST 2025-01-01 10:00 → UTC 2025-01-01 01:00
      const jstString = "2025-01-01T10:00";
      const utcDate = convertDatetimeLocalToUtc(jstString);

      expect(utcDate.toISOString()).toBe("2025-01-01T01:00:00.000Z");
    });

    it("should handle JST midnight correctly", () => {
      // JST 2025-01-01 00:00 → UTC 2024-12-31 15:00
      const jstString = "2025-01-01T00:00";
      const utcDate = convertDatetimeLocalToUtc(jstString);

      expect(utcDate.toISOString()).toBe("2024-12-31T15:00:00.000Z");
    });

    it("should work consistently regardless of runtime timezone", () => {
      // 環境依存問題のテスト: parseISOの挙動がランタイムのタイムゾーンに依存しないことを確認
      const originalTZ = process.env.TZ;

      try {
        // UTC環境をシミュレート
        process.env.TZ = "UTC";
        const utcResult = convertDatetimeLocalToUtc("2025-01-01T10:00");

        // US/Pacific環境をシミュレート
        process.env.TZ = "US/Pacific";
        const pacificResult = convertDatetimeLocalToUtc("2025-01-01T10:00");

        // どちらの環境でも同じUTC時刻になることを期待
        expect(utcResult.toISOString()).toBe(pacificResult.toISOString());
        expect(utcResult.toISOString()).toBe("2025-01-01T01:00:00.000Z");
      } finally {
        // 元のタイムゾーンを復元
        if (originalTZ) {
          process.env.TZ = originalTZ;
        } else {
          delete process.env.TZ;
        }
      }
    });
  });

  describe("formatUtcToJst", () => {
    it("should format UTC date to JST display string", () => {
      const utcDate = new Date("2025-01-01T01:00:00.000Z");
      const formatted = formatUtcToJst(utcDate);

      expect(formatted).toBe("2025/01/01 10:00");
    });

    it("should accept ISO string input", () => {
      const utcString = "2025-01-01T01:00:00.000Z";
      const formatted = formatUtcToJst(utcString);

      expect(formatted).toBe("2025/01/01 10:00");
    });

    it("should support custom format", () => {
      const utcDate = new Date("2025-01-01T01:00:00.000Z");
      const formatted = formatUtcToJst(utcDate, "yyyy-MM-dd HH:mm:ss");

      expect(formatted).toBe("2025-01-01 10:00:00");
    });
  });

  describe("convertJstDateToUtcRange", () => {
    it("should convert JST date to UTC day range", () => {
      const jstDate = "2025-01-01";
      const { startOfDay, endOfDay } = convertJstDateToUtcRange(jstDate);

      // JST 2025-01-01 00:00:00 → UTC 2024-12-31 15:00:00
      expect(startOfDay.toISOString()).toBe("2024-12-31T15:00:00.000Z");

      // JST 2025-01-01 23:59:59.999 → UTC 2025-01-01 14:59:59.999
      expect(endOfDay.toISOString()).toBe("2025-01-01T14:59:59.999Z");
    });
  });

  describe("getCurrentJstTime", () => {
    it("should return current time in JST timezone", () => {
      const jstTime = getCurrentJstTime();
      const now = new Date();

      // JST time should be within reasonable range of system time
      const timeDiff = Math.abs(jstTime.getTime() - now.getTime());
      expect(timeDiff).toBeLessThan(60000); // within 1 minute
    });
  });

  describe("getMinDatetimeLocal", () => {
    it("should return datetime-local format string", () => {
      const minDateTime = getMinDatetimeLocal();

      // Should match YYYY-MM-DDTHH:mm format
      expect(minDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it("should be in the future", () => {
      const minDateTime = getMinDatetimeLocal();
      const minDate = new Date(minDateTime + ":00"); // Add seconds for valid Date
      const now = new Date();

      expect(minDate.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe("isUtcDateFuture", () => {
    it("should return true for future UTC dates", () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute from now
      expect(isUtcDateFuture(futureDate)).toBe(true);
    });

    it("should return false for past UTC dates", () => {
      const pastDate = new Date(Date.now() - 60000); // 1 minute ago
      expect(isUtcDateFuture(pastDate)).toBe(false);
    });

    it("should accept ISO string input", () => {
      const futureString = new Date(Date.now() + 60000).toISOString();
      expect(isUtcDateFuture(futureString)).toBe(true);
    });
  });

  describe("timezone constants", () => {
    it("should export correct JST timezone identifier", () => {
      expect(JST_TIMEZONE).toBe("Asia/Tokyo");
    });
  });

  // Phase 1: 新しいユーティリティ関数のテスト
  describe("formatUtcToDatetimeLocal", () => {
    it("should format UTC date to datetime-local format", () => {
      const utcDate = "2025-01-01T01:00:00.000Z";
      const result = formatUtcToDatetimeLocal(utcDate);
      expect(result).toBe("2025-01-01T10:00");
    });

    it("should handle empty string", () => {
      expect(formatUtcToDatetimeLocal("")).toBe("");
    });

    it("should handle invalid date", () => {
      expect(formatUtcToDatetimeLocal("invalid-date")).toBe("");
    });

    it("should handle null/undefined input safely", () => {
      // @ts-expect-error Testing null input safety
      expect(formatUtcToDatetimeLocal(null)).toBe("");
      // @ts-expect-error Testing undefined input safety
      expect(formatUtcToDatetimeLocal(undefined)).toBe("");
    });

    it("should handle edge cases like NaN date", () => {
      expect(formatUtcToDatetimeLocal("2025-13-01T01:00:00.000Z")).toBe(""); // 13月は無効
    });
  });

  describe("formatUtcToJapaneseDisplay", () => {
    it("should format UTC date to Japanese display format", () => {
      const utcDate = "2025-01-01T01:00:00.000Z";
      const result = formatUtcToJapaneseDisplay(utcDate);
      expect(result).toBe("2025年01月01日 10:00");
    });

    it("should handle empty string", () => {
      expect(formatUtcToJapaneseDisplay("")).toBe("");
    });

    it("should handle invalid date", () => {
      expect(formatUtcToJapaneseDisplay("invalid-date")).toBe("");
    });

    it("should handle null/undefined input safely", () => {
      // @ts-expect-error Testing null input safety
      expect(formatUtcToJapaneseDisplay(null)).toBe("");
      // @ts-expect-error Testing undefined input safety
      expect(formatUtcToJapaneseDisplay(undefined)).toBe("");
    });
  });

  describe("formatUtcToJstSafe", () => {
    it("should format UTC date with default format", () => {
      const utcDate = "2025-01-01T01:00:00.000Z";
      const result = formatUtcToJstSafe(utcDate);
      expect(result).toBe("2025/01/01 10:00");
    });

    it("should format UTC date with custom format", () => {
      const utcDate = "2025-01-01T01:00:00.000Z";
      const result = formatUtcToJstSafe(utcDate, "yyyy-MM-dd HH:mm:ss");
      expect(result).toBe("2025-01-01 10:00:00");
    });

    it("should handle empty string", () => {
      expect(formatUtcToJstSafe("")).toBe("");
    });

    it("should handle invalid date", () => {
      expect(formatUtcToJstSafe("invalid-date")).toBe("");
    });
  });

  describe("formatUtcToJstByType", () => {
    const utcDate = "2025-01-01T01:00:00.000Z";

    it("should format with datetime-local type", () => {
      const result = formatUtcToJstByType(utcDate, "datetime-local");
      expect(result).toBe("2025-01-01T10:00");
    });

    it("should format with japanese type", () => {
      const result = formatUtcToJstByType(utcDate, "japanese");
      expect(result).toBe("2025年01月01日 10:00");
    });

    it("should format with standard type", () => {
      const result = formatUtcToJstByType(utcDate, "standard");
      expect(result).toBe("2025/01/01 10:00");
    });

    it("should format with iso type", () => {
      const result = formatUtcToJstByType(utcDate, "iso");
      expect(result).toBe("2025-01-01 10:00:00");
    });

    it("should format with time-only type", () => {
      const result = formatUtcToJstByType(utcDate, "time-only");
      expect(result).toBe("10:00");
    });

    it("should handle empty string", () => {
      expect(formatUtcToJstByType("", "japanese")).toBe("");
    });

    it("should handle invalid date", () => {
      expect(formatUtcToJstByType("invalid-date", "japanese")).toBe("");
    });
  });
});
