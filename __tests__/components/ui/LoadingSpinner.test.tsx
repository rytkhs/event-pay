import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

describe("LoadingSpinner コンポーネント", () => {
  describe("基本的なレンダリング", () => {
    test("デフォルトのローディングスピナーが正しく表示される", () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole("status");
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveAttribute("aria-label", "読み込み中");
    });

    test("デフォルトのプロパティが正しく設定される", () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--md");
      expect(spinner).toHaveClass("loading-spinner--spinner");
    });
  });

  describe("サイズバリエーション", () => {
    test("小さなサイズ（sm）のスピナーが正しく表示される", () => {
      render(<LoadingSpinner size="sm" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--sm");
    });

    test("中サイズ（md）のスピナーが正しく表示される", () => {
      render(<LoadingSpinner size="md" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--md");
    });

    test("大きなサイズ（lg）のスピナーが正しく表示される", () => {
      render(<LoadingSpinner size="lg" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--lg");
    });
  });

  describe("バリアントテスト", () => {
    test("スピナーバリアントが正しく表示される", () => {
      render(<LoadingSpinner variant="spinner" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--spinner");
    });

    test("ドットバリアントが正しく表示される", () => {
      render(<LoadingSpinner variant="dots" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--dots");
    });

    test("パルスバリアントが正しく表示される", () => {
      render(<LoadingSpinner variant="pulse" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--pulse");
    });
  });

  describe("カスタムスタイリング", () => {
    test("カスタムクラスが正しく適用される", () => {
      render(<LoadingSpinner className="custom-spinner" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("custom-spinner");
    });

    test("カスタムカラーが正しく適用される", () => {
      render(<LoadingSpinner color="red" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveStyle({ color: "rgb(255, 0, 0)" });
    });
  });

  describe("アクセシビリティ", () => {
    test("適切なARIA属性が設定される", () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveAttribute("role", "status");
      expect(spinner).toHaveAttribute("aria-label", "読み込み中");
      expect(spinner).toHaveAttribute("aria-live", "polite");
    });

    test("カスタムのaria-labelが設定される", () => {
      render(<LoadingSpinner aria-label="データを処理中" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveAttribute("aria-label", "データを処理中");
    });

    test("非視覚的なユーザー向けのテキストが含まれる", () => {
      render(<LoadingSpinner />);

      const srText = screen.getByText("読み込み中");
      expect(srText).toBeInTheDocument();
      expect(srText).toHaveClass("sr-only");
    });
  });

  describe("パフォーマンス最適化", () => {
    test("reduce-motionの設定が適用される", () => {
      // prefers-reduced-motionを設定
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      render(<LoadingSpinner />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--reduced-motion");
    });

    test("GPUアクセラレーション用のスタイルが適用される", () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole("status");
      const computedStyle = window.getComputedStyle(spinner);
      expect(computedStyle.transform).toContain("translateZ(0)");
    });
  });

  describe("レスポンシブデザイン", () => {
    test("モバイル画面でコンパクトなスピナーが表示される", () => {
      // モバイル画面をシミュレート
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        value: 375,
      });

      render(<LoadingSpinner responsive />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--responsive");
    });
  });

  describe("アニメーション制御", () => {
    test("アニメーションが一時停止できる", () => {
      render(<LoadingSpinner animate={false} />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--paused");
    });

    test("アニメーション速度をカスタマイズできる", () => {
      render(<LoadingSpinner animationDuration="2s" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveStyle({ animationDuration: "2s" });
    });
  });

  describe("エラーハンドリング", () => {
    test("無効なvariantが渡された場合はデフォルトが使用される", () => {
      // @ts-ignore - テスト用に無効な型を渡す
      render(<LoadingSpinner variant="invalid" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--spinner");
    });

    test("無効なsizeが渡された場合はデフォルトが使用される", () => {
      // @ts-ignore - テスト用に無効な型を渡す
      render(<LoadingSpinner size="invalid" />);

      const spinner = screen.getByRole("status");
      expect(spinner).toHaveClass("loading-spinner--md");
    });
  });
});
