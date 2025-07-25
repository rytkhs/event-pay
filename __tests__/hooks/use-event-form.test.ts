/**
 * @jest-environment jsdom
 */

import { UnifiedMockFactory } from "@/__tests__/helpers/unified-mock-factory";
import { renderHook, act } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { useEventForm } from "@/hooks/use-event-form";

// 統一モック設定を適用
UnifiedMockFactory.setupCommonMocks();

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

    it("フォームオブジェクトが正しく初期化される", () => {
      const { result } = renderHook(() => useEventForm());

      expect(result.current.form).toBeDefined();
      expect(result.current.onSubmit).toBeDefined();
      expect(result.current.isPending).toBe(false);
      expect(result.current.hasErrors).toBeDefined();
    });
  });

  describe("バリデーション", () => {
    it("タイトルが空の場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventForm());

      await act(async () => {
        result.current.form.setValue("title", "");
        await result.current.form.trigger("title");
      });

      expect(result.current.form.formState.errors.title?.message).toBe("タイトルは必須です");
    });

    it("タイトルが100文字を超える場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventForm());
      const longTitle = "a".repeat(101);

      await act(async () => {
        result.current.form.setValue("title", longTitle);
        await result.current.form.trigger("title");
      });

      expect(result.current.form.formState.errors.title?.message).toBe(
        "タイトルは100文字以内で入力してください"
      );
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

      expect(result.current.form.formState.errors.date?.message).toBe(
        "開催日時は現在時刻より後である必要があります"
      );
    });

    it("有料イベントで決済方法が選択されていない場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventForm());

      await act(async () => {
        result.current.form.setValue("fee", "1000");
        result.current.form.setValue("payment_methods", []);
        await result.current.form.trigger();
      });

      expect(result.current.form.formState.errors.payment_methods?.message).toBe(
        "有料イベントでは決済方法の選択が必要です"
      );
    });

    it("参加費が負の数の場合、エラーメッセージが表示される", async () => {
      const { result } = renderHook(() => useEventForm());

      await act(async () => {
        result.current.form.setValue("fee", "-100");
        await result.current.form.trigger("fee");
      });

      expect(result.current.form.formState.errors.fee?.message).toBe(
        "参加費は0以上1000000以下である必要があります"
      );
    });
  });

  describe("フォーム状態", () => {
    it("isPendingが正しく管理される", () => {
      const { result } = renderHook(() => useEventForm());

      expect(result.current.isPending).toBe(false);
    });

    it("hasErrorsが正しく計算される", async () => {
      const { result } = renderHook(() => useEventForm());

      // 初期状態では必須フィールドに値がないためエラーがない（バリデーションはトリガーされていない）
      expect(result.current.hasErrors).toBe(false);

      // バリデーションをトリガーしてエラーを確認
      await act(async () => {
        await result.current.form.trigger();
      });

      expect(result.current.hasErrors).toBe(true);

      // 有効なデータを設定
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const futureDateString = futureDate.toISOString().slice(0, 16);

      await act(async () => {
        result.current.form.setValue("title", "テストイベント");
        result.current.form.setValue("date", futureDateString);
        result.current.form.setValue("fee", "1000");
        result.current.form.setValue("payment_methods", ["stripe"]);
        await result.current.form.trigger();
      });

      expect(result.current.hasErrors).toBe(false);
    });

    it("無料イベントフラグが正しく動作する", async () => {
      const { result } = renderHook(() => useEventForm());

      // 有料イベント
      await act(async () => {
        result.current.form.setValue("fee", "1000");
      });
      expect(result.current.isFreeEvent).toBe(false);

      // 無料イベント
      await act(async () => {
        result.current.form.setValue("fee", "0");
      });
      expect(result.current.isFreeEvent).toBe(true);
    });
  });

  describe("フォームデータ変換", () => {
    it("payment_methodsが正しく管理される", () => {
      const { result } = renderHook(() => useEventForm());

      act(() => {
        result.current.form.setValue("payment_methods", ["stripe", "cash"]);
      });

      const formData = result.current.formData;
      expect(formData.payment_methods).toEqual(["stripe", "cash"]);
    });
  });
});
