/**
 * 参加フォームのアクセシビリティテスト
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { ParticipationForm } from "@/components/events/participation-form";
import { EventDetail } from "@/lib/utils/invite-token";
import { ToastProvider } from "@/contexts/toast-context";
import { UnifiedMockFactory } from "@/__tests__/helpers/unified-mock-factory";

// jest-axeのマッチャーを追加
expect.extend(toHaveNoViolations);

// テスト用のラッパーコンポーネント
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

// 共通モックの設定
UnifiedMockFactory.setupCommonMocks();

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

const mockProps = {
  event: mockEvent,
  inviteToken: "test-invite-token",
  onSubmit: jest.fn(),
  onCancel: jest.fn(),
  isSubmitting: false,
};

describe("ParticipationForm Accessibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("ARIA Labels and Roles", () => {
    it("should have proper ARIA labels for form elements", () => {
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      // フォームのラベル
      expect(screen.getByRole("form")).toHaveAttribute("aria-labelledby");
      expect(screen.getByRole("form")).toHaveAttribute("aria-describedby");

      // 必須フィールドのマーク
      const requiredFields = screen.getAllByText("*");
      requiredFields.forEach((field) => {
        expect(field).toHaveAttribute("aria-label", "必須項目");
      });

      // ラジオグループ
      const attendanceRadioGroup = screen.getByRole("radiogroup", { name: /参加ステータス/ });
      expect(attendanceRadioGroup).toHaveAttribute("aria-required", "true");
      expect(attendanceRadioGroup).toHaveAttribute("aria-labelledby");
    });

    it("should have proper ARIA attributes for input fields", () => {
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      // ニックネーム入力
      const nicknameInput = screen.getByLabelText(/ニックネーム/);
      expect(nicknameInput).toHaveAttribute("aria-required", "true");
      expect(nicknameInput).toHaveAttribute("aria-invalid", "false");

      // メールアドレス入力
      const emailInput = screen.getByLabelText(/メールアドレス/);
      expect(emailInput).toHaveAttribute("aria-required", "true");
      expect(emailInput).toHaveAttribute("aria-invalid", "false");
    });

    it("should update ARIA attributes when validation fails", async () => {
      const user = userEvent.setup();
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      const nicknameInput = screen.getByLabelText(/ニックネーム/);

      // 無効な値を入力
      await user.type(nicknameInput, "a");
      await user.clear(nicknameInput);
      await user.tab();

      await waitFor(() => {
        expect(nicknameInput).toHaveAttribute("aria-invalid", "true");
        expect(nicknameInput).toHaveAttribute("aria-describedby");
      });
    });

    it("should have proper error message associations", async () => {
      const user = userEvent.setup();
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      const emailInput = screen.getByLabelText(/メールアドレス/);

      // 無効なメールアドレスを入力
      await user.type(emailInput, "invalid-email");
      await user.tab();

      await waitFor(() => {
        const errorMessage = screen.getByRole("alert");
        expect(errorMessage).toBeInTheDocument();
        expect(emailInput).toHaveAttribute("aria-describedby", expect.stringContaining("error"));
      });
    });
  });

  describe("Keyboard Navigation", () => {
    it("should support keyboard navigation through form elements", async () => {
      const user = userEvent.setup();
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      const nicknameInput = screen.getByLabelText(/ニックネーム/);
      const emailInput = screen.getByLabelText(/メールアドレス/);
      const attendingRadio = screen.getByLabelText(/参加/);

      // Tab順序をテスト
      await user.tab();
      expect(nicknameInput).toHaveFocus();

      await user.tab();
      expect(emailInput).toHaveFocus();

      await user.tab();
      expect(attendingRadio).toHaveFocus();
    });

    it("should support Enter and Space key activation for radio buttons", async () => {
      const user = userEvent.setup();
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      const attendingRadio = screen.getByLabelText(/参加/);

      // フォーカスを設定
      attendingRadio.focus();

      // Spaceキーで選択
      await user.keyboard(" ");
      expect(attendingRadio).toBeChecked();
    });

    it("should support arrow key navigation within radio groups", async () => {
      const user = userEvent.setup();
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      const attendingRadio = screen.getByLabelText(/参加/);
      const notAttendingRadio = screen.getByLabelText(/不参加/);

      // 最初のラジオボタンにフォーカス
      attendingRadio.focus();

      // 矢印キーで次のオプションに移動
      await user.keyboard("{ArrowDown}");
      expect(notAttendingRadio).toHaveFocus();
    });

    it("should trap focus within form when submitting", async () => {
      const user = userEvent.setup();
      const mockSubmit = jest
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      render(<ParticipationForm {...mockProps} onSubmit={mockSubmit} />, { wrapper: TestWrapper });

      // フォームを入力
      await user.type(screen.getByLabelText(/ニックネーム/), "テストユーザー");
      await user.type(screen.getByLabelText(/メールアドレス/), "test@example.com");
      await user.click(screen.getByLabelText(/参加/));

      const submitButton = screen.getByRole("button", { name: /参加申し込みを完了する/ });
      await user.click(submitButton);

      // 送信中はボタンが無効化される
      expect(submitButton).toBeDisabled();
    });
  });

  describe("Screen Reader Compatibility", () => {
    it("should have proper heading structure", () => {
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      const mainHeading = screen.getByRole("heading", { level: 3 });
      expect(mainHeading).toHaveTextContent("参加申し込み");
    });

    it("should provide status updates for form submission", async () => {
      const user = userEvent.setup();
      const mockSubmit = jest
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      render(<ParticipationForm {...mockProps} onSubmit={mockSubmit} />, { wrapper: TestWrapper });

      // フォームを入力
      await user.type(screen.getByLabelText(/ニックネーム/), "テストユーザー");
      await user.type(screen.getByLabelText(/メールアドレス/), "test@example.com");
      await user.click(screen.getByLabelText(/参加/));

      const submitButton = screen.getByRole("button", { name: /参加申し込みを完了する/ });
      await user.click(submitButton);

      // 送信中のステータスが表示される
      expect(screen.getByText("申し込み中...")).toBeInTheDocument();

      // aria-live領域でステータスが通知される
      const statusElement = screen.getByText(/申し込みを処理中です/);
      expect(statusElement).toHaveAttribute("aria-live", "polite");
    });

    it("should announce errors to screen readers", async () => {
      const user = userEvent.setup();
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      const emailInput = screen.getByLabelText(/メールアドレス/);

      // 無効なメールアドレスを入力
      await user.type(emailInput, "invalid-email");
      await user.tab();

      await waitFor(() => {
        const errorMessage = screen.getByRole("alert");
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveTextContent(/有効なメールアドレス/);
      });
    });

    it("should provide descriptive labels for payment methods", async () => {
      const user = userEvent.setup();
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      // 参加を選択して決済方法を表示
      await user.click(screen.getByLabelText(/参加/));

      await waitFor(() => {
        const stripeOption = screen.getByLabelText(/クレジットカード/);
        const cashOption = screen.getByLabelText(/現金/);

        expect(stripeOption).toHaveAttribute("aria-describedby");
        expect(cashOption).toHaveAttribute("aria-describedby");
      });
    });
  });

  describe("Axe Accessibility Testing", () => {
    it("should not have any accessibility violations", async () => {
      const { container } = render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("should not have accessibility violations with error state", async () => {
      const user = userEvent.setup();
      const { container } = render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      // エラー状態を作成
      const emailInput = screen.getByLabelText(/メールアドレス/);
      await user.type(emailInput, "invalid-email");
      await user.tab();

      await waitFor(async () => {
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });
    });

    it("should not have accessibility violations with payment method selection", async () => {
      const user = userEvent.setup();
      const { container } = render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      // 参加を選択して決済方法を表示
      await user.click(screen.getByLabelText(/参加/));

      await waitFor(async () => {
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });
    });
  });

  describe("Focus Management", () => {
    it("should maintain focus order when payment method section appears", async () => {
      const user = userEvent.setup();
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      const attendingRadio = screen.getByLabelText(/参加/);

      // 参加を選択
      await user.click(attendingRadio);

      await waitFor(() => {
        // 決済方法セクションが表示される
        const paymentMethodGroup = screen.getByRole("radiogroup", { name: /決済方法/ });
        expect(paymentMethodGroup).toBeInTheDocument();

        // フォーカス順序が維持される
        const stripeOption = screen.getByLabelText(/クレジットカード/);
        expect(stripeOption).toBeInTheDocument();
      });
    });

    it("should provide visible focus indicators", async () => {
      const user = userEvent.setup();
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      const nicknameInput = screen.getByLabelText(/ニックネーム/);

      // フォーカスを設定
      await user.click(nicknameInput);

      // フォーカスリングが表示される（CSSクラスで確認）
      expect(nicknameInput).toHaveClass("focus:ring-2");
    });
  });

  describe("Error Handling Accessibility", () => {
    it("should associate error messages with form fields", async () => {
      const user = userEvent.setup();
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      const nicknameInput = screen.getByLabelText(/ニックネーム/);

      // 空の値でフォーカスを外す
      await user.click(nicknameInput);
      await user.tab();

      await waitFor(() => {
        const errorMessage = screen.getByRole("alert");
        expect(errorMessage).toBeInTheDocument();

        const errorId = errorMessage.getAttribute("id");
        expect(nicknameInput).toHaveAttribute(
          "aria-describedby",
          expect.stringContaining(errorId || "")
        );
      });
    });

    it("should announce form-level errors", async () => {
      const mockSubmit = jest.fn().mockRejectedValue(new Error("Network error"));
      const user = userEvent.setup();

      render(<ParticipationForm {...mockProps} onSubmit={mockSubmit} />, { wrapper: TestWrapper });

      // フォームを入力して送信
      await user.type(screen.getByLabelText(/ニックネーム/), "テストユーザー");
      await user.type(screen.getByLabelText(/メールアドレス/), "test@example.com");
      await user.click(screen.getByLabelText(/参加/));

      const submitButton = screen.getByRole("button", { name: /参加申し込みを完了する/ });
      await user.click(submitButton);

      await waitFor(() => {
        const errorAlert = screen.getByRole("alert");
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveAttribute("aria-live", "polite");
      });
    });
  });
});
