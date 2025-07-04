import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";

describe("SkeletonLoader コンポーネント", () => {
  describe("基本的なレンダリング", () => {
    test("デフォルトのスケルトンローダーが正しく表示される", () => {
      render(<SkeletonLoader />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveClass("skeleton-loader");
    });

    test("デフォルトのサイズが正しく設定される", () => {
      render(<SkeletonLoader />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveStyle({ width: "100%", height: "20px" });
    });
  });

  describe("サイズカスタマイズ", () => {
    test("数値での幅と高さが正しく設定される", () => {
      render(<SkeletonLoader width={200} height={40} />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveStyle({ width: "200px", height: "40px" });
    });

    test("文字列での幅と高さが正しく設定される", () => {
      render(<SkeletonLoader width="50%" height="2rem" />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveStyle({ width: "50%", height: "2rem" });
    });

    test("異なるサイズのスケルトンが同時に表示される", () => {
      render(
        <div>
          <SkeletonLoader width={100} height={20} data-testid="small" />
          <SkeletonLoader width={200} height={40} data-testid="large" />
        </div>
      );

      const smallSkeleton = screen.getByTestId("small");
      const largeSkeleton = screen.getByTestId("large");

      expect(smallSkeleton).toHaveStyle({ width: "100px", height: "20px" });
      expect(largeSkeleton).toHaveStyle({ width: "200px", height: "40px" });
    });
  });

  describe("アニメーション制御", () => {
    test("アニメーションが有効な場合にシマーエフェクトが適用される", () => {
      render(<SkeletonLoader animate={true} />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveClass("skeleton-loader--animated");
    });

    test("アニメーションが無効な場合にシマーエフェクトが適用されない", () => {
      render(<SkeletonLoader animate={false} />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).not.toHaveClass("skeleton-loader--animated");
    });

    test("デフォルトでアニメーションが有効になっている", () => {
      render(<SkeletonLoader />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveClass("skeleton-loader--animated");
    });
  });

  describe("バリアントテスト", () => {
    test("テキストバリアントが正しく表示される", () => {
      render(<SkeletonLoader variant="text" />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveClass("skeleton-loader--text");
    });

    test("イメージバリアントが正しく表示される", () => {
      render(<SkeletonLoader variant="image" />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveClass("skeleton-loader--image");
    });

    test("ボタンバリアントが正しく表示される", () => {
      render(<SkeletonLoader variant="button" />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveClass("skeleton-loader--button");
    });

    test("カードバリアントが正しく表示される", () => {
      render(<SkeletonLoader variant="card" />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveClass("skeleton-loader--card");
    });
  });

  describe("レスポンシブデザイン", () => {
    test("レスポンシブ設定が有効な場合に適切なクラスが適用される", () => {
      render(<SkeletonLoader responsive />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveClass("skeleton-loader--responsive");
    });

    test("モバイル画面でのサイズ調整が適用される", () => {
      // モバイル画面をシミュレート
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        value: 375,
      });

      render(<SkeletonLoader responsive width={200} height={40} />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveClass("skeleton-loader--mobile");
    });
  });

  describe("カスタムスタイリング", () => {
    test("カスタムクラスが正しく適用される", () => {
      render(<SkeletonLoader className="custom-skeleton" />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveClass("custom-skeleton");
    });

    test("カスタムスタイルが正しく適用される", () => {
      render(<SkeletonLoader style={{ borderRadius: "8px" }} />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveStyle({ borderRadius: "8px" });
    });
  });

  describe("アクセシビリティ", () => {
    test("適切なARIA属性が設定される", () => {
      render(<SkeletonLoader />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveAttribute("role", "presentation");
      expect(skeleton).toHaveAttribute("aria-hidden", "true");
    });

    test("reduce-motionの設定が尊重される", () => {
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

      render(<SkeletonLoader />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveClass("skeleton-loader--reduced-motion");
    });
  });

  describe("パフォーマンス最適化", () => {
    test("will-changeプロパティが正しく設定される", () => {
      render(<SkeletonLoader />);

      const skeleton = screen.getByRole("presentation");
      const computedStyle = window.getComputedStyle(skeleton);
      expect(computedStyle.willChange).toBe("transform");
    });

    test("transform3dによるGPUアクセラレーションが適用される", () => {
      render(<SkeletonLoader />);

      const skeleton = screen.getByRole("presentation");
      const computedStyle = window.getComputedStyle(skeleton);
      expect(computedStyle.transform).toContain("translateZ(0)");
    });
  });

  describe("複数のスケルトンローダー", () => {
    test("複数のスケルトンローダーが同時に表示される", () => {
      render(
        <div>
          <SkeletonLoader data-testid="skeleton-1" />
          <SkeletonLoader data-testid="skeleton-2" />
          <SkeletonLoader data-testid="skeleton-3" />
        </div>
      );

      expect(screen.getByTestId("skeleton-1")).toBeInTheDocument();
      expect(screen.getByTestId("skeleton-2")).toBeInTheDocument();
      expect(screen.getByTestId("skeleton-3")).toBeInTheDocument();
    });

    test("フォームフィールドのスケルトンローダーが正しく表示される", () => {
      render(
        <div>
          <SkeletonLoader variant="text" width="100%" height="40px" data-testid="input-field" />
          <SkeletonLoader
            variant="button"
            width="120px"
            height="40px"
            data-testid="submit-button"
          />
        </div>
      );

      const inputSkeleton = screen.getByTestId("input-field");
      const buttonSkeleton = screen.getByTestId("submit-button");

      expect(inputSkeleton).toHaveClass("skeleton-loader--text");
      expect(buttonSkeleton).toHaveClass("skeleton-loader--button");
    });
  });

  describe("エラーハンドリング", () => {
    test("無効なvariantが渡された場合はデフォルトが使用される", () => {
      // @ts-ignore - テスト用に無効な型を渡す
      render(<SkeletonLoader variant="invalid" />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveClass("skeleton-loader");
      expect(skeleton).not.toHaveClass("skeleton-loader--invalid");
    });

    test("負の値のサイズが渡された場合はデフォルトが使用される", () => {
      render(<SkeletonLoader width={-100} height={-20} />);

      const skeleton = screen.getByRole("presentation");
      expect(skeleton).toHaveStyle({ width: "100%", height: "20px" });
    });
  });
});
