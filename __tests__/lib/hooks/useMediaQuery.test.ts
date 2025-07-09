import { renderHook, act } from "@testing-library/react";
import {
  useMediaQuery,
  useReducedMotion,
  useIsMobile,
  useIsDarkMode,
} from "@/lib/hooks/useMediaQuery";

// MediaQueryListのモック
const createMockMediaQueryList = (matches: boolean): MediaQueryList => ({
  matches,
  media: "",
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
});

describe("useMediaQuery hooks", () => {
  let mockMatchMedia: jest.Mock;

  beforeEach(() => {
    mockMatchMedia = jest.fn();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: mockMatchMedia,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe("useMediaQuery", () => {
    test("初期値でマッチした場合、trueを返すこと", () => {
      const mockMQL = createMockMediaQueryList(true);
      mockMatchMedia.mockReturnValue(mockMQL);

      const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

      expect(result.current).toBe(true);
      expect(mockMatchMedia).toHaveBeenCalledWith("(max-width: 768px)");
    });

    test("初期値でマッチしなかった場合、falseを返すこと", () => {
      const mockMQL = createMockMediaQueryList(false);
      mockMatchMedia.mockReturnValue(mockMQL);

      const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

      expect(result.current).toBe(false);
    });

    test("メディアクエリの変更をリスニングすること", () => {
      const mockMQL = createMockMediaQueryList(false);
      mockMatchMedia.mockReturnValue(mockMQL);

      renderHook(() => useMediaQuery("(max-width: 768px)"));

      expect(mockMQL.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });

    test("コンポーネントアンマウント時にリスナーを削除すること", () => {
      const mockMQL = createMockMediaQueryList(false);
      mockMatchMedia.mockReturnValue(mockMQL);

      const { unmount } = renderHook(() => useMediaQuery("(max-width: 768px)"));

      unmount();

      expect(mockMQL.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });

    test("メディアクエリが変更された時に状態を更新すること", () => {
      const mockMQL = createMockMediaQueryList(false);
      let changeHandler: (event: MediaQueryListEvent) => void;

      mockMQL.addEventListener = jest.fn((event, handler) => {
        if (event === "change") {
          changeHandler = handler;
        }
      });

      mockMatchMedia.mockReturnValue(mockMQL);

      const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

      expect(result.current).toBe(false);

      // メディアクエリの変更をシミュレート
      act(() => {
        changeHandler({ matches: true } as MediaQueryListEvent);
      });

      expect(result.current).toBe(true);
    });

    test.skip("windowが未定義の場合、デフォルト値を返すこと", () => {
      // SSR環境をシミュレート
      Object.defineProperty(global, "window", {
        value: undefined,
        writable: true,
      });

      const { result } = renderHook(() => useMediaQuery("(max-width: 768px)"));

      expect(result.current).toBe(false);

      // windowオブジェクトを復元
      Object.defineProperty(global, "window", {
        value: window,
        writable: true,
      });
    });
  });

  describe("useReducedMotion", () => {
    test("reduce-motionが有効な場合、trueを返すこと", () => {
      const mockMQL = createMockMediaQueryList(true);
      mockMatchMedia.mockReturnValue(mockMQL);

      const { result } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(true);
      expect(mockMatchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    });

    test("reduce-motionが無効な場合、falseを返すこと", () => {
      const mockMQL = createMockMediaQueryList(false);
      mockMatchMedia.mockReturnValue(mockMQL);

      const { result } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(false);
    });
  });

  describe("useIsMobile", () => {
    test("モバイル画面サイズの場合、trueを返すこと", () => {
      const mockMQL = createMockMediaQueryList(true);
      mockMatchMedia.mockReturnValue(mockMQL);

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);
      expect(mockMatchMedia).toHaveBeenCalledWith("(max-width: 768px)");
    });

    test("デスクトップ画面サイズの場合、falseを返すこと", () => {
      const mockMQL = createMockMediaQueryList(false);
      mockMatchMedia.mockReturnValue(mockMQL);

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });
  });

  describe("useIsDarkMode", () => {
    test("ダークモードが有効な場合、trueを返すこと", () => {
      const mockMQL = createMockMediaQueryList(true);
      mockMatchMedia.mockReturnValue(mockMQL);

      const { result } = renderHook(() => useIsDarkMode());

      expect(result.current).toBe(true);
      expect(mockMatchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    });

    test("ライトモードが有効な場合、falseを返すこと", () => {
      const mockMQL = createMockMediaQueryList(false);
      mockMatchMedia.mockReturnValue(mockMQL);

      const { result } = renderHook(() => useIsDarkMode());

      expect(result.current).toBe(false);
    });
  });

  describe("複数のフックの並行使用", () => {
    test("複数のメディアクエリフックが同時に正常動作すること", () => {
      // 異なる条件で複数のモックを設定
      mockMatchMedia
        .mockReturnValueOnce(createMockMediaQueryList(true)) // useReducedMotion
        .mockReturnValueOnce(createMockMediaQueryList(false)) // useIsMobile
        .mockReturnValueOnce(createMockMediaQueryList(true)); // useIsDarkMode

      const { result: reducedMotionResult } = renderHook(() => useReducedMotion());
      const { result: isMobileResult } = renderHook(() => useIsMobile());
      const { result: isDarkModeResult } = renderHook(() => useIsDarkMode());

      expect(reducedMotionResult.current).toBe(true);
      expect(isMobileResult.current).toBe(false);
      expect(isDarkModeResult.current).toBe(true);

      expect(mockMatchMedia).toHaveBeenCalledTimes(3);
    });
  });
});
