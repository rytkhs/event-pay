import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParticipationConfirmation } from "@/components/events/participation-confirmation";
import { type RegisterParticipationData } from "@/app/events/actions/register-participation";
import { type EventDetail } from "@/lib/utils/invite-token";

// モック設定
const mockEventDetail: EventDetail = {
  id: "test-event-id",
  title: "テストイベント",
  description: "テストイベントの説明",
  date: "2024-12-31T15:00:00Z",
  location: "テスト会場",
  fee: 1000,
  capacity: 50,
  attendances_count: 10,
  status: "upcoming",
  registration_deadline: "2024-12-30T23:59:59Z",
  payment_deadline: "2024-12-29T23:59:59Z",
  payment_methods: ["stripe", "cash"],
  invite_token: "test-invite-token",
  created_by: "test-organizer-id",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockRegistrationDataAttending: RegisterParticipationData = {
  attendanceId: "test-attendance-id",
  guestToken: "test-guest-token-123456789",
  requiresAdditionalPayment: true,
  eventTitle: "テストイベント",
  participantNickname: "テストユーザー",
  participantEmail: "test@example.com",
  attendanceStatus: "attending",
  paymentMethod: "stripe",
};

const mockRegistrationDataNotAttending: RegisterParticipationData = {
  attendanceId: "test-attendance-id-2",
  guestToken: "test-guest-token-987654321",
  requiresAdditionalPayment: false,
  eventTitle: "テストイベント",
  participantNickname: "テストユーザー2",
  participantEmail: "test2@example.com",
  attendanceStatus: "not_attending",
};

const mockRegistrationDataCash: RegisterParticipationData = {
  attendanceId: "test-attendance-id-3",
  guestToken: "test-guest-token-cash123",
  requiresAdditionalPayment: true,
  eventTitle: "テストイベント",
  participantNickname: "テストユーザー3",
  participantEmail: "test3@example.com",
  attendanceStatus: "attending",
  paymentMethod: "cash",
};

// Clipboard APIのモック
const mockWriteText = jest.fn(() => Promise.resolve());
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

// window.isSecureContextのモック
Object.defineProperty(window, "isSecureContext", {
  writable: true,
  value: true,
});

// window.openのモック
Object.defineProperty(window, "open", {
  writable: true,
  value: jest.fn(),
});

describe("ParticipationConfirmation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteText.mockClear();
    // 環境変数のモック
    process.env.NEXT_PUBLIC_APP_URL = "https://test.example.com";
  });

  describe("基本表示", () => {
    it("参加登録完了メッセージが表示される", () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      expect(screen.getByText("参加申し込みが完了しました！")).toBeInTheDocument();
      expect(screen.getByText("ご登録いただいた内容を確認してください")).toBeInTheDocument();
    });

    it("登録内容が正しく表示される", () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      expect(screen.getByText("テストイベント")).toBeInTheDocument();
      expect(screen.getByText("テストユーザー")).toBeInTheDocument();
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
      expect(screen.getByText("参加")).toBeInTheDocument();
      expect(screen.getByText("オンライン決済")).toBeInTheDocument();
      expect(screen.getByText("1,000円")).toBeInTheDocument();
    });

    it("不参加の場合は決済情報が表示されない", () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataNotAttending}
          event={mockEventDetail}
        />
      );

      expect(screen.getByText("不参加")).toBeInTheDocument();
      expect(screen.queryByText("決済について")).not.toBeInTheDocument();
      expect(screen.queryByText("1,000円")).not.toBeInTheDocument();
    });
  });

  describe("決済情報表示", () => {
    it("Stripe決済の場合の案内が表示される", () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      expect(screen.getByText("決済について")).toBeInTheDocument();
      expect(screen.getByText("クレジットカード決済を選択されました。")).toBeInTheDocument();
      expect(
        screen.getByText((content, element) => {
          return content.includes("決済手続きのご案内を登録されたメールアドレスにお送りします");
        })
      ).toBeInTheDocument();
    });

    it("現金決済の場合の案内が表示される", () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataCash}
          event={mockEventDetail}
        />
      );

      expect(screen.getByText("決済について")).toBeInTheDocument();
      expect(screen.getByText("現金決済を選択されました。")).toBeInTheDocument();
      expect(
        screen.getByText((content, element) => {
          return content.includes("イベント当日に会場にて現金でお支払いください");
        })
      ).toBeInTheDocument();
    });
  });

  describe("ゲスト管理URL", () => {
    it("管理URLの表示/非表示が切り替えられる", async () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      const toggleButton = screen.getByText("管理URLを表示");
      expect(toggleButton).toBeInTheDocument();

      // URLは最初は表示されていない
      expect(screen.queryByText(/https:\/\/test\.example\.com\/guest\//)).not.toBeInTheDocument();

      // ボタンをクリックしてURLを表示
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(
          screen.getByText("https://test.example.com/guest/test-guest-token-123456789")
        ).toBeInTheDocument();
      });

      // ボタンのテキストが変更される
      expect(screen.getByText("URLを非表示")).toBeInTheDocument();

      // 再度クリックして非表示
      fireEvent.click(screen.getByText("URLを非表示"));

      await waitFor(() => {
        expect(screen.queryByText(/https:\/\/test\.example\.com\/guest\//)).not.toBeInTheDocument();
      });
    });

    it("URLをクリップボードにコピーできる", async () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      // URLを表示
      fireEvent.click(screen.getByText("管理URLを表示"));

      await waitFor(() => {
        expect(screen.getByText("URLをコピー")).toBeInTheDocument();
      });

      // コピーボタンをクリック
      fireEvent.click(screen.getByText("URLをコピー"));

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith(
          "https://test.example.com/guest/test-guest-token-123456789"
        );
      });

      // コピー完了メッセージが表示される
      await waitFor(() => {
        expect(screen.getByText("コピー済み")).toBeInTheDocument();
      });
    });

    it("新しいタブでURLを開ける", async () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      // URLを表示
      fireEvent.click(screen.getByText("管理URLを表示"));

      await waitFor(() => {
        expect(screen.getByText("新しいタブで開く")).toBeInTheDocument();
      });

      // 新しいタブで開くボタンをクリック
      fireEvent.click(screen.getByText("新しいタブで開く"));

      expect(window.open).toHaveBeenCalledWith(
        "https://test.example.com/guest/test-guest-token-123456789",
        "_blank"
      );
    });
  });

  describe("イベント詳細情報", () => {
    it("イベント詳細が正しく表示される", () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      expect(screen.getByText("イベント詳細")).toBeInTheDocument();
      expect(screen.getByText("テスト会場")).toBeInTheDocument();

      // 日時の表示を確認（フォーマットされた日時）
      expect(screen.getByText(/2025年01月01日/)).toBeInTheDocument();
    });

    it("申込締切と決済締切が表示される", () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      expect(screen.getByText("申込締切")).toBeInTheDocument();
      expect(screen.getByText("決済締切")).toBeInTheDocument();
    });
  });

  describe("次のステップ", () => {
    it("決済が必要な場合のステップが表示される", () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      expect(screen.getByText("次のステップ")).toBeInTheDocument();
      expect(screen.getByText("決済手続き")).toBeInTheDocument();
      expect(screen.getByText("イベント当日")).toBeInTheDocument();
      expect(screen.getByText("参加状況の変更")).toBeInTheDocument();
    });

    it("決済が不要な場合はステップ番号が調整される", () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataNotAttending}
          event={mockEventDetail}
        />
      );

      expect(screen.getByText("次のステップ")).toBeInTheDocument();
      expect(screen.queryByText("決済手続き")).not.toBeInTheDocument();

      // 決済不要の場合、イベント当日が1番になる
      const eventDayStep = screen.getByText("イベント当日").closest(".flex");
      expect(eventDayStep?.querySelector(".bg-blue-600")?.textContent).toBe("1");
    });
  });

  describe("セキュリティ警告", () => {
    it("管理URLのセキュリティ警告が表示される", async () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      expect(
        screen.getByText((content, element) => {
          return content.includes("この管理URLは他の人と共有しないでください");
        })
      ).toBeInTheDocument();
    });

    it("決済に関する注意事項が表示される", () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      expect(
        screen.getByText((content, element) => {
          return content.includes("決済が完了するまで参加登録は仮登録状態となります");
        })
      ).toBeInTheDocument();
    });
  });

  describe("アクセシビリティ", () => {
    it("適切なheading構造を持つ", () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      const headings = screen.getAllByRole("heading");
      expect(headings.length).toBeGreaterThan(0);

      // メインの見出しが存在する
      expect(
        screen.getByRole("heading", { name: /参加申し込みが完了しました/ })
      ).toBeInTheDocument();
    });

    it("ボタンに適切なaria-labelが設定されている", async () => {
      render(
        <ParticipationConfirmation
          registrationData={mockRegistrationDataAttending}
          event={mockEventDetail}
        />
      );

      // URLを表示
      fireEvent.click(screen.getByText("管理URLを表示"));

      await waitFor(() => {
        const copyButton = screen.getByText("URLをコピー");
        const openButton = screen.getByText("新しいタブで開く");

        expect(copyButton).toBeInTheDocument();
        expect(openButton).toBeInTheDocument();
      });
    });
  });
});
