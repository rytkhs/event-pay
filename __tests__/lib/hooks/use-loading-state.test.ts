import { renderHook, act } from "@testing-library/react";
import { useLoadingState } from "@/lib/hooks/useLoadingState";

// タイマーをモック化
jest.useFakeTimers();

describe("useLoadingState フック", () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
  });

  describe("基本的な状態管理", () => {
    it("初期状態が正しく設定される", () => {
      const { result } = renderHook(() => useLoadingState());

      expect(result.current.state.isLoading).toBe(false);
      expect(result.current.state.progress).toBeUndefined();
      expect(result.current.state.message).toBeUndefined();
      expect(result.current.state.canCancel).toBe(false);
    });

    it("カスタム初期状態が正しく設定される", () => {
      const initialState = {
        isLoading: true,
        progress: 50,
        message: "データを読み込み中...",
        canCancel: true,
      };

      const { result } = renderHook(() => useLoadingState(initialState));

      expect(result.current.state.isLoading).toBe(true);
      expect(result.current.state.progress).toBe(50);
      expect(result.current.state.message).toBe("データを読み込み中...");
      expect(result.current.state.canCancel).toBe(true);
    });
  });

  describe("ローディング開始", () => {
    it("ローディングが正しく開始される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading();
      });

      expect(result.current.state.isLoading).toBe(true);
      expect(result.current.state.progress).toBe(0);
      expect(result.current.state.message).toBe("処理中...");
    });

    it("カスタムメッセージでローディングが開始される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading("データを保存中...");
      });

      expect(result.current.state.isLoading).toBe(true);
      expect(result.current.state.message).toBe("データを保存中...");
    });

    it("キャンセル可能なローディングが開始される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading("処理中...", { canCancel: true });
      });

      expect(result.current.state.isLoading).toBe(true);
      expect(result.current.state.canCancel).toBe(true);
    });
  });

  describe("プログレス更新", () => {
    it("プログレスが正しく更新される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading();
      });

      act(() => {
        result.current.updateProgress(25);
      });

      expect(result.current.state.progress).toBe(25);
    });

    it("プログレスが0-100の範囲でクランプされる", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading();
      });

      act(() => {
        result.current.updateProgress(-10);
      });
      expect(result.current.state.progress).toBe(0);

      act(() => {
        result.current.updateProgress(150);
      });
      expect(result.current.state.progress).toBe(100);
    });

    it("プログレスメッセージが正しく更新される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading();
      });

      act(() => {
        result.current.updateProgress(50, "データを処理中...");
      });

      expect(result.current.state.progress).toBe(50);
      expect(result.current.state.message).toBe("データを処理中...");
    });
  });

  describe("ローディング停止", () => {
    it("ローディングが正しく停止される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading();
      });

      act(() => {
        result.current.stopLoading();
      });

      expect(result.current.state.isLoading).toBe(false);
      expect(result.current.state.progress).toBeUndefined();
      expect(result.current.state.message).toBeUndefined();
    });

    it("成功メッセージでローディングが停止される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading();
      });

      act(() => {
        result.current.stopLoading("完了しました");
      });

      expect(result.current.state.isLoading).toBe(false);
      expect(result.current.state.message).toBe("完了しました");
    });
  });

  describe("キャンセル機能", () => {
    it("キャンセルが正しく実行される", () => {
      const onCancel = jest.fn();
      const { result } = renderHook(() => useLoadingState(undefined, { onCancel }));

      act(() => {
        result.current.startLoading("処理中...", { canCancel: true });
      });

      act(() => {
        result.current.cancel();
      });

      expect(onCancel).toHaveBeenCalled();
      expect(result.current.state.isLoading).toBe(false);
      expect(result.current.state.message).toBe("キャンセルされました");
    });

    it("キャンセル不可能な場合はキャンセルが無視される", () => {
      const onCancel = jest.fn();
      const { result } = renderHook(() => useLoadingState(undefined, { onCancel }));

      act(() => {
        result.current.startLoading("処理中...", { canCancel: false });
      });

      act(() => {
        result.current.cancel();
      });

      expect(onCancel).not.toHaveBeenCalled();
      expect(result.current.state.isLoading).toBe(true);
    });
  });

  describe("タイムアウト処理", () => {
    it("タイムアウトが正しく設定される", () => {
      const onTimeout = jest.fn();
      const { result } = renderHook(() => useLoadingState(undefined, { onTimeout }));

      act(() => {
        result.current.startLoading("処理中...", { timeout: 5000, onTimeout });
      });

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(onTimeout).toHaveBeenCalled();
      expect(result.current.state.isLoading).toBe(false);
      expect(result.current.state.message).toBe("タイムアウトしました");
    });

    it("タイムアウト前に完了した場合はタイムアウトが発生しない", () => {
      const onTimeout = jest.fn();
      const { result } = renderHook(() => useLoadingState(undefined, { onTimeout }));

      act(() => {
        result.current.startLoading("処理中...", { timeout: 5000, onTimeout });
      });

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      act(() => {
        result.current.stopLoading();
      });

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(onTimeout).not.toHaveBeenCalled();
    });
  });

  describe("エラー処理", () => {
    it("エラー状態が正しく設定される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading();
      });

      act(() => {
        result.current.setError("エラーが発生しました");
      });

      expect(result.current.state.isLoading).toBe(false);
      expect(result.current.state.error).toBe("エラーが発生しました");
    });

    it("エラーからの復帰が正しく処理される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.setError("エラーが発生しました");
      });

      act(() => {
        result.current.startLoading();
      });

      expect(result.current.state.error).toBeUndefined();
      expect(result.current.state.isLoading).toBe(true);
    });
  });

  describe("複数のローディング処理", () => {
    it("複数のローディング処理が並行して管理される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading("タスク1", { id: "task1" });
      });

      act(() => {
        result.current.startLoading("タスク2", { id: "task2" });
      });

      expect(result.current.state.activeTasks).toHaveLength(2);
      expect(result.current.state.activeTasks[0].id).toBe("task1");
      expect(result.current.state.activeTasks[1].id).toBe("task2");
    });

    it("個別のタスクが正しく完了される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading("タスク1", { id: "task1" });
      });

      act(() => {
        result.current.startLoading("タスク2", { id: "task2" });
      });

      act(() => {
        result.current.stopLoading("task1");
      });

      expect(result.current.state.activeTasks).toHaveLength(1);
      expect(result.current.state.activeTasks[0].id).toBe("task2");
    });

    it("すべてのタスクが完了するとローディング状態が解除される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading("タスク1", { id: "task1" });
      });

      act(() => {
        result.current.startLoading("タスク2", { id: "task2" });
      });

      act(() => {
        result.current.stopLoading("task1");
      });

      expect(result.current.state.isLoading).toBe(true);

      act(() => {
        result.current.stopLoading("task2");
      });

      expect(result.current.state.isLoading).toBe(false);
    });
  });

  describe("推定残り時間", () => {
    it("推定残り時間が正しく計算される", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading();
      });

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      act(() => {
        result.current.updateProgress(25);
      });

      // 25%が2秒で完了したので、残り75%は6秒の予定
      expect(result.current.state.estimatedTimeRemaining).toBe(6000);
    });

    it("プログレスが0%の場合は推定時間が計算されない", () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.startLoading();
      });

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(result.current.state.estimatedTimeRemaining).toBeUndefined();
    });
  });

  describe("状態の永続化", () => {
    it("状態がlocalStorageに保存される", () => {
      const localStorageMock = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      };

      Object.defineProperty(window, "localStorage", {
        value: localStorageMock,
      });

      const { result } = renderHook(() => useLoadingState(undefined, { persist: true }));

      act(() => {
        result.current.startLoading("データ読み込み中...");
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "loading-state",
        expect.stringContaining("データ読み込み中...")
      );
    });
  });
});
