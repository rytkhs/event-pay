import { renderHook, act } from "@testing-library/react";
import { useEventFilter } from "@/lib/hooks/useEventFilter";
import { Event } from "@/types/event";

const mockEvents: Event[] = [
  {
    id: "event-1",
    title: "有料イベント（開催予定）",
    date: "2024-06-01T10:00:00Z",
    location: "東京会議室",
    fee: 1000,
    capacity: 20,
    status: "upcoming",
    creator_name: "テスト太郎",
    attendances_count: 5,
  },
  {
    id: "event-2",
    title: "無料イベント（終了済み）",
    date: "2024-01-01T10:00:00Z",
    location: "大阪会議室",
    fee: 0,
    capacity: 10,
    status: "past",
    creator_name: "テスト花子",
    attendances_count: 8,
  },
  {
    id: "event-3",
    title: "キャンセルイベント",
    date: "2024-03-01T10:00:00Z",
    location: "名古屋会議室",
    fee: 2000,
    capacity: 15,
    status: "cancelled",
    creator_name: "テスト次郎",
    attendances_count: 3,
  },
  {
    id: "event-4",
    title: "開催中イベント",
    date: "2024-04-15T10:00:00Z",
    location: "福岡会議室",
    fee: 1500,
    capacity: 25,
    status: "ongoing",
    creator_name: "テスト三郎",
    attendances_count: 12,
  },
];

describe("useEventFilter Hook", () => {
  test("フックが初期状態を正しく返す", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: mockEvents, enableClientSideFiltering: true })
    );

    expect(result.current.filteredEvents).toHaveLength(4);
    expect(result.current.filters.status).toBe("all");
    expect(result.current.filters.payment).toBe("all");
    expect(result.current.filters.dateRange).toEqual({});
  });

  test("ステータスフィルターが正しく適用される", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: mockEvents, enableClientSideFiltering: true })
    );

    act(() => {
      result.current.setStatusFilter("upcoming");
    });

    expect(result.current.filteredEvents).toHaveLength(1);
    expect(result.current.filteredEvents[0].title).toBe("有料イベント（開催予定）");
    expect(result.current.filters.status).toBe("upcoming");
  });

  test("ongoingステータスフィルターが正しく適用される", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: mockEvents, enableClientSideFiltering: true })
    );

    act(() => {
      result.current.setStatusFilter("ongoing");
    });

    expect(result.current.filteredEvents).toHaveLength(1);
    expect(result.current.filteredEvents[0].title).toBe("開催中イベント");
    expect(result.current.filters.status).toBe("ongoing");
  });

  test("決済フィルターが正しく適用される", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: mockEvents, enableClientSideFiltering: true })
    );

    act(() => {
      result.current.setPaymentFilter("free");
    });

    expect(result.current.filteredEvents).toHaveLength(1);
    expect(result.current.filteredEvents[0].title).toBe("無料イベント（終了済み）");
    expect(result.current.filters.payment).toBe("free");
  });

  test("日付範囲フィルターが正しく適用される", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: mockEvents, enableClientSideFiltering: true })
    );

    act(() => {
      result.current.setDateRangeFilter({ start: "2024-02-01", end: "2024-05-31" });
    });

    expect(result.current.filteredEvents).toHaveLength(2);
    expect(
      result.current.filteredEvents.find((e) => e.title === "キャンセルイベント")
    ).toBeDefined();
    expect(result.current.filteredEvents.find((e) => e.title === "開催中イベント")).toBeDefined();
    expect(result.current.filters.dateRange).toEqual({ start: "2024-02-01", end: "2024-05-31" });
  });

  test("複数フィルターの組み合わせが正しく機能する", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: mockEvents, enableClientSideFiltering: true })
    );

    act(() => {
      result.current.setPaymentFilter("paid");
      result.current.setStatusFilter("upcoming");
    });

    expect(result.current.filteredEvents).toHaveLength(1);
    expect(result.current.filteredEvents[0].title).toBe("有料イベント（開催予定）");
  });

  test("フィルタークリアが正しく機能する", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: mockEvents, enableClientSideFiltering: true })
    );

    // フィルターを適用
    act(() => {
      result.current.setStatusFilter("past");
      result.current.setPaymentFilter("free");
    });

    expect(result.current.filteredEvents).toHaveLength(1);

    // フィルターをクリア
    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filteredEvents).toHaveLength(4);
    expect(result.current.filters.status).toBe("all");
    expect(result.current.filters.payment).toBe("all");
    expect(result.current.filters.dateRange).toEqual({});
  });

  test("無効なステータスフィルターが渡された場合、デフォルト値にセットされる", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: mockEvents, enableClientSideFiltering: true })
    );
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

    act(() => {
      result.current.setStatusFilter("invalid-status" as any);
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "無効なステータスフィルターです。全件表示に設定します。"
    );
    expect(result.current.filters.status).toBe("all");

    consoleSpy.mockRestore();
  });

  test("無効な決済フィルターが渡された場合、デフォルト値にセットされる", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: mockEvents, enableClientSideFiltering: true })
    );
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

    act(() => {
      result.current.setPaymentFilter("invalid-payment" as any);
    });

    expect(consoleSpy).toHaveBeenCalledWith("無効な決済フィルターです。全件表示に設定します。");
    expect(result.current.filters.payment).toBe("all");

    consoleSpy.mockRestore();
  });

  test("不正な日付範囲が渡された場合、日付範囲がクリアされる", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: mockEvents, enableClientSideFiltering: true })
    );
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

    act(() => {
      result.current.setDateRangeFilter({ start: "2024-12-31", end: "2024-01-01" });
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "終了日は開始日より前の日付は指定できません。日付範囲をクリアします。"
    );
    expect(result.current.filters.dateRange).toEqual({});

    consoleSpy.mockRestore();
  });

  test("空のイベント配列でも正しく動作する", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: [], enableClientSideFiltering: true })
    );

    expect(result.current.filteredEvents).toEqual([]);

    act(() => {
      result.current.setStatusFilter("upcoming");
    });

    expect(result.current.filteredEvents).toEqual([]);
  });

  test("フィルター状態が正しく更新される", () => {
    const { result } = renderHook(() =>
      useEventFilter({ events: mockEvents, enableClientSideFiltering: true })
    );

    act(() => {
      result.current.setStatusFilter("past");
    });

    expect(result.current.filters.status).toBe("past");
    expect(result.current.filters.payment).toBe("all"); // 他のフィルターは変更されない
    expect(result.current.filters.dateRange).toEqual({});
  });

  test("イベント配列が更新された場合、フィルターが再適用される", () => {
    const { result, rerender } = renderHook(
      ({ events }) => useEventFilter({ events, enableClientSideFiltering: true }),
      { initialProps: { events: mockEvents } }
    );

    act(() => {
      result.current.setStatusFilter("upcoming");
    });

    expect(result.current.filteredEvents).toHaveLength(1);

    // 新しいイベント配列で再レンダリング
    const newEvents = [
      ...mockEvents,
      {
        id: "event-5",
        title: "新しい開催予定イベント",
        date: "2024-07-01T10:00:00Z",
        location: "新規会議室",
        fee: 1500,
        capacity: 30,
        status: "upcoming" as const,
        creator_name: "テスト四郎",
        attendances_count: 0,
      },
    ];

    rerender({ events: newEvents });

    expect(result.current.filteredEvents).toHaveLength(2);
  });
});
