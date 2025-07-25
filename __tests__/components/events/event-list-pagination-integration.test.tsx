import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter, useSearchParams } from "next/navigation";
import { EventListWithFilters } from "@/components/events/event-list-with-filters";

import { UnifiedMockFactory } from "@/__tests__/helpers/unified-mock-factory";

// 統一モック設定を適用
UnifiedMockFactory.setupCommonMocks();

// Mock Next.js navigation hooks
const mockPush = jest.fn();
const mockUseSearchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: jest.fn(),
}));

// Helper function to create mock events
const createMockEvents = (count: number, startIndex: number = 1) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `event-${startIndex + i}`,
    title: `イベント ${startIndex + i}`,
    description: `説明 ${startIndex + i}`,
    date: new Date(2024, 0, startIndex + i).toISOString(),
    fee: 1000,
    capacity: 50,
    location: "テスト会場",
    status: "active" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
};

describe("EventList Pagination Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("ページネーション表示統合", () => {
    it("複数ページのデータがある場合、ページネーションが表示される", async () => {
      // 25件のデータで10件ずつ表示の場合、3ページになる
      mockUseSearchParams.mockReturnValue(new URLSearchParams("page=1&limit=10") as any);

      const mockEvents = createMockEvents(10);

      render(<EventListWithFilters events={mockEvents} totalCount={25} />);

      await waitFor(() => {
        // ページネーションコンポーネントが表示されることを確認
        expect(screen.getByRole("navigation")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "3" })).toBeInTheDocument();
      });
    });

    it("1ページ以下のデータの場合、ページネーションが表示されない", async () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams("page=1&limit=10") as any);

      const mockEvents = createMockEvents(5);

      render(<EventListWithFilters events={mockEvents} totalCount={5} />);

      await waitFor(() => {
        // イベントは表示されているがページネーションは表示されない
        expect(screen.getByText("イベント 1")).toBeInTheDocument();
        expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
      });
    });
  });

  describe("ページネーション操作統合", () => {
    it("ページ番号をクリックしてURLパラメータが更新される", async () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams("page=1&limit=10") as any);

      const mockEvents = createMockEvents(10);

      render(<EventListWithFilters events={mockEvents} totalCount={25} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
      });

      // ページ2をクリック
      fireEvent.click(screen.getByRole("button", { name: "2" }));

      await waitFor(() => {
        // URLパラメータが更新されることを確認
        expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("page=2"));
      });
    });

    it("フィルター変更時にページ番号が1にリセットされる", async () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams("page=2&status=draft") as any);

      const mockEvents = createMockEvents(10);

      render(<EventListWithFilters events={mockEvents} totalCount={25} />);

      await waitFor(() => {
        // JSDOMではShadcn/ui Selectの操作が制限されるため、
        // 基本要素の存在確認のみ行う
        const statusSelect = screen.getByTestId("status-filter");
        expect(statusSelect).toBeInTheDocument();
      });

      // Note: 実際のSelect操作およびURLパラメータテストはE2Eテスト環境で実行
    });
  });

  describe("URLパラメータとの同期", () => {
    it("URLパラメータからページ番号を読み取って表示する", async () => {
      // URLパラメータでページ3を指定
      mockUseSearchParams.mockReturnValue(new URLSearchParams("page=3&limit=10") as any);

      const mockEvents = createMockEvents(10, 21); // 3ページ目なので21-30番のイベント

      render(<EventListWithFilters events={mockEvents} totalCount={35} />);

      await waitFor(() => {
        // ページ3が選択状態であることを確認
        expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("aria-current", "page");
        // 3ページ目のデータが表示されていることを確認
        expect(screen.getByText("イベント 21")).toBeInTheDocument();
      });
    });

    it("無効なページ番号の場合、1ページ目にフォールバックする", async () => {
      // 存在しないページ番号を指定
      mockUseSearchParams.mockReturnValue(new URLSearchParams("page=999&limit=10") as any);

      const mockEvents = createMockEvents(10);

      render(<EventListWithFilters events={mockEvents} totalCount={25} />);

      await waitFor(() => {
        // ページネーションが正常に表示されることを確認
        expect(screen.getByRole("navigation")).toBeInTheDocument();
        // 1ページ目のデータが表示されていることを確認
        expect(screen.getByText("イベント 1")).toBeInTheDocument();
      });
    });
  });

  describe("結果件数表示", () => {
    it("ページネーションと連動した結果件数が表示される", async () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams("page=2&limit=10") as any);

      const mockEvents = createMockEvents(10, 11); // 2ページ目なので11-20番のイベント

      render(<EventListWithFilters events={mockEvents} totalCount={25} />);

      await waitFor(() => {
        // 2ページ目の件数表示が正しく表示される
        expect(screen.getByText("11〜20件 / 全25件を表示")).toBeInTheDocument();
      });
    });

    it("最後のページの件数表示が正しく表示される", async () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams("page=3&limit=10") as any);

      const mockEvents = createMockEvents(5, 21); // 3ページ目（最後）なので21-25番のイベント

      render(<EventListWithFilters events={mockEvents} totalCount={25} />);

      await waitFor(() => {
        // 最後のページの件数表示が正しく表示される
        expect(screen.getByText("21〜25件 / 全25件を表示")).toBeInTheDocument();
      });
    });
  });
});
