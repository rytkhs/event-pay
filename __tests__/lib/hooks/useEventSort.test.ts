import { renderHook, act } from "@testing-library/react";
import { useEventSort } from "@/lib/hooks/useEventSort";
import { Event } from "@/types/event";
import { SortBy, SortOrder } from "@/app/events/actions/get-events";

// テスト用のモックイベントデータ
const mockEvents: Event[] = [
  {
    id: "1",
    title: "イベント1",
    date: "2024-01-15T10:00:00Z",
    created_at: "2024-01-01T00:00:00Z",
    fee: 1000,
    attendances_count: 10,
    status: "upcoming",
    max_attendees: 20,
    creator_id: "user1",
    location: "東京",
    description: "テストイベント1",
    registration_deadline: "2024-01-14T23:59:59Z",
    payment_deadline: "2024-01-14T23:59:59Z",
    allow_stripe: true,
    allow_cash: true,
  },
  {
    id: "2",
    title: "イベント2",
    date: "2024-01-10T10:00:00Z",
    created_at: "2024-01-02T00:00:00Z",
    fee: 500,
    attendances_count: 15,
    status: "upcoming",
    max_attendees: 30,
    creator_id: "user2",
    location: "大阪",
    description: "テストイベント2",
    registration_deadline: "2024-01-09T23:59:59Z",
    payment_deadline: "2024-01-09T23:59:59Z",
    allow_stripe: true,
    allow_cash: false,
  },
  {
    id: "3",
    title: "イベント3",
    date: "2024-01-20T10:00:00Z",
    created_at: "2024-01-03T00:00:00Z",
    fee: 0,
    attendances_count: 5,
    status: "upcoming",
    max_attendees: 10,
    creator_id: "user3",
    location: "福岡",
    description: "テストイベント3",
    registration_deadline: "2024-01-19T23:59:59Z",
    payment_deadline: "2024-01-19T23:59:59Z",
    allow_stripe: false,
    allow_cash: true,
  },
];

describe("useEventSort", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("初期状態", () => {
    it("デフォルト値で初期化される", () => {
      const { result } = renderHook(() => useEventSort());

      expect(result.current.sortOptions.sortBy).toBe("date");
      expect(result.current.sortOptions.sortOrder).toBe("asc");
      expect(result.current.sortedEvents).toEqual([]);
    });

    it("初期値を指定して初期化される", () => {
      const initialSort = { sortBy: "fee" as SortBy, sortOrder: "desc" as SortOrder };
      const { result } = renderHook(() => useEventSort({ initialSort }));

      expect(result.current.sortOptions.sortBy).toBe("fee");
      expect(result.current.sortOptions.sortOrder).toBe("desc");
    });
  });

  describe("サーバーサイドソート（デフォルト）", () => {
    it("enableClientSideSortが無効の場合、元のイベント配列をそのまま返す", () => {
      const { result } = renderHook(() =>
        useEventSort({ events: mockEvents, enableClientSideSort: false })
      );

      expect(result.current.sortedEvents).toEqual(mockEvents);
    });
  });

  describe("クライアントサイドソート", () => {
    it("開催日時で昇順ソートされる", () => {
      const { result } = renderHook(() =>
        useEventSort({
          events: mockEvents,
          enableClientSideSort: true,
          initialSort: { sortBy: "date", sortOrder: "asc" },
        })
      );

      const sorted = result.current.sortedEvents;
      expect(sorted[0].id).toBe("2"); // 2024-01-10
      expect(sorted[1].id).toBe("1"); // 2024-01-15
      expect(sorted[2].id).toBe("3"); // 2024-01-20
    });

    it("開催日時で降順ソートされる", () => {
      const { result } = renderHook(() =>
        useEventSort({
          events: mockEvents,
          enableClientSideSort: true,
          initialSort: { sortBy: "date", sortOrder: "desc" },
        })
      );

      const sorted = result.current.sortedEvents;
      expect(sorted[0].id).toBe("3"); // 2024-01-20
      expect(sorted[1].id).toBe("1"); // 2024-01-15
      expect(sorted[2].id).toBe("2"); // 2024-01-10
    });

    it("参加費で昇順ソートされる", () => {
      const { result } = renderHook(() =>
        useEventSort({
          events: mockEvents,
          enableClientSideSort: true,
          initialSort: { sortBy: "fee", sortOrder: "asc" },
        })
      );

      const sorted = result.current.sortedEvents;
      expect(sorted[0].fee).toBe(0);
      expect(sorted[1].fee).toBe(500);
      expect(sorted[2].fee).toBe(1000);
    });

    it("参加者数で降順ソートされる", () => {
      const { result } = renderHook(() =>
        useEventSort({
          events: mockEvents,
          enableClientSideSort: true,
          initialSort: { sortBy: "attendances_count", sortOrder: "desc" },
        })
      );

      const sorted = result.current.sortedEvents;
      expect(sorted[0].attendances_count).toBe(15);
      expect(sorted[1].attendances_count).toBe(10);
      expect(sorted[2].attendances_count).toBe(5);
    });

    it("作成日時でソートされる", () => {
      const { result } = renderHook(() =>
        useEventSort({
          events: mockEvents,
          enableClientSideSort: true,
          initialSort: { sortBy: "created_at", sortOrder: "asc" },
        })
      );

      const sorted = result.current.sortedEvents;
      expect(sorted[0].id).toBe("1"); // 2024-01-01
      expect(sorted[1].id).toBe("2"); // 2024-01-02
      expect(sorted[2].id).toBe("3"); // 2024-01-03
    });
  });

  describe("ソート条件の変更", () => {
    it("setSortBy でソート条件を変更できる", () => {
      const onSortChange = jest.fn();
      const { result } = renderHook(() => useEventSort({ onSortChange }));

      act(() => {
        result.current.setSortBy("fee");
      });

      expect(result.current.sortOptions.sortBy).toBe("fee");
      expect(onSortChange).toHaveBeenCalledWith({
        sortBy: "fee",
        sortOrder: "asc",
      });
    });

    it("setSortOrder でソート順序を変更できる", () => {
      const onSortChange = jest.fn();
      const { result } = renderHook(() => useEventSort({ onSortChange }));

      act(() => {
        result.current.setSortOrder("desc");
      });

      expect(result.current.sortOptions.sortOrder).toBe("desc");
      expect(onSortChange).toHaveBeenCalledWith({
        sortBy: "date",
        sortOrder: "desc",
      });
    });

    it("setSortOptions で両方を一度に変更できる", () => {
      const onSortChange = jest.fn();
      const { result } = renderHook(() => useEventSort({ onSortChange }));

      const newSortOptions = { sortBy: "fee" as SortBy, sortOrder: "desc" as SortOrder };

      act(() => {
        result.current.setSortOptions(newSortOptions);
      });

      expect(result.current.sortOptions).toEqual(newSortOptions);
      expect(onSortChange).toHaveBeenCalledWith(newSortOptions);
    });
  });

  describe("バリデーション", () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it("無効なソート条件の場合、警告を表示してデフォルト値を設定", () => {
      const { result } = renderHook(() => useEventSort());

      act(() => {
        result.current.setSortBy("invalid" as SortBy);
      });

      expect(consoleSpy).toHaveBeenCalledWith("無効なソート条件です。開催日時ソートに設定します。");
      expect(result.current.sortOptions.sortBy).toBe("date");
    });

    it("無効なソート順序の場合、警告を表示してデフォルト値を設定", () => {
      const { result } = renderHook(() => useEventSort());

      act(() => {
        result.current.setSortOrder("invalid" as SortOrder);
      });

      expect(consoleSpy).toHaveBeenCalledWith("無効なソート順序です。昇順に設定します。");
      expect(result.current.sortOptions.sortOrder).toBe("asc");
    });
  });

  describe("resetSort", () => {
    it("ソート条件をデフォルトにリセットできる", () => {
      const onSortChange = jest.fn();
      const { result } = renderHook(() =>
        useEventSort({
          onSortChange,
          initialSort: { sortBy: "fee", sortOrder: "desc" },
        })
      );

      // 初期値の確認
      expect(result.current.sortOptions.sortBy).toBe("fee");
      expect(result.current.sortOptions.sortOrder).toBe("desc");

      act(() => {
        result.current.resetSort();
      });

      expect(result.current.sortOptions.sortBy).toBe("date");
      expect(result.current.sortOptions.sortOrder).toBe("asc");
      expect(onSortChange).toHaveBeenCalledWith({
        sortBy: "date",
        sortOrder: "asc",
      });
    });
  });

  describe("エッジケース", () => {
    it("空のイベント配列でもエラーが発生しない", () => {
      const { result } = renderHook(() => useEventSort({ events: [], enableClientSideSort: true }));

      expect(result.current.sortedEvents).toEqual([]);
    });

    it("undefinedのイベント配列でも空配列を返す", () => {
      const { result } = renderHook(() =>
        useEventSort({ events: undefined, enableClientSideSort: true })
      );

      expect(result.current.sortedEvents).toEqual([]);
    });

    it("不正な形式のイベント配列でも空配列を返す", () => {
      const { result } = renderHook(() =>
        useEventSort({ events: "not-array" as any, enableClientSideSort: true })
      );

      expect(result.current.sortedEvents).toEqual([]);
    });
  });
});
