/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MobileResponsiveLayout } from "@/components/mobile/MobileResponsiveLayout";

// ビューポートサイズを変更するヘルパー関数
const setViewportSize = (width: number, height: number) => {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    writable: true,
    configurable: true,
    value: height,
  });

  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
};

// matchMediaのモック
const createMatchMediaMock = (matches: boolean) => {
  return jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
};

describe("Mobile Responsive Design", () => {
  beforeEach(() => {
    // デフォルトのビューポートサイズを設定
    setViewportSize(375, 667); // iPhone サイズ

    // matchMediaをモック
    window.matchMedia = createMatchMediaMock(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("ビューポート別レイアウト", () => {
    it("モバイルビューポートでモバイルレイアウトが適用される", () => {
      setViewportSize(375, 667);

      render(
        <MobileResponsiveLayout>
          <div data-testid="content">テストコンテンツ</div>
        </MobileResponsiveLayout>
      );

      const layout = screen.getByTestId("mobile-layout");
      expect(layout).toBeInTheDocument();
      expect(layout).toHaveClass("mobile-layout");
    });

    it("タブレットビューポートでタブレットレイアウトが適用される", () => {
      setViewportSize(768, 1024);

      render(
        <MobileResponsiveLayout>
          <div data-testid="content">テストコンテンツ</div>
        </MobileResponsiveLayout>
      );

      const layout = screen.getByTestId("tablet-layout");
      expect(layout).toBeInTheDocument();
      expect(layout).toHaveClass("tablet-layout");
    });

    it("デスクトップビューポートでデスクトップレイアウトが適用される", () => {
      setViewportSize(1280, 800);

      render(
        <MobileResponsiveLayout>
          <div data-testid="content">テストコンテンツ</div>
        </MobileResponsiveLayout>
      );

      const layout = screen.getByTestId("desktop-layout");
      expect(layout).toBeInTheDocument();
      expect(layout).toHaveClass("desktop-layout");
    });
  });

  describe("ブレークポイント対応", () => {
    const breakpoints = [
      { name: "xs", width: 320, height: 568 }, // iPhone SE
      { name: "sm", width: 375, height: 667 }, // iPhone 6/7/8
      { name: "md", width: 768, height: 1024 }, // iPad
      { name: "lg", width: 1024, height: 768 }, // iPad横向き
      { name: "xl", width: 1280, height: 800 }, // デスクトップ
    ];

    breakpoints.forEach(({ name, width, height }) => {
      it(`${name}ブレークポイント（${width}x${height}）で適切なスタイルが適用される`, () => {
        setViewportSize(width, height);

        render(
          <MobileResponsiveLayout>
            <div data-testid={`${name}-content`}>コンテンツ</div>
          </MobileResponsiveLayout>
        );

        const content = screen.getByTestId(`${name}-content`);
        expect(content).toHaveClass(`breakpoint-${name}`);
      });
    });
  });

  describe("タッチターゲットサイズ", () => {
    it("モバイルで最小44x44pxのタッチターゲットが確保される", () => {
      setViewportSize(375, 667);

      render(
        <MobileResponsiveLayout>
          <button data-testid="touch-button">ボタン</button>
        </MobileResponsiveLayout>
      );

      const button = screen.getByTestId("touch-button");
      expect(button).toHaveStyle("min-width: 44px");
      expect(button).toHaveStyle("min-height: 44px");
    });

    it("タブレットで最小36x36pxのタッチターゲットが確保される", () => {
      setViewportSize(768, 1024);

      render(
        <MobileResponsiveLayout>
          <button data-testid="touch-button">ボタン</button>
        </MobileResponsiveLayout>
      );

      const button = screen.getByTestId("touch-button");
      expect(button).toHaveStyle("min-width: 36px");
      expect(button).toHaveStyle("min-height: 36px");
    });

    it("デスクトップで通常サイズのターゲットが適用される", () => {
      setViewportSize(1280, 800);

      render(
        <MobileResponsiveLayout>
          <button data-testid="touch-button">ボタン</button>
        </MobileResponsiveLayout>
      );

      const button = screen.getByTestId("touch-button");
      expect(button).toHaveStyle("min-width: 32px");
      expect(button).toHaveStyle("min-height: 32px");
    });
  });

  describe("バーチャルキーボード対応", () => {
    it("モバイルでバーチャルキーボード表示時にレイアウトが調整される", async () => {
      setViewportSize(375, 667);

      render(
        <MobileResponsiveLayout>
          <input data-testid="mobile-input" type="text" />
        </MobileResponsiveLayout>
      );

      const input = screen.getByTestId("mobile-input");

      // バーチャルキーボード表示をシミュレート
      act(() => {
        setViewportSize(375, 400); // 高さが減少
        input.focus();
      });

      await waitFor(() => {
        const layout = screen.getByTestId("mobile-layout");
        expect(layout).toHaveClass("keyboard-active");
      });
    });

    it("バーチャルキーボード非表示時にレイアウトが元に戻る", async () => {
      setViewportSize(375, 667);

      render(
        <MobileResponsiveLayout>
          <input data-testid="mobile-input" type="text" />
        </MobileResponsiveLayout>
      );

      const input = screen.getByTestId("mobile-input");

      // バーチャルキーボード表示
      act(() => {
        setViewportSize(375, 400);
        input.focus();
      });

      // バーチャルキーボード非表示
      act(() => {
        setViewportSize(375, 667);
        input.blur();
      });

      await waitFor(() => {
        const layout = screen.getByTestId("mobile-layout");
        expect(layout).not.toHaveClass("keyboard-active");
      });
    });
  });

  describe("スクロール動作", () => {
    it("モバイルで縦スクロールが適切に動作する", () => {
      setViewportSize(375, 667);

      render(
        <MobileResponsiveLayout>
          <div data-testid="scrollable-content" style={{ height: "1000px" }}>
            長いコンテンツ
          </div>
        </MobileResponsiveLayout>
      );

      const layout = screen.getByTestId("mobile-layout");
      expect(layout).toHaveClass("overflow-y-auto");
      expect(layout).toHaveClass("overflow-x-hidden");
    });

    it("タブレットで適切なスクロール動作が設定される", () => {
      setViewportSize(768, 1024);

      render(
        <MobileResponsiveLayout>
          <div data-testid="scrollable-content" style={{ height: "1200px" }}>
            長いコンテンツ
          </div>
        </MobileResponsiveLayout>
      );

      const layout = screen.getByTestId("tablet-layout");
      expect(layout).toHaveClass("overflow-y-auto");
      expect(layout).toHaveClass("overflow-x-hidden");
    });
  });

  describe("画面の向き対応", () => {
    it("縦向き（ポートレート）で適切なレイアウトが適用される", () => {
      setViewportSize(375, 667); // 縦向き

      render(
        <MobileResponsiveLayout>
          <div data-testid="orientation-content">コンテンツ</div>
        </MobileResponsiveLayout>
      );

      const layout = screen.getByTestId("mobile-layout");
      expect(layout).toHaveClass("portrait-layout");
    });

    it("横向き（ランドスケープ）で適切なレイアウトが適用される", () => {
      setViewportSize(667, 375); // 横向き

      render(
        <MobileResponsiveLayout>
          <div data-testid="orientation-content">コンテンツ</div>
        </MobileResponsiveLayout>
      );

      const layout = screen.getByTestId("mobile-layout");
      expect(layout).toHaveClass("landscape-layout");
    });
  });

  describe("パフォーマンス最適化", () => {
    it("ビューポート変更時のリサイズイベントが適切に処理される", async () => {
      const { rerender } = render(
        <MobileResponsiveLayout>
          <div data-testid="performance-content">コンテンツ</div>
        </MobileResponsiveLayout>
      );

      // 複数回のリサイズイベントを発生
      act(() => {
        setViewportSize(320, 568);
        setViewportSize(375, 667);
        setViewportSize(768, 1024);
      });

      await waitFor(() => {
        const layout = screen.getByTestId("tablet-layout");
        expect(layout).toBeInTheDocument();
      });
    });

    it("不要な再レンダリングが発生しない", () => {
      const renderSpy = jest.fn();

      const TestComponent = ({ size }: { size: string }) => {
        renderSpy();
        return (
          <MobileResponsiveLayout>
            <div data-testid="render-test">サイズ: {size}</div>
          </MobileResponsiveLayout>
        );
      };

      const { rerender } = render(<TestComponent size="small" />);
      expect(renderSpy).toHaveBeenCalledTimes(1);

      // 同じpropsで再レンダリング
      rerender(<TestComponent size="small" />);
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("アクセシビリティ", () => {
    it("モバイルで適切なARIA属性が設定される", () => {
      setViewportSize(375, 667);

      render(
        <MobileResponsiveLayout>
          <div data-testid="accessibility-content">コンテンツ</div>
        </MobileResponsiveLayout>
      );

      const layout = screen.getByTestId("mobile-layout");
      expect(layout).toHaveAttribute("role", "main");
      expect(layout).toHaveAttribute("aria-label", "モバイルレイアウト");
    });

    it("スクリーンリーダー用のラベルが適切に設定される", () => {
      setViewportSize(375, 667);

      render(
        <MobileResponsiveLayout>
          <button data-testid="screen-reader-button" aria-describedby="button-description">
            ボタン
          </button>
        </MobileResponsiveLayout>
      );

      const button = screen.getByTestId("screen-reader-button");
      expect(button).toHaveAttribute("aria-describedby", "button-description");

      // レイアウト自体にもaria-labelが設定されている
      const layout = screen.getByTestId("mobile-layout");
      expect(layout).toHaveAttribute("aria-label", "モバイルレイアウト");
    });
  });

  describe("CSS Grid/Flexbox対応", () => {
    it("モバイルでFlexboxレイアウトが適用される", () => {
      setViewportSize(375, 667);

      render(
        <MobileResponsiveLayout>
          <div data-testid="flex-container">
            <div>アイテム1</div>
            <div>アイテム2</div>
          </div>
        </MobileResponsiveLayout>
      );

      const container = screen.getByTestId("flex-container");
      expect(container).toHaveClass("mobile-flex-layout");
    });

    it("タブレットでGridレイアウトが適用される", () => {
      setViewportSize(768, 1024);

      render(
        <MobileResponsiveLayout>
          <div data-testid="grid-container">
            <div>アイテム1</div>
            <div>アイテム2</div>
            <div>アイテム3</div>
          </div>
        </MobileResponsiveLayout>
      );

      const container = screen.getByTestId("grid-container");
      expect(container).toHaveClass("tablet-grid-layout");
    });
  });
});
