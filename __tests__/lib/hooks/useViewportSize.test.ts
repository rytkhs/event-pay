/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useViewportSize } from "@/lib/hooks/useViewportSize";

describe("useViewportSize", () => {
  beforeEach(() => {
    // デフォルトビューポートサイズを設定
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 768,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("基本的なビューポートサイズ検出", () => {
    it("初期ビューポートサイズを正しく取得できる", () => {
      const { result } = renderHook(() => useViewportSize());

      expect(result.current.width).toBe(1024);
      expect(result.current.height).toBe(768);
    });

    it("デスクトップデバイスとして正しく判定される", () => {
      const { result } = renderHook(() => useViewportSize());

      expect(result.current.deviceType).toBe("desktop");
      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(true);
    });

    it("画面の向きを正しく判定する", () => {
      const { result } = renderHook(() => useViewportSize());

      expect(result.current.orientation).toBe("landscape");
      expect(result.current.isLandscape).toBe(true);
      expect(result.current.isPortrait).toBe(false);
    });
  });

  describe("ビューポートサイズ変更の検出", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("ウィンドウリサイズ時にビューポートサイズが更新される", () => {
      const { result } = renderHook(() => useViewportSize());

      // 初期状態の確認
      expect(result.current.width).toBe(1024);
      expect(result.current.height).toBe(768);

      // ウィンドウサイズを変更
      act(() => {
        window.innerWidth = 375;
        window.innerHeight = 667;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.width).toBe(375);
      expect(result.current.height).toBe(667);
    });

    it("デバイスタイプが動的に変更される", () => {
      const { result } = renderHook(() => useViewportSize());

      // デスクトップから開始
      expect(result.current.deviceType).toBe("desktop");

      // モバイルサイズに変更
      act(() => {
        window.innerWidth = 375;
        window.innerHeight = 667;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.deviceType).toBe("mobile");
      expect(result.current.isMobile).toBe(true);
      expect(result.current.isDesktop).toBe(false);
    });

    it("画面の向きが動的に変更される", () => {
      const { result } = renderHook(() => useViewportSize());

      // 横向きから開始
      expect(result.current.orientation).toBe("landscape");

      // 縦向きに変更
      act(() => {
        window.innerWidth = 375;
        window.innerHeight = 667;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.orientation).toBe("portrait");
      expect(result.current.isPortrait).toBe(true);
      expect(result.current.isLandscape).toBe(false);
    });
  });

  describe("デバイスタイプの判定", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("モバイルデバイスを正しく判定する", () => {
      const { result } = renderHook(() => useViewportSize());

      // iPhone SE サイズ
      act(() => {
        window.innerWidth = 320;
        window.innerHeight = 568;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.deviceType).toBe("mobile");
      expect(result.current.isMobile).toBe(true);
      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(false);
    });

    it("タブレットデバイスを正しく判定する", () => {
      const { result } = renderHook(() => useViewportSize());

      // iPad サイズ
      act(() => {
        window.innerWidth = 768;
        window.innerHeight = 1024;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.deviceType).toBe("tablet");
      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(true);
      expect(result.current.isDesktop).toBe(false);
    });

    it("デスクトップデバイスを正しく判定する", () => {
      const { result } = renderHook(() => useViewportSize());

      // デスクトップサイズ
      act(() => {
        window.innerWidth = 1280;
        window.innerHeight = 800;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.deviceType).toBe("desktop");
      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(false);
      expect(result.current.isDesktop).toBe(true);
    });
  });

  describe("ブレークポイントの検出", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("xs ブレークポイントを正しく検出する", () => {
      const { result } = renderHook(() => useViewportSize());

      act(() => {
        window.innerWidth = 320;
        window.innerHeight = 568;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.breakpoint).toBe("xs");
      expect(result.current.isXS).toBe(true);
    });

    it("sm ブレークポイントを正しく検出する", () => {
      const { result } = renderHook(() => useViewportSize());

      act(() => {
        window.innerWidth = 400;
        window.innerHeight = 600;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.breakpoint).toBe("sm");
      expect(result.current.isSM).toBe(true);
    });

    it("md ブレークポイントを正しく検出する", () => {
      const { result } = renderHook(() => useViewportSize());

      act(() => {
        window.innerWidth = 800;
        window.innerHeight = 600;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.breakpoint).toBe("md");
      expect(result.current.isMD).toBe(true);
    });

    it("lg ブレークポイントを正しく検出する", () => {
      const { result } = renderHook(() => useViewportSize());

      act(() => {
        window.innerWidth = 1100;
        window.innerHeight = 700;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.breakpoint).toBe("lg");
      expect(result.current.isLG).toBe(true);
    });

    it("xl ブレークポイントを正しく検出する", () => {
      const { result } = renderHook(() => useViewportSize());

      act(() => {
        window.innerWidth = 1400;
        window.innerHeight = 800;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.breakpoint).toBe("xl");
      expect(result.current.isXL).toBe(true);
    });
  });

  describe("パフォーマンス最適化", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("連続するリサイズイベントがデバウンスされる", () => {
      const { result } = renderHook(() => useViewportSize());

      // 複数のリサイズイベントを連続して発生
      act(() => {
        Object.defineProperty(window, "innerWidth", {
          writable: true,
          configurable: true,
          value: 800,
        });
        window.dispatchEvent(new Event("resize"));

        Object.defineProperty(window, "innerWidth", {
          writable: true,
          configurable: true,
          value: 900,
        });
        window.dispatchEvent(new Event("resize"));

        Object.defineProperty(window, "innerWidth", {
          writable: true,
          configurable: true,
          value: 1000,
        });
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス期間後に最終サイズに更新される
      act(() => {
        jest.advanceTimersByTime(150);
      });

      expect(result.current.width).toBe(1000);
    });

    it("同じサイズへの変更では再レンダリングが発生しない", () => {
      const { result } = renderHook(() => useViewportSize());

      const initialRender = result.current;

      // 同じサイズに変更
      act(() => {
        window.innerWidth = 1024;
        window.innerHeight = 768;
        window.dispatchEvent(new Event("resize"));
      });

      // デバウンス処理を待つ
      act(() => {
        jest.advanceTimersByTime(150);
      });

      // 同じオブジェクトが返される（再レンダリングされない）
      expect(result.current).toBe(initialRender);
    });
  });

  describe("メモリリーク防止", () => {
    it("コンポーネントアンマウント時にイベントリスナーが削除される", () => {
      const removeEventListenerSpy = jest.spyOn(window, "removeEventListener");

      const { unmount } = renderHook(() => useViewportSize());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    });
  });

  describe("SSR対応", () => {
    it("サーバーサイドでエラーが発生しない", () => {
      // windowオブジェクトを無効化してSSR環境をシミュレート
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;

      expect(() => {
        renderHook(() => useViewportSize());
      }).not.toThrow();

      // windowオブジェクトを復元
      global.window = originalWindow;
    });
  });
});
