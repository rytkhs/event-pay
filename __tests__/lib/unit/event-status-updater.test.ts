// シンプルな単体テスト - 外部依存なし
import "@testing-library/jest-dom";
import { shouldUpdateEventStatus, updateEventStatus } from "@/lib/event-status-updater";
import { EVENT_STATUS } from "@/types/enums";
import { EVENT_CONFIG } from "@/lib/constants/event-config";

describe("Event Status Updater - Unit Tests", () => {
  describe("shouldUpdateEventStatus", () => {
    const mockCurrentTime = new Date("2024-01-15T10:00:00Z");

    beforeEach(() => {
      // 現在時刻をモック
      jest.useFakeTimers();
      jest.setSystemTime(mockCurrentTime);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should update upcoming event to ongoing when current time passes event date", () => {
      const event = {
        id: "event-1",
        status: "upcoming" as const,
        date: new Date("2024-01-15T09:00:00Z"), // 1時間前に開始
      };

      const result = shouldUpdateEventStatus(event, mockCurrentTime);

      expect(result).toEqual({
        shouldUpdate: true,
        newStatus: EVENT_STATUS.ONGOING,
        reason: "Event has started",
      });
    });

    it("should update ongoing event to past when 24 hours have passed", () => {
      const event = {
        id: "event-2",
        status: "ongoing" as const,
        date: new Date("2024-01-14T09:00:00Z"), // 25時間前に開始
      };

      const result = shouldUpdateEventStatus(event, mockCurrentTime);

      expect(result).toEqual({
        shouldUpdate: true,
        newStatus: EVENT_STATUS.PAST,
        reason: `Event ended (${EVENT_CONFIG.AUTO_END_HOURS} hours passed)`,
      });
    });

    it("should not update upcoming event when event date is in future", () => {
      const event = {
        id: "event-3",
        status: "upcoming" as const,
        date: new Date("2024-01-15T11:00:00Z"), // 1時間後に開始
      };

      const result = shouldUpdateEventStatus(event, mockCurrentTime);

      expect(result).toEqual({
        shouldUpdate: false,
        newStatus: EVENT_STATUS.UPCOMING,
        reason: "Event has not started yet",
      });
    });

    it("should not update ongoing event when less than 24 hours have passed", () => {
      const event = {
        id: "event-4",
        status: "ongoing" as const,
        date: new Date("2024-01-15T08:00:00Z"), // 2時間前に開始
      };

      const result = shouldUpdateEventStatus(event, mockCurrentTime);

      expect(result).toEqual({
        shouldUpdate: false,
        newStatus: EVENT_STATUS.ONGOING,
        reason: `Event is still ongoing (less than ${EVENT_CONFIG.AUTO_END_HOURS} hours)`,
      });
    });

    it("should not update cancelled event", () => {
      const event = {
        id: "event-5",
        status: "cancelled" as const,
        date: new Date("2024-01-15T09:00:00Z"),
      };

      const result = shouldUpdateEventStatus(event, mockCurrentTime);

      expect(result).toEqual({
        shouldUpdate: false,
        newStatus: EVENT_STATUS.CANCELLED,
        reason: "Cancelled events are not updated",
      });
    });

    it("should not update past event", () => {
      const event = {
        id: "event-6",
        status: "past" as const,
        date: new Date("2024-01-14T09:00:00Z"),
      };

      const result = shouldUpdateEventStatus(event, mockCurrentTime);

      expect(result).toEqual({
        shouldUpdate: false,
        newStatus: EVENT_STATUS.PAST,
        reason: "Event is already in final state",
      });
    });
  });

  describe("updateEventStatus", () => {
    it("should return correct batch update data for multiple events", () => {
      const events = [
        {
          id: "event-1",
          status: "upcoming" as const,
          date: new Date("2024-01-15T09:00:00Z"),
        },
        {
          id: "event-2",
          status: "ongoing" as const,
          date: new Date("2024-01-14T09:00:00Z"),
        },
        {
          id: "event-3",
          status: "upcoming" as const,
          date: new Date("2024-01-15T11:00:00Z"),
        },
      ];

      const mockCurrentTime = new Date("2024-01-15T10:00:00Z");
      const result = updateEventStatus(events, mockCurrentTime);

      expect(result).toEqual({
        updatesCount: 2,
        updates: [
          {
            id: "event-1",
            oldStatus: EVENT_STATUS.UPCOMING,
            newStatus: EVENT_STATUS.ONGOING,
            reason: "Event has started",
          },
          {
            id: "event-2",
            oldStatus: EVENT_STATUS.ONGOING,
            newStatus: EVENT_STATUS.PAST,
            reason: `Event ended (${EVENT_CONFIG.AUTO_END_HOURS} hours passed)`,
          },
        ],
        skipped: [
          {
            id: "event-3",
            status: EVENT_STATUS.UPCOMING,
            reason: "Event has not started yet",
          },
        ],
      });
    });

    it("should return empty updates when no events need updating", () => {
      const events = [
        {
          id: "event-1",
          status: "upcoming" as const,
          date: new Date("2024-01-15T11:00:00Z"),
        },
        {
          id: "event-2",
          status: "cancelled" as const,
          date: new Date("2024-01-15T09:00:00Z"),
        },
      ];

      const mockCurrentTime = new Date("2024-01-15T10:00:00Z");
      const result = updateEventStatus(events, mockCurrentTime);

      expect(result).toEqual({
        updatesCount: 0,
        updates: [],
        skipped: [
          {
            id: "event-1",
            status: EVENT_STATUS.UPCOMING,
            reason: "Event has not started yet",
          },
          {
            id: "event-2",
            status: EVENT_STATUS.CANCELLED,
            reason: "Cancelled events are not updated",
          },
        ],
      });
    });
  });
});
