/**
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { useEventEditForm } from "@/hooks/use-event-edit-form";
import type { Event } from "@/types/models";

// 依存関係のモック
jest.mock("@/hooks/restrictions/use-event-restrictions", () => ({
  useEventRestrictions: () => ({
    isFieldRestricted: jest.fn(() => false),
    isFieldEditable: jest.fn(() => true),
    getFieldDisplayName: jest.fn((field: string) => field),
    getRestrictionReason: jest.fn(() => ""),
    getRestrictedFields: jest.fn(() => []),
    getRestrictedFieldNames: jest.fn(() => []),
  }),
}));

jest.mock("@/hooks/changes/use-event-changes", () => ({
  useEventChanges: () => ({
    hasChanges: false,
    detectChanges: jest.fn(() => []),
    hasFieldChanged: jest.fn(() => false),
    getChangedFieldNames: jest.fn(() => []),
    getChangeCount: jest.fn(() => 0),
    getChangeSummary: jest.fn(() => ""),
    getChangesByType: jest.fn(() => ({ basic: [], pricing: [], deadlines: [] })),
    hasCriticalChanges: jest.fn(() => false),
    getRevertData: jest.fn(() => ({})),
  }),
}));

jest.mock("@/hooks/submission/use-event-submission", () => ({
  useEventSubmission: () => ({
    submitForm: jest.fn(() => Promise.resolve({ success: true })),
  }),
}));

// タイムゾーンユーティリティのモック
jest.mock("@/lib/utils/timezone", () => ({
  formatUtcToJst: jest.fn((date: Date, format: string) => {
    return date.toISOString().slice(0, 16); // datetime-local形式
  }),
  formatUtcToDatetimeLocal: jest.fn((dateString: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";
      return date.toISOString().slice(0, 16); // datetime-local形式
    } catch {
      return "";
    }
  }),
  formatUtcToJapaneseDisplay: jest.fn((dateString: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }),
}));

// テスト用のイベントデータ
const mockEvent: Event = {
  id: "test-event-id",
  title: "テストイベント",
  description: "テストイベントの説明",
  location: "テスト会場",
  date: "2024-12-31T10:00:00Z",
  fee: 1000,
  capacity: 50,
  payment_methods: ["stripe", "cash"],
  registration_deadline: "2024-12-30T23:59:59Z",
  payment_deadline: "2024-12-30T23:59:59Z",
  created_by: "test-user-id",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  status: "upcoming" as const,
  invite_token: "test-token",
};

describe("useEventEditFormRHF", () => {
  const defaultProps = {
    event: mockEvent,
    attendeeCount: 0,
  };

  describe("初期化", () => {
    it("正しいデフォルト値で初期化される", () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      const formData = result.current.form.getValues();

      expect(formData.title).toBe("テストイベント");
      expect(formData.description).toBe("テストイベントの説明");
      expect(formData.location).toBe("テスト会場");
      expect(formData.fee).toBe("1000");
      expect(formData.capacity).toBe("50");
      expect(formData.payment_methods).toEqual(["stripe", "cash"]);
    });

    it("isPendingが正しく初期化される", () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      expect(result.current.isPending).toBe(false);
    });

    it("hasAttendeesが正しく設定される", () => {
      const { result } = renderHook(() =>
        useEventEditForm({
          ...defaultProps,
          attendeeCount: 5,
        })
      );

      expect(result.current.hasAttendees).toBe(true);
    });
  });

  describe("バリデーション", () => {
    it("タイトルが空の場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      await act(async () => {
        result.current.form.setValue("title", "");
        await result.current.form.trigger("title");
      });

      expect(result.current.form.formState.errors.title).toBeDefined();
      expect(result.current.form.formState.errors.title?.message).toBe("タイトルは必須です");
    });

    it("タイトルが100文字を超える場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      const longTitle = "a".repeat(101);

      await act(async () => {
        result.current.form.setValue("title", longTitle);
        await result.current.form.trigger("title");
      });

      expect(result.current.form.formState.errors.title).toBeDefined();
      expect(result.current.form.formState.errors.title?.message).toBe(
        "タイトルは100文字以内で入力してください"
      );
    });

    it("参加費が数値以外の場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      await act(async () => {
        result.current.form.setValue("fee", "invalid");
        await result.current.form.trigger("fee");
      });

      expect(result.current.form.formState.errors.fee).toBeDefined();
      expect(result.current.form.formState.errors.fee?.message).toBe(
        "参加費は数値で入力してください"
      );
    });

    it("有料イベントで決済方法が選択されていない場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      await act(async () => {
        result.current.form.setValue("fee", "1000"); // 有料イベントに設定
        result.current.form.setValue("payment_methods", []);
        await result.current.form.trigger();
      });

      expect(result.current.form.formState.errors.payment_methods).toBeDefined();
      expect(result.current.form.formState.errors.payment_methods?.message).toBe(
        "有料イベントでは決済方法の選択が必要です"
      );
    });

    it("有効なデータでバリデーションが通る", async () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      // 現在時刻より後の日付を設定
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const futureDateString = futureDate.toISOString().slice(0, 16);

      await act(async () => {
        result.current.form.setValue("title", "テストイベント");
        result.current.form.setValue("fee", "1000");
        result.current.form.setValue("payment_methods", ["stripe"]);
        result.current.form.setValue("date", futureDateString);
        await result.current.form.trigger();
      });

      expect(result.current.form.formState.errors.title).toBeUndefined();
      expect(result.current.form.formState.errors.fee).toBeUndefined();
      expect(result.current.form.formState.errors.payment_methods).toBeUndefined();
      expect(result.current.form.formState.errors.date).toBeUndefined();
    });
  });

  describe("フォーム操作", () => {
    it("resetFormが正しく動作する", async () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      await act(async () => {
        // フォームデータを変更
        result.current.form.setValue("title", "変更されたタイトル");
        result.current.form.setValue("fee", "2000");
      });

      expect(result.current.form.getValues().title).toBe("変更されたタイトル");
      expect(result.current.form.getValues().fee).toBe("2000");

      await act(async () => {
        // リセット実行
        result.current.actions.resetForm();
      });

      expect(result.current.form.getValues().title).toBe("テストイベント");
      expect(result.current.form.getValues().fee).toBe("1000");
    });

    it("getCurrentFormDataが正しいEventFormData形式を返す", () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      const formData = result.current.formData;

      expect(formData.title).toBe("テストイベント");
      expect(formData.fee).toBe("1000"); // 文字列として返される
      expect(formData.capacity).toBe("50"); // 文字列として返される
      expect(formData.payment_methods).toEqual(["stripe", "cash"]);
    });
  });

  describe("制限機能", () => {
    it("isFieldRestrictedが正しく動作する", () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      const isRestricted = result.current.restrictions.isFieldRestricted("title");

      expect(typeof isRestricted).toBe("boolean");
    });

    it("isFieldEditableが正しく動作する", () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      const isEditable = result.current.restrictions.isFieldEditable("title");

      expect(typeof isEditable).toBe("boolean");
    });
  });

  describe("変更検出", () => {
    it("detectChangesが正しく動作する", () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      const changes = result.current.changes.detectChanges();

      expect(Array.isArray(changes)).toBe(true);
    });

    it("getChangeCountが正しく動作する", () => {
      const { result } = renderHook(() => useEventEditForm(defaultProps));

      const changeCount = result.current.changes.getChangeCount();

      expect(typeof changeCount).toBe("number");
    });
  });

  // 複雑なバリデーション状態テストは統合テストに移譲
  // 参照: __tests__/integration/event-edit-form.integration.test.tsx
});
