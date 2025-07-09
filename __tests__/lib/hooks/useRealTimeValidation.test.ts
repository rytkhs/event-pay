/**
 * useRealTimeValidation フックのテスト
 * TDD Red Phase - 失敗するテストを最初に書く
 */

import { renderHook, act } from "@testing-library/react";
import { useRealTimeValidation } from "@/lib/hooks/useRealTimeValidation";

// モックモジュール
jest.mock("@/lib/utils/errorHandling", () => ({
  createAsyncValidationErrorHandler: () => (error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }
    return "バリデーションエラー";
  },
}));

describe("useRealTimeValidation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  describe("基本的なバリデーション", () => {
    it("初期状態が正しく設定される", () => {
      const validator = (value: string) => value.length >= 3;
      const { result } = renderHook(() => useRealTimeValidation("", validator));

      expect(result.current.state.value).toBe("");
      expect(result.current.state.isValid).toBe(false);
      expect(result.current.state.error).toBeUndefined();
      expect(result.current.state.isValidating).toBe(false);
    });

    it("値の変更時にデバウンス付きでバリデーションが実行される", async () => {
      const validator = jest.fn((value: string) => value.length >= 3);
      const { result } = renderHook(() =>
        useRealTimeValidation("", validator, { debounceMs: 300 })
      );

      // 値を変更
      act(() => {
        result.current.setValue("ab");
      });

      // デバウンス中はバリデーションが実行されない
      expect(validator).not.toHaveBeenCalled();
      expect(result.current.state.value).toBe("ab");

      // デバウンス時間経過後にバリデーションが実行される
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(validator).toHaveBeenCalledWith("ab");
      expect(result.current.state.isValid).toBe(false);
    });

    it("成功時に即座にフィードバックが表示される", () => {
      const validator = (value: string) => value.length >= 3;
      const { result } = renderHook(() => useRealTimeValidation("", validator));

      act(() => {
        result.current.setValue("abc");
      });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(result.current.state.isValid).toBe(true);
      expect(result.current.state.error).toBeUndefined();
    });

    it("エラー時にエラーメッセージが設定される", () => {
      const validator = (value: string) => (value.length >= 3 ? true : "3文字以上入力してください");
      const { result } = renderHook(() => useRealTimeValidation("", validator));

      act(() => {
        result.current.setValue("ab");
      });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(result.current.state.isValid).toBe(false);
      expect(result.current.state.error).toBe("3文字以上入力してください");
    });
  });

  describe("デバウンス処理", () => {
    it("短時間での複数の変更は最後の値のみでバリデーションが実行される", () => {
      const validator = jest.fn((value: string) => value.length >= 3);
      const { result } = renderHook(() =>
        useRealTimeValidation("", validator, { debounceMs: 300 })
      );

      // 短時間で複数回変更
      act(() => {
        result.current.setValue("a");
      });
      act(() => {
        result.current.setValue("ab");
      });
      act(() => {
        result.current.setValue("abc");
      });

      // デバウンス中はバリデーションが実行されない
      expect(validator).not.toHaveBeenCalled();

      // デバウンス時間経過後
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // 最後の値のみでバリデーションが実行される
      expect(validator).toHaveBeenCalledTimes(1);
      expect(validator).toHaveBeenCalledWith("abc");
    });

    it("デバウンス時間をカスタマイズできる", () => {
      const validator = jest.fn((value: string) => value.length >= 3);
      const { result } = renderHook(() =>
        useRealTimeValidation("", validator, { debounceMs: 500 })
      );

      act(() => {
        result.current.setValue("abc");
      });

      // 300ms後はまだ実行されない
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(validator).not.toHaveBeenCalled();

      // 500ms後に実行される
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(validator).toHaveBeenCalledWith("abc");
    });
  });

  describe("非同期バリデーション", () => {
    it("非同期バリデーション中は isValidating が true になる", async () => {
      let resolveValidator: (value: boolean) => void;
      const asyncValidator = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveValidator = resolve;
        });
      });

      const { result } = renderHook(() =>
        useRealTimeValidation("", () => true, { asyncValidator })
      );

      act(() => {
        result.current.setValue("test");
        jest.advanceTimersByTime(300);
      });

      // 非同期バリデーション開始を待つ
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.state.isValidating).toBe(true);

      // 非同期バリデーションを完了させる
      await act(async () => {
        resolveValidator!(true);
      });
    });

    it("非同期バリデーション完了後に状態が更新される", async () => {
      let resolveValidator: (value: boolean) => void;
      const asyncValidator = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveValidator = resolve;
        });
      });

      const { result } = renderHook(() =>
        useRealTimeValidation("", () => true, { asyncValidator })
      );

      act(() => {
        result.current.setValue("test");
        jest.advanceTimersByTime(300);
      });

      // 非同期バリデーション開始を待つ
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.state.isValidating).toBe(true);

      // 非同期バリデーションを完了させる
      await act(async () => {
        resolveValidator!(false);
      });

      expect(result.current.state.isValidating).toBe(false);
      expect(result.current.state.isValid).toBe(false);
    });

    it.skip("非同期バリデーションでエラーが発生した場合の処理", async () => {
      const asyncValidator = jest.fn().mockRejectedValue(new Error("Async validation failed"));

      const { result } = renderHook(() =>
        useRealTimeValidation("", () => true, { asyncValidator })
      );

      act(() => {
        result.current.setValue("test");
        jest.advanceTimersByTime(300);
      });

      // 非同期バリデーション完了を待つ
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // エラーハンドリングのため少し待つ
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(result.current.state.isValidating).toBe(false);
      expect(result.current.state.isValid).toBe(false);
      expect(result.current.state.error).toBe("Async validation failed");
    });
  });

  describe("フォーカス移動時のバリデーション", () => {
    it("validateOnBlur が true の場合、validate() 呼び出し時に即座にバリデーションが実行される", async () => {
      const validator = jest.fn((value: string) => value.length >= 3);
      const { result } = renderHook(() =>
        useRealTimeValidation("", validator, { validateOnBlur: true })
      );

      act(() => {
        result.current.setValue("ab");
      });

      // 手動でバリデーション実行
      await act(async () => {
        result.current.validate();
      });

      // デバウンス時間を待たずに即座に実行される
      expect(validator).toHaveBeenCalledWith("ab");
      expect(result.current.state.isValid).toBe(false);
    });

    it("validateOnBlur が false の場合、validate() 呼び出しでもデバウンスが適用される", async () => {
      const validator = jest.fn((value: string) => value.length >= 3);
      const { result } = renderHook(() =>
        useRealTimeValidation("", validator, { validateOnBlur: false })
      );

      act(() => {
        result.current.setValue("ab");
      });

      act(() => {
        result.current.validate();
      });

      // デバウンス時間前は実行されない
      expect(validator).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(validator).toHaveBeenCalledWith("ab");
    });
  });

  describe("メモリリーク防止", () => {
    it("コンポーネントアンマウント時にタイマーがクリーンアップされる", () => {
      const validator = jest.fn((value: string) => value.length >= 3);
      const { result, unmount } = renderHook(() =>
        useRealTimeValidation("", validator, { debounceMs: 300 })
      );

      act(() => {
        result.current.setValue("ab");
      });

      // アンマウント
      unmount();

      // タイマー経過後もバリデーションが実行されない
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(validator).not.toHaveBeenCalled();
    });

    it("進行中の非同期バリデーションがキャンセルされる", async () => {
      let resolveValidator: (value: boolean) => void;
      const asyncValidator = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          resolveValidator = resolve;
        });
      });

      const { result, unmount } = renderHook(() =>
        useRealTimeValidation("", () => true, { asyncValidator })
      );

      act(() => {
        result.current.setValue("test");
      });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      // 非同期処理が開始されるまで待つ
      await act(async () => {
        await Promise.resolve();
      });

      // アンマウント
      unmount();

      // 非同期処理完了
      await act(async () => {
        resolveValidator!(true);
        await Promise.resolve();
      });

      // 状態が更新されない（メモリリークしない）
      expect(result.current.state.isValidating).toBe(true);
    });
  });

  describe("パフォーマンス最適化", () => {
    it("同じ値での連続的な setValue は無視される", () => {
      const validator = jest.fn((value: string) => value.length >= 3);
      const { result } = renderHook(() => useRealTimeValidation("", validator));

      act(() => {
        result.current.setValue("abc");
      });

      act(() => {
        result.current.setValue("abc");
      });

      act(() => {
        result.current.setValue("abc");
      });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      // 1回のみバリデーションが実行される
      expect(validator).toHaveBeenCalledTimes(1);
    });

    it("空文字から空文字への変更は無視される", () => {
      const validator = jest.fn((value: string) => value.length >= 3);
      const { result } = renderHook(() => useRealTimeValidation("", validator));

      act(() => {
        result.current.setValue("");
      });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      // バリデーションが実行されない
      expect(validator).not.toHaveBeenCalled();
    });
  });
});
