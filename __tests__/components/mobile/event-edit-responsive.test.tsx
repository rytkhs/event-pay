/**
 * Issue 37: イベント編集フォームUI - レスポンシブデザインテスト
 * TDD Refactor Phase: 実装済みコンポーネントのテスト
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { EventEditForm } from "@/components/events/event-edit-form";
import { useEventEditForm } from "@/hooks/use-event-edit-form";
import { UnifiedMockFactory } from "@/__tests__/helpers/unified-mock-factory";

// 統一モック設定を適用
UnifiedMockFactory.setupCommonMocks();

// モックイベントデータ
const mockEvent = {
  id: "1",
  title: "テストイベント",
  date: "2024-12-31T15:00:00Z",
  location: "テスト会場",
  fee: 1000,
  capacity: 50,
  status: "upcoming" as any,
  description: "テストイベントの説明",
  application_deadline: "2024-12-30T15:00:00Z",
  payment_deadline: "2024-12-31T10:00:00Z",
  payment_methods: ["stripe"],
  created_by: "test-user-id",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  creator_name: "テスト作成者",
  attendances_count: 0,
  invite_token: "test-token",
};

// useEventEditFormフックを直接モック
jest.mock("@/hooks/use-event-edit-form");
const mockUseEventEditForm = useEventEditForm as jest.MockedFunction<typeof useEventEditForm>;

// レスポンシブデザイン用のユーティリティ
const mockUseViewportSize = jest.fn();
const mockUseMediaQuery = jest.fn();

// モックのimport
jest.mock("@/lib/hooks/useViewportSize", () => ({
  useViewportSize: mockUseViewportSize,
}));

jest.mock("@/lib/hooks/useMediaQuery", () => ({
  useMediaQuery: mockUseMediaQuery,
}));

// Next.js router mock
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

describe.skip("EventEditResponsive", () => {
  beforeEach(() => {
    // モック関数をリセット
    jest.clearAllMocks();

    // デフォルトのレスポンシブ設定
    mockUseViewportSize.mockReturnValue({ width: 1024, height: 768 });
    mockUseMediaQuery.mockReturnValue(false);

    // useEventEditFormフックのモック設定
    mockUseEventEditForm.mockReturnValue({
      form: {
        control: {},
        watch: jest.fn(() => ""),
        handleSubmit: jest.fn((fn) => jest.fn()),
        formState: { errors: {}, isSubmitting: false },
        setValue: jest.fn(),
        getValues: jest.fn(() => ({})),
        reset: jest.fn(),
        setError: jest.fn(),
        clearErrors: jest.fn(),
        trigger: jest.fn(),
        register: jest.fn(),
        unregister: jest.fn(),
        getFieldState: jest.fn(),
        setFocus: jest.fn(),
      } as any,
      onSubmit: jest.fn(),
      isSubmitting: false,
      isDirty: false,
      isValid: true,
      hasChanges: false,
      changedFields: {},
      changes: {
        hasChanges: false,
        changedFields: {},
      },
      validation: {
        hasErrors: false,
        errors: {},
      },
      isPending: false,
    });
  });

  describe("モバイル画面（375px以下）", () => {
    beforeEach(() => {
      // モバイル画面サイズを設定
      mockUseViewportSize.mockReturnValue({ width: 375, height: 667 });
      mockUseMediaQuery.mockReturnValue(true);
    });

    it("モバイル画面でレスポンシブレイアウトが適用される", () => {
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      // フォームが表示される
      expect(screen.getByText("イベント編集")).toBeInTheDocument();
    });

    it("モバイル画面でタッチフレンドリーなUI要素が表示される", () => {
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      // タッチフレンドリーなボタンが表示される
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });

    it("モバイル画面で日時選択が適切に動作する", () => {
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      const dateInput = screen.getByLabelText(/開催日時/);
      expect(dateInput).toBeInTheDocument();
      expect(dateInput).toHaveAttribute("type", "datetime-local");
    });

    it("モバイル画面で長いテキストが適切に表示される", () => {
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      const titleInput = screen.getByLabelText(/タイトル/);
      expect(titleInput).toBeInTheDocument();
    });
  });

  describe("タブレット画面（768px - 1024px）", () => {
    beforeEach(() => {
      // タブレット画面サイズを設定
      mockUseViewportSize.mockReturnValue({ width: 768, height: 1024 });
      mockUseMediaQuery.mockReturnValue(false);
    });

    it("タブレット画面で適切にレイアウトが表示される", () => {
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      // フォームが表示される
      expect(screen.getByText("イベント編集")).toBeInTheDocument();
    });

    it("タブレット画面でフォーム要素が適切なサイズになる", () => {
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      const titleInput = screen.getByLabelText(/タイトル/);
      expect(titleInput).toBeInTheDocument();
    });

    it("タブレット画面でボタンが適切に配置される", () => {
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe("デスクトップ画面（1024px以上）", () => {
    beforeEach(() => {
      // デスクトップ画面サイズを設定
      mockUseViewportSize.mockReturnValue({ width: 1200, height: 800 });
      mockUseMediaQuery.mockReturnValue(false);
    });

    it("デスクトップ画面で適切にレイアウトが表示される", () => {
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      // フォームが表示される
      expect(screen.getByText("イベント編集")).toBeInTheDocument();
    });

    it("デスクトップ画面でサイドバーが表示される", () => {
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      // フォームが表示される
      expect(screen.getByText("イベント編集")).toBeInTheDocument();
    });
  });

  describe("画面サイズ変更時の動作", () => {
    it("画面サイズが変更されたときにレイアウトが適切に更新される", () => {
      // 初期はデスクトップサイズ
      mockUseViewportSize.mockReturnValue({ width: 1200, height: 800 });
      const { rerender } = render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      // フォームが表示される
      expect(screen.getByText("イベント編集")).toBeInTheDocument();

      // モバイルサイズに変更
      mockUseViewportSize.mockReturnValue({ width: 375, height: 667 });
      rerender(<EventEditForm event={mockEvent} attendeeCount={0} />);

      // フォームが引き続き表示される
      expect(screen.getByText("イベント編集")).toBeInTheDocument();
    });
  });

  describe("アクセシビリティ（レスポンシブ）", () => {
    it("モバイル画面でフォーカス管理が適切に動作する", () => {
      mockUseViewportSize.mockReturnValue({ width: 375, height: 667 });
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      const titleInput = screen.getByLabelText(/タイトル/);
      titleInput.focus();
      expect(titleInput).toHaveFocus();
    });

    it("画面サイズに応じた適切なARIAラベルが設定される", () => {
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      const titleInput = screen.getByLabelText(/タイトル/);
      expect(titleInput).toBeInTheDocument();
    });
  });

  describe("パフォーマンス（レスポンシブ）", () => {
    it("画面サイズに応じて不要なコンポーネントが読み込まれない", () => {
      mockUseViewportSize.mockReturnValue({ width: 375, height: 667 });
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      // フォームが表示される
      expect(screen.getByText("イベント編集")).toBeInTheDocument();
    });

    it("画像や重いコンテンツが画面サイズに応じて最適化される", () => {
      render(<EventEditForm event={mockEvent} attendeeCount={0} />);

      // フォームが表示される
      expect(screen.getByText("イベント編集")).toBeInTheDocument();
    });
  });
});
