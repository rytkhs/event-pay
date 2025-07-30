import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParticipationForm } from "@/components/events/participation-form";
import { EventDetail } from "@/lib/utils/invite-token";

// モックイベントデータ
const mockEvent: EventDetail = {
  id: "test-event-id",
  title: "テストイベント",
  description: "テストイベントの説明",
  date: "2025-08-01T10:00:00Z",
  location: "テスト会場",
  fee: 1000,
  capacity: 10,
  attendances_count: 5,
  payment_methods: ["stripe", "cash"],
  payment_deadline: "2025-07-30T23:59:59Z",
  registration_deadline: "2025-07-29T23:59:59Z",
  status: "upcoming",
  invite_token: "test-invite-token",
};

const mockFreeEvent: EventDetail = {
  ...mockEvent,
  fee: 0,
  payment_methods: ["free"],
};

describe("ParticipationForm", () => {
  const mockOnSubmit = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("基本的なフォーム要素が表示される", () => {
    render(
      <ParticipationForm
        event={mockEvent}
        inviteToken="test-token"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByLabelText(/ニックネーム/)).toBeInTheDocument();
    expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
    expect(screen.getByText(/参加ステータス/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /参加申し込みを完了する/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /キャンセル/ })).toBeInTheDocument();
  });

  it("参加ステータスの選択肢が正しく表示される", () => {
    render(
      <ParticipationForm
        event={mockEvent}
        inviteToken="test-token"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText("参加")).toBeInTheDocument();
    expect(screen.getByText("不参加")).toBeInTheDocument();
    expect(screen.getByText("未定")).toBeInTheDocument();
  });

  it("参加を選択した場合に決済方法が表示される", async () => {
    const user = userEvent.setup();

    render(
      <ParticipationForm
        event={mockEvent}
        inviteToken="test-token"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // 参加ボタンをクリック（IDを使用）
    const attendingButton = document.getElementById("attending");
    expect(attendingButton).toBeInTheDocument();
    await user.click(attendingButton!);

    // 決済方法が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/オンライン決済/)).toBeInTheDocument();
      expect(screen.getByText(/現金決済/)).toBeInTheDocument();
    });
  });

  it("無料イベントの場合は決済方法が表示されない", async () => {
    const user = userEvent.setup();

    render(
      <ParticipationForm
        event={mockFreeEvent}
        inviteToken="test-token"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // 参加を選択
    const attendingButton = document.getElementById("attending");
    expect(attendingButton).toBeInTheDocument();
    await user.click(attendingButton!);

    // 決済方法が表示されないことを確認
    expect(screen.queryByText(/決済方法/)).not.toBeInTheDocument();

    // 無料表示があることを確認
    await waitFor(() => {
      expect(screen.getByText("無料")).toBeInTheDocument();
    });
  });

  it("キャンセルボタンクリック時にonCancelが呼ばれる", async () => {
    const user = userEvent.setup();

    render(
      <ParticipationForm
        event={mockEvent}
        inviteToken="test-token"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: /キャンセル/ }));

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it("定員情報が正しく表示される", () => {
    render(
      <ParticipationForm
        event={mockEvent}
        inviteToken="test-token"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText("(定員: 5/10人)")).toBeInTheDocument();
  });

  it("参加費が正しく表示される", async () => {
    const user = userEvent.setup();

    render(
      <ParticipationForm
        event={mockEvent}
        inviteToken="test-token"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // 参加を選択
    const attendingButton = document.getElementById("attending");
    expect(attendingButton).toBeInTheDocument();
    await user.click(attendingButton!);

    // 参加費が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText("1,000円")).toBeInTheDocument();
    });
  });

  it("フォーム入力フィールドが正しく動作する", async () => {
    const user = userEvent.setup();

    render(
      <ParticipationForm
        event={mockEvent}
        inviteToken="test-token"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // ニックネーム入力
    const nicknameInput = screen.getByLabelText(/ニックネーム/);
    await user.type(nicknameInput, "テストユーザー");
    expect(nicknameInput).toHaveValue("テストユーザー");

    // メールアドレス入力
    const emailInput = screen.getByLabelText(/メールアドレス/);
    await user.type(emailInput, "test@example.com");
    expect(emailInput).toHaveValue("test@example.com");
  });

  it("決済方法選択が正しく動作する", async () => {
    const user = userEvent.setup();

    render(
      <ParticipationForm
        event={mockEvent}
        inviteToken="test-token"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // 参加を選択
    const attendingButton = document.getElementById("attending");
    expect(attendingButton).toBeInTheDocument();
    await user.click(attendingButton!);

    // 決済方法が表示されることを確認
    await waitFor(() => {
      expect(screen.getByText(/オンライン決済/)).toBeInTheDocument();
    });

    // Stripe決済を選択
    const stripeButton = document.getElementById("stripe");
    expect(stripeButton).toBeInTheDocument();
    await user.click(stripeButton!);

    // Cash決済を選択
    const cashButton = document.getElementById("cash");
    expect(cashButton).toBeInTheDocument();
    await user.click(cashButton!);
  });

  it("不参加または未定選択時は決済方法が表示されない", async () => {
    const user = userEvent.setup();

    render(
      <ParticipationForm
        event={mockEvent}
        inviteToken="test-token"
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // 不参加を選択
    const notAttendingButton = document.getElementById("not_attending");
    expect(notAttendingButton).toBeInTheDocument();
    await user.click(notAttendingButton!);

    // 決済方法が表示されないことを確認
    expect(screen.queryByText(/決済方法/)).not.toBeInTheDocument();

    // 未定を選択
    const maybeButton = document.getElementById("maybe");
    expect(maybeButton).toBeInTheDocument();
    await user.click(maybeButton!);

    // 決済方法が表示されないことを確認
    expect(screen.queryByText(/決済方法/)).not.toBeInTheDocument();
  });
});
