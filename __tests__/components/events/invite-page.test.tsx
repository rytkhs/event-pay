import { render, screen } from "@testing-library/react";
import { InviteEventDetail } from "@/components/events/invite-event-detail";
import { InviteError } from "@/components/events/invite-error";
import type { EventDetail } from "@/lib/utils/invite-token";

// Mock the sanitize utilities
jest.mock("@/lib/utils/sanitize", () => ({
  sanitizeEventDescription: jest.fn((text) => text),
  sanitizeForEventPay: jest.fn((text) => text),
}));

// Mock the timezone utility
jest.mock("@/lib/utils/timezone", () => ({
  formatUtcToJapaneseDisplay: jest.fn((date) => `Formatted: ${date}`),
}));

// Mock the payment method constants
jest.mock("@/lib/constants/payment-methods", () => ({
  PAYMENT_METHOD_LABELS: {
    stripe: "オンライン決済",
    cash: "現金決済",
    free: "無料",
  },
}));

describe("InviteEventDetail Component", () => {
  const mockEvent: EventDetail = {
    id: "test-event-id",
    title: "テストイベント",
    date: "2025-12-31T10:00:00Z",
    location: "テスト会場",
    description: "テストイベントの説明",
    fee: 1000,
    capacity: 50,
    payment_methods: ["stripe", "cash"],
    registration_deadline: "2025-12-30T23:59:59Z",
    payment_deadline: "2025-12-31T23:59:59Z",
    status: "upcoming",
    invite_token: "test-invite-token",
    attendances_count: 10,
  };

  it("should display event details correctly", () => {
    render(<InviteEventDetail event={mockEvent} inviteToken="test-token" />);

    expect(screen.getByText("テストイベント")).toBeInTheDocument();
    expect(screen.getByText("テスト会場")).toBeInTheDocument();
    expect(screen.getByText("1,000円")).toBeInTheDocument();
    expect(screen.getByText("10/50人")).toBeInTheDocument();
    expect(screen.getByText("テストイベントの説明")).toBeInTheDocument();
  });

  it("should show participation button when registration is open", () => {
    render(<InviteEventDetail event={mockEvent} inviteToken="test-token" />);

    expect(screen.getByText("参加申し込みをする")).toBeInTheDocument();
  });

  it("should show capacity reached message when event is full", () => {
    const fullEvent = { ...mockEvent, attendances_count: 50 };
    render(<InviteEventDetail event={fullEvent} inviteToken="test-token" />);

    expect(screen.getByText("参加申し込み不可")).toBeInTheDocument();
    expect(screen.getByText("定員に達しています")).toBeInTheDocument();
  });

  it("should show deadline passed message when registration deadline has passed", () => {
    const pastDeadlineEvent = {
      ...mockEvent,
      registration_deadline: "2020-01-01T00:00:00Z",
    };
    render(<InviteEventDetail event={pastDeadlineEvent} inviteToken="test-token" />);

    expect(screen.getByText("参加申し込み不可")).toBeInTheDocument();
    expect(screen.getByText("申込期限が過ぎています")).toBeInTheDocument();
  });

  it("should display free event correctly", () => {
    const freeEvent = { ...mockEvent, fee: 0, payment_methods: ["free"] };
    render(<InviteEventDetail event={freeEvent} inviteToken="test-token" />);

    expect(screen.getByText("無料")).toBeInTheDocument();
  });

  it("should display unlimited capacity correctly", () => {
    const unlimitedEvent = { ...mockEvent, capacity: null };
    render(<InviteEventDetail event={unlimitedEvent} inviteToken="test-token" />);

    expect(screen.getByText("制限なし")).toBeInTheDocument();
  });
});

describe("InviteError Component", () => {
  it("should display error message correctly", () => {
    render(<InviteError errorMessage="テストエラーメッセージ" />);

    expect(screen.getByText("アクセスできません")).toBeInTheDocument();
    expect(screen.getByText("テストエラーメッセージ")).toBeInTheDocument();
    expect(screen.getByText("ホームに戻る")).toBeInTheDocument();
  });

  it("should show retry button when showRetry is true", () => {
    render(<InviteError errorMessage="エラー" showRetry={true} />);

    expect(screen.getByText("再試行")).toBeInTheDocument();
  });

  it("should not show retry button when showRetry is false", () => {
    render(<InviteError errorMessage="エラー" showRetry={false} />);

    expect(screen.queryByText("再試行")).not.toBeInTheDocument();
  });
});
