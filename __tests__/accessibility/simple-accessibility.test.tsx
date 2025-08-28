/**
 * 簡単なアクセシビリティテスト
 */

import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { ParticipationForm } from "@/components/events/participation-form";
import { ParticipationConfirmation } from "@/components/events/participation-confirmation";
import { EventDetail } from "@/lib/utils/invite-token";
import { RegisterParticipationData } from "@/app/events/actions/register-participation";
import { ToastProvider } from "@/contexts/toast-context";
import { UnifiedMockFactory } from "@/__tests__/helpers/unified-mock-factory";

// jest-axeのマッチャーを追加
expect.extend(toHaveNoViolations);

// 共通モックの設定
UnifiedMockFactory.setupCommonMocks();

// テスト用のラッパーコンポーネント
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

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

describe("Basic Accessibility Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // window.location.originをモック
    delete (window as any).location;
    (window as any).location = { origin: "http://localhost:3000" };
  });

  describe("ParticipationForm", () => {
    const mockProps = {
      event: mockEvent,
      inviteToken: "test-invite-token",
      onSubmit: jest.fn(),
      onCancel: jest.fn(),
      isSubmitting: false,
    };

    it("should render without accessibility violations", async () => {
      const { container } = render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("should have proper form structure", () => {
      render(<ParticipationForm {...mockProps} />, { wrapper: TestWrapper });

      // フォームが存在する
      expect(screen.getByRole("form")).toBeInTheDocument();

      // 見出しが存在する
      expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();

      // 必須フィールドが適切にマークされている
      expect(screen.getByLabelText(/ニックネーム/)).toHaveAttribute("aria-required", "true");
      expect(screen.getByLabelText(/メールアドレス/)).toHaveAttribute("aria-required", "true");
    });
  });

  describe("ParticipationConfirmation", () => {
    const mockProps = {
      registrationData: mockRegistrationData,
      event: mockEvent,
    };

    it("should render without accessibility violations", async () => {
      const { container } = render(<ParticipationConfirmation {...mockProps} />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("should have proper landmark structure", () => {
      render(<ParticipationConfirmation {...mockProps} />);

      // メインランドマークが存在する
      expect(screen.getByRole("main")).toBeInTheDocument();

      // ステータス表示が存在する（複数ある場合は最初のものを取得）
      expect(screen.getAllByRole("status")[0]).toBeInTheDocument();

      // 見出し構造が適切
      expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    });
  });
});
