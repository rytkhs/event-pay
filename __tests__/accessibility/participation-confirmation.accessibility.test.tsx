/**
 * 参加確認ページのアクセシビリティテスト
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { ParticipationConfirmation } from "@/components/events/participation-confirmation";
import { EventDetail } from "@/lib/utils/invite-token";
import { RegisterParticipationData } from "@/app/events/actions/register-participation";
import { UnifiedMockFactory } from "@/__tests__/helpers/unified-mock-factory";

// jest-axeのマッチャーを追加
expect.extend(toHaveNoViolations);

// 共通モックの設定
UnifiedMockFactory.setupCommonMocks();

// クリップボードAPIのモック
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
});

// モックデータ
const mockEvent: EventDetail = {
  id: "test-event-id",
  title: "テストイベント",
  description: "テストイベントの説明",
  date: "2024-12-31T15:00:00Z",
  location: "テスト会場",
  fee: 1000,
  capacity: 50,
  attendances_count: 10,
  registration_deadline: "2024-12-30T23:59:59Z",
  payment_deadline: "2024-12-30T23:59:59Z",
  payment_methods: ["stripe", "cash"],
  status: "published",
  invite_token: "test-invite-token",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockRegistrationData: RegisterParticipationData = {
  attendanceId: "test-attendance-id",
  guestToken: "test-guest-token",
  eventTitle: "テストイベント",
  participantNickname: "テストユーザー",
  participantEmail: "test@example.com",
  attendanceStatus: "attending",
  paymentMethod: "stripe",
  requiresAdditionalPayment: true,
};

const mockProps = {
  registrationData: mockRegistrationData,
  event: mockEvent,
};

describe("ParticipationConfirmation Accessibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // window.location.originをモック
    Object.defineProperty(window, "location", {
      value: { origin: "http://localhost:3000" },
      writable: true,
    });
  });

  describe("ARIA Labels and Roles", () => {
    it("should have proper main landmark and heading structure", () => {
      render(<ParticipationConfirmation {...mockProps} />);

      // メインランドマーク
      const main = screen.getByRole("main");
      expect(main).toHaveAttribute("aria-labelledby");

      // 成功メッセージ
      const successStatus = screen.getByRole("status");
      expect(successStatus).toHaveAttribute("aria-live", "polite");

      // 見出し構造
      const mainHeading = screen.getByRole("heading", { level: 2 });
      expect(mainHeading).toHaveTextContent("参加申し込みが完了しました！");
    });

    it("should have proper region landmarks for different sections", () => {
      render(<ParticipationConfirmation {...mockProps} />);

      // 各セクションがregionとして識別される
      const regions = screen.getAllByRole("region");
      expect(regions.length).toBeGreaterThan(0);

      // 登録内容セクション
      const registrationDetails = screen.getByRole("region", { name: /登録内容/ });
      expect(registrationDetails).toBeInTheDocument();

      // 決済情報セクション
      const paymentInfo = screen.getByRole("region", { name: /決済について/ });
      expect(paymentInfo).toBeInTheDocument();

      // ゲスト管理URLセクション
      const guestUrlSection = screen.getByRole("region", { name: /参加状況の管理/ });
      expect(guestUrlSection).toBeInTheDocument();
    });

    it("should have proper status indicators with ARIA labels", () => {
      render(<ParticipationConfirmation {...mockProps} />);

      // 参加ステータスバッジ
      const statusBadge = screen.getByRole("status", { name: /参加ステータス: 参加/ });
      expect(statusBadge).toBeInTheDocument();

      // 参加費表示
      const feeDisplay = screen.getByText("1,000円");
      expect(feeDisplay).toHaveAttribute("aria-label", "参加費 1,000円");
    });

    it("should have proper note and alert roles for important information", () => {
      render(<ParticipationConfirmation {...mockProps} />);

      // 決済に関する注意事項
      const paymentNote = screen.getByRole("note", { name: /決済に関する重要な注意事項/ });
      expect(paymentNote).toBeInTheDocument();

      // セキュリティ警告
      const securityAlert = screen.getByRole("alert", { name: /セキュリティに関する重要な警告/ });
      expect(securityAlert).toBeInTheDocument();
    });
  });

  describe("Keyboard Navigation", () => {
    it("should support keyboard navigation through interactive elements", async () => {
      const user = userEvent.setup();
      render(<ParticipationConfirmation {...mockProps} />);

      const showUrlButton = screen.getByRole("button", { name: /管理URLを表示/ });

      // Tab順序をテスト
      await user.tab();
      expect(showUrlButton).toHaveFocus();

      // Enterキーでボタンを活性化
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(screen.getByText(/URLを非表示/)).toBeInTheDocument();
      });
    });

    it("should support keyboard navigation within expanded URL section", async () => {
      const user = userEvent.setup();
      render(<ParticipationConfirmation {...mockProps} />);

      // URL表示ボタンをクリック
      const showUrlButton = screen.getByRole("button", { name: /管理URLを表示/ });
      await user.click(showUrlButton);

      await waitFor(async () => {
        // URLテキストボックス
        const urlTextbox = screen.getByRole("textbox", { name: /ゲスト管理URL/ });
        expect(urlTextbox).toBeInTheDocument();
        expect(urlTextbox).toHaveAttribute("tabindex", "0");

        // コピーボタン
        const copyButton = screen.getByRole("button", { name: /URLをコピー/ });
        expect(copyButton).toBeInTheDocument();

        // 新しいタブで開くボタン
        const openButton = screen.getByRole("button", { name: /新しいタブで開く/ });
        expect(openButton).toBeInTheDocument();

        // Tab順序をテスト
        await user.tab();
        expect(urlTextbox).toHaveFocus();

        await user.tab();
        expect(copyButton).toHaveFocus();

        await user.tab();
        expect(openButton).toHaveFocus();
      });
    });

    it("should provide proper focus indicators", async () => {
      const user = userEvent.setup();
      render(<ParticipationConfirmation {...mockProps} />);

      const showUrlButton = screen.getByRole("button", { name: /管理URLを表示/ });

      // フォーカスを設定
      await user.tab();

      // フォーカスリングが表示される
      expect(showUrlButton).toHaveClass("focus:ring-2");
    });
  });

  describe("Screen Reader Compatibility", () => {
    it("should provide proper heading hierarchy", () => {
      render(<ParticipationConfirmation {...mockProps} />);

      // 見出しレベルの確認
      const h2 = screen.getByRole("heading", { level: 2 });
      expect(h2).toHaveTextContent("参加申し込みが完了しました！");

      const h3Elements = screen.getAllByRole("heading", { level: 3 });
      expect(h3Elements.length).toBeGreaterThan(0);

      // 各セクションの見出し
      expect(screen.getByRole("heading", { name: "登録内容" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "決済について" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "参加状況の管理" })).toBeInTheDocument();
    });

    it("should announce button state changes", async () => {
      const user = userEvent.setup();
      render(<ParticipationConfirmation {...mockProps} />);

      const showUrlButton = screen.getByRole("button", { name: /管理URLを表示/ });

      // 初期状態
      expect(showUrlButton).toHaveAttribute("aria-expanded", "false");

      // ボタンをクリック
      await user.click(showUrlButton);

      await waitFor(() => {
        const hideUrlButton = screen.getByRole("button", { name: /URLを非表示/ });
        expect(hideUrlButton).toHaveAttribute("aria-expanded", "true");
        expect(hideUrlButton).toHaveAttribute("aria-controls", "guest-url-content");
      });
    });

    it("should provide live region updates for copy action", async () => {
      const user = userEvent.setup();
      render(<ParticipationConfirmation {...mockProps} />);

      // URL表示
      const showUrlButton = screen.getByRole("button", { name: /管理URLを表示/ });
      await user.click(showUrlButton);

      await waitFor(async () => {
        const copyButton = screen.getByRole("button", { name: /URLをコピー/ });
        await user.click(copyButton);

        // コピー完了のライブリージョン
        const copyStatus = screen.getByText(/URLがクリップボードにコピーされました/);
        expect(copyStatus).toHaveAttribute("aria-live", "polite");
        expect(copyStatus).toHaveClass("sr-only");
      });
    });

    it("should provide descriptive text for icons", () => {
      render(<ParticipationConfirmation {...mockProps} />);

      // アイコンがaria-hiddenでマークされている
      const icons = document.querySelectorAll("svg");
      icons.forEach((icon) => {
        expect(icon).toHaveAttribute("aria-hidden", "true");
      });
    });
  });

  describe("Axe Accessibility Testing", () => {
    it("should not have any accessibility violations", async () => {
      const { container } = render(<ParticipationConfirmation {...mockProps} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("should not have accessibility violations with expanded URL section", async () => {
      const user = userEvent.setup();
      const { container } = render(<ParticipationConfirmation {...mockProps} />);

      // URL表示を展開
      const showUrlButton = screen.getByRole("button", { name: /管理URLを表示/ });
      await user.click(showUrlButton);

      await waitFor(async () => {
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });
    });

    it("should not have accessibility violations for free event", async () => {
      const freeEventProps = {
        ...mockProps,
        event: { ...mockEvent, fee: 0 },
        registrationData: {
          ...mockRegistrationData,
          requiresAdditionalPayment: false,
          paymentMethod: undefined,
        },
      };

      const { container } = render(<ParticipationConfirmation {...freeEventProps} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe("Dynamic Content Accessibility", () => {
    it("should properly handle collapsible content", async () => {
      const user = userEvent.setup();
      render(<ParticipationConfirmation {...mockProps} />);

      const showUrlButton = screen.getByRole("button", { name: /管理URLを表示/ });

      // 初期状態では内容が隠れている
      expect(screen.queryByText(/管理URL:/)).not.toBeInTheDocument();

      // ボタンをクリックして展開
      await user.click(showUrlButton);

      await waitFor(() => {
        // 内容が表示される
        const urlContent = screen.getByText(/管理URL:/);
        expect(urlContent).toBeInTheDocument();

        // aria-controlsで関連付けられている
        const hideUrlButton = screen.getByRole("button", { name: /URLを非表示/ });
        const contentId = hideUrlButton.getAttribute("aria-controls");
        expect(document.getElementById(contentId || "")).toBeInTheDocument();
      });
    });

    it("should maintain focus when content changes", async () => {
      const user = userEvent.setup();
      render(<ParticipationConfirmation {...mockProps} />);

      const showUrlButton = screen.getByRole("button", { name: /管理URLを表示/ });

      // ボタンにフォーカスを設定
      showUrlButton.focus();
      expect(showUrlButton).toHaveFocus();

      // ボタンをクリック
      await user.click(showUrlButton);

      await waitFor(() => {
        // ボタンのテキストが変わってもフォーカスが維持される
        const hideUrlButton = screen.getByRole("button", { name: /URLを非表示/ });
        expect(hideUrlButton).toHaveFocus();
      });
    });
  });

  describe("List Structure", () => {
    it("should use proper list markup for next steps", () => {
      render(<ParticipationConfirmation {...mockProps} />);

      // 次のステップがリストとして構造化されている
      const stepsList = screen.getByRole("list");
      expect(stepsList).toBeInTheDocument();

      const listItems = screen.getAllByRole("listitem");
      expect(listItems.length).toBeGreaterThan(0);
    });

    it("should provide proper list structure for different payment scenarios", () => {
      // 無料イベントの場合
      const freeEventProps = {
        ...mockProps,
        event: { ...mockEvent, fee: 0 },
        registrationData: {
          ...mockRegistrationData,
          requiresAdditionalPayment: false,
          paymentMethod: undefined,
        },
      };

      const { rerender } = render(<ParticipationConfirmation {...freeEventProps} />);

      let listItems = screen.getAllByRole("listitem");
      expect(listItems.length).toBe(2); // 決済ステップがない

      // 有料イベントの場合
      rerender(<ParticipationConfirmation {...mockProps} />);

      listItems = screen.getAllByRole("listitem");
      expect(listItems.length).toBe(3); // 決済ステップがある
    });
  });
});
