import {
  calculateAttendeeCount,
  calculateAttendanceSummary,
  calculateAttendanceRate,
} from "@/lib/utils/event-calculations";

describe("Event Calculations", () => {
  const mockAttendances = [
    { id: "1", status: "attending" as const },
    { id: "2", status: "attending" as const },
    { id: "3", status: "not_attending" as const },
    { id: "4", status: "maybe" as const },
    { id: "5", status: "attending" as const },
  ];

  describe("calculateAttendeeCount", () => {
    it("参加者数を正しく計算する", () => {
      const result = calculateAttendeeCount(mockAttendances);
      expect(result).toBe(3); // "attending" が3人
    });

    it("空の配列の場合、0を返す", () => {
      const result = calculateAttendeeCount([]);
      expect(result).toBe(0);
    });

    it("undefinedの場合、0を返す", () => {
      const result = calculateAttendeeCount(undefined);
      expect(result).toBe(0);
    });

    it("nullの場合、0を返す", () => {
      const result = calculateAttendeeCount(null as any);
      expect(result).toBe(0);
    });

    it("配列以外の場合、0を返す", () => {
      const result = calculateAttendeeCount("not an array" as any);
      expect(result).toBe(0);
    });
  });

  describe("calculateAttendanceSummary", () => {
    it("参加状況のサマリーを正しく計算する", () => {
      const result = calculateAttendanceSummary(mockAttendances);
      expect(result).toEqual({
        attending: 3,
        not_attending: 1,
        maybe: 1,
        total: 5,
      });
    });

    it("空の配列の場合、全て0を返す", () => {
      const result = calculateAttendanceSummary([]);
      expect(result).toEqual({
        attending: 0,
        not_attending: 0,
        maybe: 0,
        total: 0,
      });
    });

    it("undefinedの場合、全て0を返す", () => {
      const result = calculateAttendanceSummary(undefined);
      expect(result).toEqual({
        attending: 0,
        not_attending: 0,
        maybe: 0,
        total: 0,
      });
    });
  });

  describe("calculateAttendanceRate", () => {
    it("参加率を正しく計算する", () => {
      const result = calculateAttendanceRate(mockAttendances, 10);
      expect(result).toBe(0.3); // 3/10 = 0.3
    });

    it("定員が0の場合、0を返す", () => {
      const result = calculateAttendanceRate(mockAttendances, 0);
      expect(result).toBe(0);
    });

    it("定員がnullの場合、0を返す", () => {
      const result = calculateAttendanceRate(mockAttendances, null);
      expect(result).toBe(0);
    });

    it("参加者数が定員を超える場合、1を返す", () => {
      const result = calculateAttendanceRate(mockAttendances, 2);
      expect(result).toBe(1); // 3/2 = 1.5 -> 1にクリップ
    });

    it("参加者数が定員と同じ場合、1を返す", () => {
      const result = calculateAttendanceRate(mockAttendances, 3);
      expect(result).toBe(1); // 3/3 = 1
    });

    it("attendancesがundefinedの場合、0を返す", () => {
      const result = calculateAttendanceRate(undefined, 10);
      expect(result).toBe(0);
    });
  });
});
