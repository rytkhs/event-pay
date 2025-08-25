import { render, screen } from "@testing-library/react";
import { EventStats } from "@/components/events/event-stats";
import type { Event, Attendance, Payment } from "@/types/models";

// 共通型から必要なフィールドのみを抽出
type MockAttendanceData = Pick<Attendance, "id" | "status">;
type MockPaymentData = Pick<Payment, "id" | "method" | "amount" | "status">;

describe("EventStats", () => {
  // テスト用のベースデータ
  let baseEventData: Event;
  let baseAttendances: MockAttendanceData[];
  let basePayments: MockPaymentData[];

  beforeEach(() => {
    baseEventData = createMockEventData();
    baseAttendances = [];
    basePayments = [];
  });

  // ヘルパー関数: モックイベントデータ作成
  function createMockEventData(overrides: Partial<Event> = {}): Event {
    return {
      id: "event-1",
      title: "テストイベント",
      description: "テストイベントの説明",
      location: "渋谷",
      date: "2024-01-15T18:00:00Z",
      fee: 3000,
      capacity: 20,
      status: "upcoming",
      payment_methods: ["stripe", "cash"],
      registration_deadline: null,
      payment_deadline: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      created_by: "user-1",
      invite_token: "test-token",
      creator_name: "テストユーザー",
      attendances_count: 0,
      ...overrides,
    };
  }

  // ヘルパー関数: モック参加データ作成
  function createMockAttendance(
    id: string,
    status: "attending" | "not_attending" | "maybe"
  ): MockAttendanceData {
    return { id, status };
  }

  // ヘルパー関数: モック決済データ作成
  function createMockPayment(
    id: string,
    method: "stripe" | "cash",
    amount: number,
    status: "paid" | "received" | "pending" | "failed" | "refunded" | "completed"
  ): MockPaymentData {
    return { id, method, amount, status };
  }

  // ヘルパー関数: 複数の参加データを一括作成
  function createMultipleAttendances(
    configs: Array<{ status: "attending" | "not_attending" | "maybe"; count: number }>
  ): MockAttendanceData[] {
    const attendances: MockAttendanceData[] = [];
    let idCounter = 1;

    configs.forEach(({ status, count }) => {
      for (let i = 0; i < count; i++) {
        attendances.push(createMockAttendance(`att-${idCounter}`, status));
        idCounter++;
      }
    });

    return attendances;
  }
  // テストリスト項目1: EventStatsコンポーネントが正常にレンダリングされること
  it("EventStatsコンポーネントが正常にレンダリングされること", () => {
    const eventData = createMockEventData({
      attendances_count: 4,
      registration_deadline: "2024-01-14T23:59:59Z",
      payment_deadline: "2024-01-14T23:59:59Z",
    });

    const attendances = [
      createMockAttendance("att-1", "attending"),
      createMockAttendance("att-2", "attending"),
      createMockAttendance("att-3", "not_attending"),
      createMockAttendance("att-4", "maybe"),
    ];

    const payments = [
      createMockPayment("pay-1", "stripe", 3000, "paid"),
      createMockPayment("pay-2", "cash", 3000, "pending"),
    ];

    render(<EventStats eventData={eventData} attendances={attendances} payments={payments} />);

    // コンポーネントが正常にレンダリングされることを確認
    expect(screen.getByTestId("event-stats")).toBeInTheDocument();
  });

  // テストリスト項目4: 参加予定者数が正確に表示されること
  it("参加予定者数が正確に表示されること", () => {
    const eventData = createMockEventData({ attendances_count: 5 });
    const attendances = createMultipleAttendances([
      { status: "attending", count: 3 },
      { status: "not_attending", count: 1 },
      { status: "maybe", count: 1 },
    ]);

    render(<EventStats eventData={eventData} attendances={attendances} payments={[]} />);

    // 参加予定者数が3名と表示されることを確認
    expect(screen.getByTestId("attending-count")).toHaveTextContent("3");
  });

  // テストリスト項目5: 不参加者数が正確に表示されること
  it("不参加者数が正確に表示されること", () => {
    const eventData = createMockEventData({ attendances_count: 5 });
    const attendances = createMultipleAttendances([
      { status: "attending", count: 2 },
      { status: "not_attending", count: 2 },
      { status: "maybe", count: 1 },
    ]);

    render(<EventStats eventData={eventData} attendances={attendances} payments={[]} />);

    // 不参加者数が2名と表示されることを確認
    expect(screen.getByTestId("not-attending-count")).toHaveTextContent("2");
  });

  // テストリスト項目6: 未定者数が正確に表示されること
  it("未定者数が正確に表示されること", () => {
    const eventData = createMockEventData({ attendances_count: 5 });
    const attendances = createMultipleAttendances([
      { status: "attending", count: 1 },
      { status: "maybe", count: 3 },
      { status: "not_attending", count: 1 },
    ]);

    render(<EventStats eventData={eventData} attendances={attendances} payments={[]} />);

    // 未定者数が3名と表示されることを確認
    expect(screen.getByTestId("maybe-count")).toHaveTextContent("3");
  });

  // テストリスト項目9: 売上合計が正確に計算されること
  it("売上合計が正確に計算されること", () => {
    const eventData = createMockEventData({ fee: 3000, attendances_count: 3 });
    const attendances = createMultipleAttendances([
      { status: "attending", count: 2 },
      { status: "not_attending", count: 1 },
    ]);
    const payments = [
      createMockPayment("pay-1", "stripe", 3000, "paid"),
      createMockPayment("pay-2", "cash", 3000, "received"),
      createMockPayment("pay-3", "stripe", 3000, "pending"),
    ];

    render(<EventStats eventData={eventData} attendances={attendances} payments={payments} />);

    // 売上合計が6000円と表示されることを確認（paid + received）
    expect(screen.getByTestId("total-revenue")).toHaveTextContent("¥6,000");
  });

  // テストリスト項目10: Stripe決済分が正確に表示されること
  it("Stripe決済分が正確に表示されること", () => {
    const eventData = createMockEventData({ fee: 3000, attendances_count: 2 });
    const attendances = createMultipleAttendances([{ status: "attending", count: 2 }]);
    const payments = [
      createMockPayment("pay-1", "stripe", 3000, "paid"),
      createMockPayment("pay-2", "stripe", 3000, "paid"),
      createMockPayment("pay-3", "cash", 3000, "received"),
      createMockPayment("pay-4", "stripe", 3000, "pending"),
    ];

    render(<EventStats eventData={eventData} attendances={attendances} payments={payments} />);

    // Stripe決済分が6000円と表示されることを確認
    expect(screen.getByTestId("stripe-revenue")).toHaveTextContent("¥6,000");
  });

  // テストリスト項目11: 現金決済分が正確に表示されること
  it("現金決済分が正確に表示されること", () => {
    const eventData = createMockEventData({ fee: 3000, attendances_count: 2 });
    const attendances = createMultipleAttendances([{ status: "attending", count: 2 }]);
    const payments = [
      createMockPayment("pay-1", "cash", 3000, "received"),
      createMockPayment("pay-2", "cash", 3000, "received"),
      createMockPayment("pay-3", "stripe", 3000, "paid"),
      createMockPayment("pay-4", "cash", 3000, "pending"),
    ];

    render(<EventStats eventData={eventData} attendances={attendances} payments={payments} />);

    // 現金決済分が6000円と表示されることを確認
    expect(screen.getByTestId("cash-revenue")).toHaveTextContent("¥6,000");
  });

  // テストリスト項目12: 未決済金額が正確に表示されること
  it("未決済金額が正確に表示されること", () => {
    const eventData = createMockEventData({ fee: 3000, attendances_count: 2 });
    const attendances = createMultipleAttendances([{ status: "attending", count: 2 }]);
    const payments = [
      createMockPayment("pay-1", "stripe", 3000, "pending"),
      createMockPayment("pay-2", "cash", 3000, "pending"),
      createMockPayment("pay-3", "stripe", 3000, "paid"),
      createMockPayment("pay-4", "stripe", 3000, "failed"),
    ];

    render(<EventStats eventData={eventData} attendances={attendances} payments={payments} />);

    // 未決済金額が6000円と表示されることを確認
    expect(screen.getByTestId("pending-amount")).toHaveTextContent("¥6,000");
  });

  // テストリスト項目13: 期待売上が正確に表示されること
  it("期待売上が正確に表示されること", () => {
    const eventData = createMockEventData({ fee: 2500, attendances_count: 5 });
    const attendances = createMultipleAttendances([
      { status: "attending", count: 3 },
      { status: "not_attending", count: 1 },
      { status: "maybe", count: 1 },
    ]);

    render(<EventStats eventData={eventData} attendances={attendances} payments={[]} />);

    // 期待売上が7500円と表示されることを確認（参加予定者3名 × 2500円）
    expect(screen.getByTestId("expected-revenue")).toHaveTextContent("¥7,500");
  });

  // テストリスト項目14: 決済完了率が正確に表示されること
  it("決済完了率が正確に表示されること", () => {
    const eventData = createMockEventData({ fee: 3000, attendances_count: 5 });
    const attendances = createMultipleAttendances([
      { status: "attending", count: 4 },
      { status: "not_attending", count: 1 },
    ]);
    const payments = [
      createMockPayment("pay-1", "stripe", 3000, "paid"),
      createMockPayment("pay-2", "cash", 3000, "received"),
      createMockPayment("pay-3", "stripe", 3000, "pending"),
      createMockPayment("pay-4", "cash", 3000, "pending"),
    ];

    render(<EventStats eventData={eventData} attendances={attendances} payments={payments} />);

    // 決済完了率が50%と表示されることを確認（完了済み2件 / 全決済4件）
    expect(screen.getByTestId("payment-completion-rate")).toHaveTextContent("50%");
  });

  // テストリスト項目15: 参加率が正確に表示されること
  it("参加率が正確に表示されること", () => {
    const eventData = createMockEventData({ fee: 3000, capacity: 10, attendances_count: 5 });
    const attendances = createMultipleAttendances([
      { status: "attending", count: 3 },
      { status: "not_attending", count: 1 },
      { status: "maybe", count: 1 },
    ]);

    render(<EventStats eventData={eventData} attendances={attendances} payments={[]} />);

    // 参加率が30%と表示されることを確認（参加者3名 / 定員10名）
    expect(screen.getByTestId("attendance-rate")).toHaveTextContent("30%");
  });

  // テストリスト項目16: 定員超過状態が正確に表示されること
  it("定員超過状態が正確に表示されること", () => {
    const eventData = createMockEventData({ fee: 3000, capacity: 5, attendances_count: 8 });
    const attendances = createMultipleAttendances([
      { status: "attending", count: 7 },
      { status: "not_attending", count: 1 },
    ]);

    render(<EventStats eventData={eventData} attendances={attendances} payments={[]} />);

    // 定員超過状態がtrueと表示されることを確認（参加者7名 > 定員5名）
    expect(screen.getByTestId("capacity-exceeded")).toHaveTextContent("定員超過");
  });

  // テストリスト項目17: 空のデータでゼロ値が正確に表示されること
  it("空のデータでゼロ値が正確に表示されること", () => {
    const eventData = createMockEventData({
      fee: 1000,
      capacity: 10,
      attendances_count: 0,
    });

    render(<EventStats eventData={eventData} attendances={[]} payments={[]} />);

    // 全ての値が0と表示されることを確認
    expect(screen.getByTestId("attending-count")).toHaveTextContent("0");
    expect(screen.getByTestId("not-attending-count")).toHaveTextContent("0");
    expect(screen.getByTestId("maybe-count")).toHaveTextContent("0");
    expect(screen.getByTestId("total-revenue")).toHaveTextContent("¥0");
    expect(screen.getByTestId("stripe-revenue")).toHaveTextContent("¥0");
    expect(screen.getByTestId("cash-revenue")).toHaveTextContent("¥0");
    expect(screen.getByTestId("pending-amount")).toHaveTextContent("¥0");
    expect(screen.getByTestId("expected-revenue")).toHaveTextContent("¥0");
    expect(screen.getByTestId("payment-completion-rate")).toHaveTextContent("0%");
    expect(screen.getByTestId("attendance-rate")).toHaveTextContent("0%");
    expect(screen.getByTestId("capacity-exceeded")).toHaveTextContent("定員内");
  });

  // Phase 1修正: completedステータスが売上合計に含まれること
  it("completedステータスが売上合計に含まれること", () => {
    const eventData = createMockEventData({
      title: "無料イベント",
      fee: 0,
      attendances_count: 3,
    });

    const attendances = createMultipleAttendances([{ status: "attending", count: 3 }]);

    const payments = [
      createMockPayment("pay-1", "stripe", 0, "completed"),
      createMockPayment("pay-2", "cash", 0, "completed"),
      createMockPayment("pay-3", "stripe", 1000, "paid"),
    ];

    render(<EventStats eventData={eventData} attendances={attendances} payments={payments} />);

    // 売上合計にcompletedステータスが含まれることを確認（0円 + 0円 + 1000円 = 1000円）
    expect(screen.getByTestId("total-revenue")).toHaveTextContent("¥1,000");
  });

  // Phase 1修正: 決済完了率でfailedとrefundedが分母から除外されること
  it("決済完了率でfailedとrefundedが分母から除外されること", () => {
    const eventData = createMockEventData({ fee: 3000, attendances_count: 6 });
    const attendances = createMultipleAttendances([{ status: "attending", count: 6 }]);
    const payments = [
      createMockPayment("pay-1", "stripe", 3000, "paid"),
      createMockPayment("pay-2", "cash", 3000, "received"),
      createMockPayment("pay-3", "stripe", 3000, "pending"),
      createMockPayment("pay-4", "stripe", 3000, "failed"),
      createMockPayment("pay-5", "stripe", 3000, "refunded"),
      createMockPayment("pay-6", "stripe", 3000, "completed"),
    ];

    render(<EventStats eventData={eventData} attendances={attendances} payments={payments} />);

    // 決済完了率：完了済み3件 / 有効決済4件（failed, refunded除外）= 75%
    expect(screen.getByTestId("payment-completion-rate")).toHaveTextContent("75%");
  });

  // Phase 2修正: 無料イベントでも期待売上が正しく0円となること
  it("無料イベントでも期待売上が正しく0円となること", () => {
    const eventData = createMockEventData({ title: "無料イベント", fee: 0, attendances_count: 5 });
    const attendances = createMultipleAttendances([{ status: "attending", count: 5 }]);

    render(<EventStats eventData={eventData} attendances={attendances} payments={[]} />);

    // 無料イベント（fee=0）では参加者が5人いても期待売上は0円
    expect(screen.getByTestId("expected-revenue")).toHaveTextContent("¥0");
  });

  // 返金・完了情報が表示されること
  it("返金・完了情報が表示されること", () => {
    const eventData = createMockEventData({ fee: 1000, attendances_count: 4 });
    const attendances = createMultipleAttendances([{ status: "attending", count: 4 }]);
    const payments = [
      createMockPayment("pay-1", "stripe", 1000, "refunded"),
      createMockPayment("pay-2", "cash", 0, "completed"),
    ];

    render(<EventStats eventData={eventData} attendances={attendances} payments={payments} />);

    // 返金情報と完了情報が表示されることを確認
    expect(screen.getByTestId("refunded-amount")).toHaveTextContent("¥1,000");
    expect(screen.getByTestId("completed-amount")).toHaveTextContent("¥0");
  });
});
