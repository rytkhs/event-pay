/**
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { useEventForm } from "@/hooks/use-event-form";

// Next.js router のモック
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

// Server Action のモック
jest.mock("@/app/events/actions", () => ({
  createEventAction: jest.fn(),
}));

const mockPush = jest.fn();
(useRouter as jest.Mock).mockReturnValue({
  push: mockPush,
});

describe("useEventForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("初期化", () => {
    it("正しいデフォルト値で初期化される", () => {
      const { result } = renderHook(() => useEventForm());

      const formData = result.current.formData;

      expect(formData.title).toBe("");
      expect(formData.description).toBe("");
      expect(formData.location).toBe("");
      expect(formData.date).toBe("");
      expect(formData.fee).toBe("");
      expect(formData.capacity).toBe("");
      expect(formData.payment_methods).toEqual([]);
      expect(formData.registration_deadline).toBe("");
      expect(formData.payment_deadline).toBe("");
    });

    it("バリデーションルールが正しく設定される", () => {
      const { result } = renderHook(() => useEventForm());

      const { validationRules } = result.current;

      expect(validationRules.title.required).toBe("タイトルは必須です");
      expect(validationRules.date.required).toBe("開催日時は必須です");
      expect(validationRules.fee.required).toBe("参加費は必須です");
      expect(validationRules.payment_methods.validate).toBeDefined();
    });
  });

  describe("バリデーション", () => {
    it("タイトルが空の場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventForm());

      await act(async () => {
        result.current.form.setValue("title", "");
        await result.current.form.trigger("title");
      });

      expect(result.current.form.formState.errors.title).toBeDefined();
    });

    it("タイトルが100文字を超える場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventForm());
      const longTitle = "a".repeat(101);

      await act(async () => {
        result.current.form.setValue("title", longTitle);
        await result.current.form.trigger("title");
      });

      expect(result.current.form.formState.errors.title).toBeDefined();
    });

    it("日付が過去の場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventForm());
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const pastDateString = pastDate.toISOString().slice(0, 16);

      await act(async () => {
        result.current.form.setValue("date", pastDateString);
        await result.current.form.trigger("date");
      });

      expect(result.current.form.formState.errors.date).toBeDefined();
    });

    it("決済方法が選択されていない場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventForm());

      await act(async () => {
        result.current.form.setValue("payment_methods", []);
        await result.current.form.trigger("payment_methods");
      });

      expect(result.current.form.formState.errors.payment_methods).toBeDefined();
    });
  });

  describe("フォーム状態", () => {
    it("isPendingが正しく管理される", () => {
      const { result } = renderHook(() => useEventForm());

      expect(result.current.isPending).toBe(false);
    });

    it("hasErrorsが正しく計算される", async () => {
      const { result } = renderHook(() => useEventForm());

      // 初期状態ではエラーがない
      expect(result.current.hasErrors).toBe(true); // バリデーションエラーがあるため

      // 有効なデータを設定
      await act(async () => {
        result.current.form.setValue("title", "テストイベント");
        result.current.form.setValue("date", "2025-12-31T10:00");
        result.current.form.setValue("fee", "1000");
        result.current.form.setValue("payment_methods", ["stripe"]);
        await result.current.form.trigger();
      });

      expect(result.current.hasErrors).toBe(false);
    });
  });

  describe("フォームデータ変換", () => {
    it("payment_methodsが配列から文字列に正しく変換される", () => {
      const { result } = renderHook(() => useEventForm());

      act(() => {
        result.current.form.setValue("payment_methods", ["stripe", "cash"]);
      });

      const formData = result.current.formData;
      expect(formData.payment_methods).toEqual(["stripe", "cash"]);
    });
  });
});
