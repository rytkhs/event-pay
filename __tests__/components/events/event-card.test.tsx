import { render, screen } from "@testing-library/react";
import { EventCard } from "@/components/events/event-card";
import { Event } from "@/types/event";

const mockEvent: Event = {
  id: "event-1",
  title: "テストイベント",
  date: "2024-01-01T10:00:00Z",
  location: "東京会議室",
  fee: 1000,
  capacity: 20,
  status: "upcoming",
  creator_name: "テスト太郎",
  attendances_count: 5,
  created_at: "2023-12-01T10:00:00Z",
};

describe("EventCard Component - Red Phase Tests", () => {
  test("イベントの基本情報が正しく表示される", () => {
    render(<EventCard event={mockEvent} />);

    expect(screen.getByText("テストイベント")).toBeInTheDocument();
    expect(screen.getByText("東京会議室")).toBeInTheDocument();
    expect(screen.getByText("¥1,000")).toBeInTheDocument();
    expect(screen.getByText("5/20名")).toBeInTheDocument();
    expect(screen.getByText("開催予定")).toBeInTheDocument();
  });

  test("無料イベントの場合、料金が「無料」と表示される", () => {
    const freeEvent = { ...mockEvent, fee: 0 };
    render(<EventCard event={freeEvent} />);

    expect(screen.getByText("無料")).toBeInTheDocument();
  });

  test("イベント詳細ページへのリンクが機能する", () => {
    render(<EventCard event={mockEvent} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/events/event-1");
  });

  test("イベントステータスに応じたスタイルが適用される", () => {
    render(<EventCard event={mockEvent} />);

    const statusBadge = screen.getByText("開催予定");
    expect(statusBadge).toHaveClass("bg-green-100", "text-green-800");
  });

  test("過去のイベントには適切なスタイルが適用される", () => {
    const pastEvent = { ...mockEvent, status: "past" };
    render(<EventCard event={pastEvent} />);

    const statusBadge = screen.getByText("終了");
    expect(statusBadge).toHaveClass("bg-gray-100", "text-gray-800");
  });

  test("キャンセルされたイベントには適切なスタイルが適用される", () => {
    const cancelledEvent = { ...mockEvent, status: "cancelled" };
    render(<EventCard event={cancelledEvent} />);

    const statusBadge = screen.getByText("キャンセル");
    expect(statusBadge).toHaveClass("bg-red-100", "text-red-800");
  });

  test("開催中のイベントには適切なスタイルが適用される", () => {
    const ongoingEvent = { ...mockEvent, status: "ongoing" };
    render(<EventCard event={ongoingEvent} />);

    const statusBadge = screen.getByText("開催中");
    expect(statusBadge).toHaveClass("bg-blue-100", "text-blue-800");
  });
});
