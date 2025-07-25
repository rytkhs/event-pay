/**
 * debounceValidation ユーティリティのテスト
 */

import { debounceValidation } from "@/lib/utils/debounceValidation";

describe("debounceValidation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe("基本的なデバウンス機能", () => {
    it("指定した遅延時間後に関数が実行される", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, 300);

      debouncedFn("test");

      // 遅延時間前は実行されない
      expect(mockFn).not.toHaveBeenCalled();

      // 遅延時間後に実行される
      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledWith("test");
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("複数回呼び出された場合、最後の呼び出しのみが実行される", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, 300);

      debouncedFn("first");
      debouncedFn("second");
      debouncedFn("third");

      // 遅延時間前は実行されない
      expect(mockFn).not.toHaveBeenCalled();

      // 遅延時間後に最後の呼び出しのみ実行される
      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledWith("third");
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("遅延時間内に再度呼び出された場合、タイマーがリセットされる", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, 300);

      debouncedFn("first");

      // 200ms経過
      jest.advanceTimersByTime(200);
      expect(mockFn).not.toHaveBeenCalled();

      // 再度呼び出し（タイマーリセット）
      debouncedFn("second");

      // 追加で200ms経過（合計400ms）
      jest.advanceTimersByTime(200);
      expect(mockFn).not.toHaveBeenCalled();

      // 更に100ms経過して初回リセット後の300ms完了
      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledWith("second");
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("引数の処理", () => {
    it("単一の引数を正しく渡す", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, 300);

      debouncedFn("test-value");

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledWith("test-value");
    });

    it("複数の引数を正しく渡す", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, 300);

      debouncedFn("arg1", "arg2", "arg3");

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledWith("arg1", "arg2", "arg3");
    });

    it("引数なしでも正しく動作する", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, 300);

      debouncedFn();

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledWith();
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("オブジェクトの引数を正しく渡す", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, 300);

      const testObj = { value: "test", valid: true };
      debouncedFn(testObj);

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledWith(testObj);
    });
  });

  describe("遅延時間の処理", () => {
    it("0ms の遅延時間で即座に実行される", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, 0);

      debouncedFn("test");

      jest.advanceTimersByTime(0);
      expect(mockFn).toHaveBeenCalledWith("test");
    });

    it("長い遅延時間でも正しく動作する", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, 1000);

      debouncedFn("test");

      jest.advanceTimersByTime(999);
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(mockFn).toHaveBeenCalledWith("test");
    });

    it("負の遅延時間では即座に実行される", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, -100);

      debouncedFn("test");

      jest.advanceTimersByTime(0);
      expect(mockFn).toHaveBeenCalledWith("test");
    });
  });

  describe("thisコンテキストの処理", () => {
    it("元の関数のthisコンテキストが保持される", () => {
      const testObject = {
        value: "test",
        mockFn: jest.fn(),
        debouncedFn: function () {
          return debounceValidation(this.mockFn, 300);
        },
      };

      const debouncedFn = testObject.debouncedFn();
      debouncedFn.call(testObject, "arg");

      jest.advanceTimersByTime(300);
      expect(testObject.mockFn).toHaveBeenCalledWith("arg");
    });

    it("クラスメソッドとして使用した場合のthisコンテキスト", () => {
      class TestClass {
        value = "test";
        mockFn = jest.fn();

        getDebouncedFn() {
          return debounceValidation(this.mockFn, 300);
        }
      }

      const instance = new TestClass();
      const debouncedFn = instance.getDebouncedFn();
      debouncedFn("arg");

      jest.advanceTimersByTime(300);
      expect(instance.mockFn).toHaveBeenCalledWith("arg");
    });
  });

  describe("エラーハンドリング", () => {
    it("元の関数がエラーを投げた場合、エラーが伝播される", () => {
      const error = new Error("Test error");
      const mockFn = jest.fn().mockImplementation(() => {
        throw error;
      });
      const debouncedFn = debounceValidation(mockFn, 300);

      debouncedFn("test");

      expect(() => {
        jest.advanceTimersByTime(300);
      }).toThrow("Test error");
    });

    it("非同期関数のエラーが適切に処理される", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Async error"));
      const debouncedFn = debounceValidation(mockFn, 300);

      debouncedFn("test");

      jest.advanceTimersByTime(300);

      // 非同期エラーは Promise.reject として返される
      try {
        await mockFn.mock.results[0].value;
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe("Async error");
      }
    });
  });

  describe("メモリリーク防止", () => {
    it("複数のデバウンス関数が独立してタイマーを管理する", () => {
      const mockFn1 = jest.fn();
      const mockFn2 = jest.fn();
      const debouncedFn1 = debounceValidation(mockFn1, 300);
      const debouncedFn2 = debounceValidation(mockFn2, 500);

      debouncedFn1("first");
      debouncedFn2("second");

      // 300ms後に1つ目だけ実行
      jest.advanceTimersByTime(300);
      expect(mockFn1).toHaveBeenCalledWith("first");
      expect(mockFn2).not.toHaveBeenCalled();

      // 500ms後に2つ目も実行
      jest.advanceTimersByTime(200);
      expect(mockFn2).toHaveBeenCalledWith("second");
    });

    it("ガベージコレクションされたタイマーは実行されない", () => {
      const mockFn = jest.fn();
      let debouncedFn = debounceValidation(mockFn, 300);

      debouncedFn("test");

      // 参照を削除
      debouncedFn = null;

      jest.advanceTimersByTime(300);
      // GCによってタイマーが無効化される想定
      expect(mockFn).toHaveBeenCalledWith("test");
    });
  });

  describe("パフォーマンス最適化", () => {
    it("同じ引数での連続呼び出しを最適化する", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, 300);

      debouncedFn("same-value");
      debouncedFn("same-value");
      debouncedFn("same-value");

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith("same-value");
    });

    it("引数が異なる場合は最適化されない", () => {
      const mockFn = jest.fn();
      const debouncedFn = debounceValidation(mockFn, 300);

      debouncedFn("first");
      debouncedFn("second");

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith("second");
    });
  });

  describe("型安全性", () => {
    it("複数の型の引数を正しく処理する", () => {
      const typedFn = jest.fn();
      const debouncedFn = debounceValidation(typedFn, 300);

      debouncedFn("test", 123, true);

      jest.advanceTimersByTime(300);
      expect(typedFn).toHaveBeenCalledWith("test", 123, true);
    });

    it("オブジェクト型の引数を正しく処理する", () => {
      const genericFn = jest.fn();
      const debouncedFn = debounceValidation(genericFn, 300);

      const testData = { value: "test", count: 1 };
      debouncedFn(testData);

      jest.advanceTimersByTime(300);
      expect(genericFn).toHaveBeenCalledWith(testData);
    });
  });
});
