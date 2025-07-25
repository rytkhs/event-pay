import { render, screen } from "@testing-library/react";
import { EventCard } from "@/components/events/event-card";
import { EventDetail } from "@/components/events/event-detail";
import { Event } from "@/types/event";

// XSS攻撃パターンのテストデータ
const createMaliciousEvent = (title: string, location: string): Event => ({
  id: "test-event-1",
  title,
  date: "2024-01-01T10:00:00Z",
  location,
  fee: 1000,
  capacity: 20,
  status: "upcoming",
  creator_name: "テスト太郎",
  attendances_count: 5,
  created_at: "2023-12-01T10:00:00Z",
  updated_at: "2023-12-01T10:00:00Z",
  created_by: "user-1",
  description: "テストイベントの説明",
  payment_methods: ["stripe"],
  registration_deadline: "2023-12-31T23:59:59Z",
  payment_deadline: "2024-01-01T09:00:00Z",
});

const xssPayloads = [
  '<script>alert("XSS")</script>',
  '<img src="x" onerror="alert(1)">',
  '<svg onload="alert(1)">',
  '<iframe src="javascript:alert(1)">',
  '<div onclick="alert(1)">',
  '<a href="javascript:alert(1)">',
  '<object data="javascript:alert(1)">',
  '<embed src="javascript:alert(1)">',
  '<style>body{background:url("javascript:alert(1)")}</style>',
  '<link rel="stylesheet" href="javascript:alert(1)">',
];

describe("EventCard XSS防止テスト", () => {
  xssPayloads.forEach((payload, index) => {
    it(`titleでXSS攻撃パターン ${index + 1} を防ぐ: ${payload}`, () => {
      const maliciousEvent = createMaliciousEvent(payload, "テスト会場");

      render(<EventCard event={maliciousEvent} />);

      // DOM内に危険なタグが含まれていないことを確認
      const cardElement = screen.getByTestId("event-card");
      expect(cardElement.innerHTML).not.toContain("<script>");
      expect(cardElement.innerHTML).not.toContain("javascript:");
      expect(cardElement.innerHTML).not.toContain("onerror");
      expect(cardElement.innerHTML).not.toContain("onload");
      expect(cardElement.innerHTML).not.toContain("onclick");
      expect(cardElement.innerHTML).not.toContain("<iframe");
      expect(cardElement.innerHTML).not.toContain("<object");
      expect(cardElement.innerHTML).not.toContain("<embed");
      expect(cardElement.innerHTML).not.toContain("<style");
      expect(cardElement.innerHTML).not.toContain("<link");
    });

    it(`locationでXSS攻撃パターン ${index + 1} を防ぐ: ${payload}`, () => {
      const maliciousEvent = createMaliciousEvent("テストイベント", payload);

      render(<EventCard event={maliciousEvent} />);

      // DOM内に危険なタグが含まれていないことを確認
      const cardElement = screen.getByTestId("event-card");
      expect(cardElement.innerHTML).not.toContain("<script>");
      expect(cardElement.innerHTML).not.toContain("javascript:");
      expect(cardElement.innerHTML).not.toContain("onerror");
      expect(cardElement.innerHTML).not.toContain("onload");
      expect(cardElement.innerHTML).not.toContain("onclick");
      expect(cardElement.innerHTML).not.toContain("<iframe");
      expect(cardElement.innerHTML).not.toContain("<object");
      expect(cardElement.innerHTML).not.toContain("<embed");
      expect(cardElement.innerHTML).not.toContain("<style");
      expect(cardElement.innerHTML).not.toContain("<link");
    });
  });
});

describe("EventDetail XSS防止テスト", () => {
  xssPayloads.forEach((payload, index) => {
    it(`titleでXSS攻撃パターン ${index + 1} を防ぐ: ${payload}`, () => {
      const maliciousEvent = createMaliciousEvent(payload, "テスト会場");

      render(<EventDetail event={maliciousEvent} />);

      // DOM内に危険なタグが含まれていないことを確認
      const detailElement = screen.getByText("開催日").closest("div");
      expect(detailElement?.innerHTML).not.toContain("<script>");
      expect(detailElement?.innerHTML).not.toContain("javascript:");
      expect(detailElement?.innerHTML).not.toContain("onerror");
      expect(detailElement?.innerHTML).not.toContain("onload");
      expect(detailElement?.innerHTML).not.toContain("onclick");
      expect(detailElement?.innerHTML).not.toContain("<iframe");
      expect(detailElement?.innerHTML).not.toContain("<object");
      expect(detailElement?.innerHTML).not.toContain("<embed");
      expect(detailElement?.innerHTML).not.toContain("<style");
      expect(detailElement?.innerHTML).not.toContain("<link");
    });

    it(`locationでXSS攻撃パターン ${index + 1} を防ぐ: ${payload}`, () => {
      const maliciousEvent = createMaliciousEvent("テストイベント", payload);

      render(<EventDetail event={maliciousEvent} />);

      // DOM内に危険なタグが含まれていないことを確認
      const detailElement = screen.getByText("開催場所").closest("div");
      expect(detailElement?.innerHTML).not.toContain("<script>");
      expect(detailElement?.innerHTML).not.toContain("javascript:");
      expect(detailElement?.innerHTML).not.toContain("onerror");
      expect(detailElement?.innerHTML).not.toContain("onload");
      expect(detailElement?.innerHTML).not.toContain("onclick");
      expect(detailElement?.innerHTML).not.toContain("<iframe");
      expect(detailElement?.innerHTML).not.toContain("<object");
      expect(detailElement?.innerHTML).not.toContain("<embed");
      expect(detailElement?.innerHTML).not.toContain("<style");
      expect(detailElement?.innerHTML).not.toContain("<link");
    });
  });
});

describe("統合XSS防止テスト", () => {
  it("複数のXSS攻撃パターンが組み合わさった場合でも防ぐ", () => {
    const combinedPayload =
      '<script>alert("XSS")</script><img src="x" onerror="alert(1)"><div onclick="alert(1)">テスト</div>';
    const maliciousEvent = createMaliciousEvent(combinedPayload, combinedPayload);

    render(<EventCard event={maliciousEvent} />);

    const cardElement = screen.getByTestId("event-card");

    // 全ての危険なパターンが除去されていることを確認
    expect(cardElement.innerHTML).not.toContain("<script>");
    expect(cardElement.innerHTML).not.toContain("javascript:");
    expect(cardElement.innerHTML).not.toContain("onerror");
    expect(cardElement.innerHTML).not.toContain("onload");
    expect(cardElement.innerHTML).not.toContain("onclick");
    expect(cardElement.innerHTML).not.toContain("<iframe");
    expect(cardElement.innerHTML).not.toContain("<object");
    expect(cardElement.innerHTML).not.toContain("<embed");
    expect(cardElement.innerHTML).not.toContain("<style");
    expect(cardElement.innerHTML).not.toContain("<link");
  });

  it("正常なテキストは適切に表示される", () => {
    const normalEvent = createMaliciousEvent("通常のイベントタイトル", "東京都渋谷区");

    render(<EventCard event={normalEvent} />);

    expect(screen.getByText("通常のイベントタイトル")).toBeInTheDocument();
    expect(screen.getByText("東京都渋谷区")).toBeInTheDocument();
  });
});
