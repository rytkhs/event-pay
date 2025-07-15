import { render, screen } from "@testing-library/react";
import { EventDetail } from "@/components/events/event-detail";
import { getFutureDatetimeLocalForTest } from "@/lib/utils/test-helpers";

// Mock Event type for testing
interface MockEventDetail {
  id: string;
  title: string;
  date: string;
  location: string;
  fee: number;
  capacity: number;
  status: "upcoming" | "ongoing" | "past" | "cancelled";
  description?: string;
  registration_deadline?: string;
  payment_deadline?: string;
  payment_methods: string[];
  created_at: string;
  updated_at: string;
  created_by: string;
  creator_name: string;
}

describe("EventDetail Component", () => {
  const mockEventDetail: MockEventDetail = {
    id: "event123",
    title: "テストイベント",
    date: getFutureDatetimeLocalForTest(24),
    location: "テスト会場",
    fee: 1000,
    capacity: 50,
    status: "upcoming",
    description: "テストイベントの詳細説明です。",
    registration_deadline: getFutureDatetimeLocalForTest(12),
    payment_deadline: getFutureDatetimeLocalForTest(18),
    payment_methods: ["stripe", "cash"],
    created_at: "2024-12-01T10:00:00",
    updated_at: "2024-12-01T10:00:00",
    created_by: "user123",
    creator_name: "テストユーザー",
  };

  describe("Green Phase - 機能テスト", () => {
    test("無効なeventデータが渡された場合、エラーフォールバックが表示される", () => {
      const invalidEvent = {
        // 必須フィールドが不足
        id: "",
        title: "",
      } as MockEventDetail;

      render(<EventDetail event={invalidEvent} />);
      expect(screen.getByText("イベント情報が正しく読み込まれませんでした。")).toBeInTheDocument();
    });

    test("イベントタイトルが正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText("テストイベント")).toBeInTheDocument();
    });

    test("イベント開催日が正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText(/開催日/)).toBeInTheDocument();
    });

    test("開催場所が正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText("テスト会場")).toBeInTheDocument();
    });

    test("参加費が正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText(/1,000円/)).toBeInTheDocument();
    });

    test("定員が正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText(/定員.*50人/)).toBeInTheDocument();
    });

    test("イベントステータスが正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText(/開催予定/)).toBeInTheDocument();
    });

    test("イベント説明が正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText("テストイベントの詳細説明です。")).toBeInTheDocument();
    });

    test("申込締切が正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText(/申込締切/)).toBeInTheDocument();
    });

    test("決済締切が正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText(/決済締切/)).toBeInTheDocument();
    });

    test("利用可能決済方法が正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText(/決済方法/)).toBeInTheDocument();
    });

    test("作成日時が正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText(/作成日時/)).toBeInTheDocument();
    });

    test("最終更新日時が正しく表示される", () => {
      render(<EventDetail event={mockEventDetail} />);
      expect(screen.getByText(/最終更新/)).toBeInTheDocument();
    });
  });
});
