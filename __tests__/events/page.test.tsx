import { render, screen } from "@testing-library/react";
import EventsPage from "@/app/events/page";
import { Event } from "@/types/event";

// Mock Next.js router
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
  })),
}));

// Mock Server Actions (統合テストで実際のテストを行う)
jest.mock("@/app/events/actions", () => ({
  getEventsAction: jest.fn().mockResolvedValue({
    success: true,
    data: [],
  }),
}));

const mockEvents: Event[] = [
  {
    id: "event-1",
    title: "テストイベント1",
    date: "2024-01-01T10:00:00Z",
    location: "東京会議室",
    fee: 1000,
    capacity: 20,
    status: "upcoming",
    creator_name: "テスト太郎",
    attendances_count: 5,
  },
  {
    id: "event-2",
    title: "テストイベント2",
    date: "2024-01-02T14:00:00Z",
    location: "大阪会議室",
    fee: 0,
    capacity: 10,
    status: "upcoming",
    creator_name: "テスト太郎",
    attendances_count: 3,
  },
];

describe("Events Page - Unit Tests (Red Phase)", () => {
  describe("コンポーネント表示テスト", () => {
    test.skip("ページタイトルが正しく表示される", async () => {
      // Server Component（async）のため、単体テストでは難しい
      // 統合テストで検証予定
      // const result = await render(<EventsPage />);
      // expect(screen.getByText("イベント一覧")).toBeInTheDocument();
    });

    test.skip("ローディング状態が表示される", async () => {
      // Server Component（async）のため、単体テストでは難しい
      // 統合テストで検証予定
      // const result = await render(<EventsPage />);
      // expect(screen.getByText("読み込み中...")).toBeInTheDocument();
    });

    test.skip("新しいイベント作成ボタンが表示される", async () => {
      // Server Component（async）のため、単体テストでは難しい
      // 統合テストで検証予定
      // const result = await render(<EventsPage />);
      // const createButton = screen.getByRole("link", { name: /新しいイベントを作成/i });
      // expect(createButton).toBeInTheDocument();
      // expect(createButton).toHaveAttribute("href", "/events/create");
    });

    test("エラー状態が適切に表示される", () => {
      // エラー状態のテストは実装時に追加
      // render(<EventsPage />);
      // expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
    });
  });

  describe("レイアウト・スタイルテスト", () => {
    test.skip("ページレイアウトが正しく設定される", async () => {
      // Server Component（async）のため、単体テストでは難しい
      // 統合テストで検証予定
      // const result = await render(<EventsPage />);
      // const mainContainer = screen.getByTestId("events-page-container");
      // expect(mainContainer).toHaveClass("container", "mx-auto", "px-4", "py-8");
    });

    test.skip("ヘッダーセクションが正しく表示される", async () => {
      // Server Component（async）のため、単体テストでは難しい
      // 統合テストで検証予定
      // const result = await render(<EventsPage />);
      // const headerSection = screen.getByTestId("events-page-header");
      // expect(headerSection).toBeInTheDocument();
    });
  });
});

// 統合テストは別ファイルで実装予定
// __tests__/integration/events/page.integration.test.tsx
/*
統合テストで実装予定項目：
- Server Actions (getEventsAction) の実際の呼び出し（構造化レスポンス形式）
- Supabase との連携テスト
- 認証状態の検証
- RLS ポリシーの動作確認
- エラーハンドリング（{ success: false, error: string } 形式）
- レート制限の確認
*/
