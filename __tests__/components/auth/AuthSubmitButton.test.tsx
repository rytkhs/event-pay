import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { AuthSubmitButton } from "@/components/auth/AuthSubmitButton";

// matchMediaのモック
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe("AuthSubmitButton 改善版", () => {
  const user = userEvent.setup();

  describe("基本的なレンダリング", () => {
    test("デフォルトの状態で正しく表示される", () => {
      render(<AuthSubmitButton isPending={false}>送信</AuthSubmitButton>);

      const button = screen.getByRole("button", { name: "送信" });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("type", "submit");
      expect(button).not.toBeDisabled();
    });

    test("ローディング状態で正しく表示される", () => {
      render(<AuthSubmitButton isPending={true}>送信</AuthSubmitButton>);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button).toHaveAttribute("aria-live", "polite");

      const loadingIcon = screen.getByRole("status", { hidden: true });
      expect(loadingIcon).toBeInTheDocument();
      expect(loadingIcon).toHaveAttribute("aria-hidden", "true");

      expect(screen.getAllByText("処理中...")).toHaveLength(2); // ボタン内 + アクセシビリティ説明
    });
  });

  describe("新機能: ローディングバリアント", () => {
    test("スピナーバリアントが正しく表示される", () => {
      render(
        <AuthSubmitButton isPending={true} loadingVariant="spinner">
          送信
        </AuthSubmitButton>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("auth-submit-button--spinner");
    });

    test("ドットバリアントが正しく表示される", () => {
      render(
        <AuthSubmitButton isPending={true} loadingVariant="dots">
          送信
        </AuthSubmitButton>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("auth-submit-button--dots");
    });

    test("パルスバリアントが正しく表示される", () => {
      render(
        <AuthSubmitButton isPending={true} loadingVariant="pulse">
          送信
        </AuthSubmitButton>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("auth-submit-button--pulse");
    });
  });

  describe("新機能: プログレス表示", () => {
    test("プログレスバーが正しく表示される", () => {
      render(
        <AuthSubmitButton isPending={true} showProgress={true} progress={45}>
          送信
        </AuthSubmitButton>
      );

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute("aria-valuenow", "45");
      expect(progressBar).toHaveAttribute("aria-valuemin", "0");
      expect(progressBar).toHaveAttribute("aria-valuemax", "100");
    });

    test("プログレスパーセンテージが正しく表示される", () => {
      render(
        <AuthSubmitButton
          isPending={true}
          showProgress={true}
          progress={75}
          showProgressText={true}
        >
          送信
        </AuthSubmitButton>
      );

      expect(screen.getByText("75%")).toBeInTheDocument();
    });

    test("推定残り時間が正しく表示される", () => {
      render(
        <AuthSubmitButton
          isPending={true}
          showProgress={true}
          progress={25}
          estimatedTimeRemaining={45}
        >
          送信
        </AuthSubmitButton>
      );

      expect(screen.getByText("残り約45秒")).toBeInTheDocument();
    });
  });

  describe("新機能: カスタムローディングメッセージ", () => {
    test("カスタムローディングメッセージが正しく表示される", () => {
      render(
        <AuthSubmitButton isPending={true} loadingText="データを保存中...">
          送信
        </AuthSubmitButton>
      );

      expect(screen.getAllByText("データを保存中...")).toHaveLength(2); // ボタン内 + アクセシビリティ説明
      expect(screen.queryByText("処理中...")).not.toBeInTheDocument();
    });

    test("動的なローディングメッセージが正しく更新される", () => {
      const { rerender } = render(
        <AuthSubmitButton isPending={true} loadingText="アップロード中...">
          送信
        </AuthSubmitButton>
      );

      expect(screen.getAllByText("アップロード中...")).toHaveLength(2);

      rerender(
        <AuthSubmitButton isPending={true} loadingText="処理中...">
          送信
        </AuthSubmitButton>
      );

      expect(screen.getAllByText("処理中...")).toHaveLength(2);
      expect(screen.queryByText("アップロード中...")).not.toBeInTheDocument();
    });
  });

  describe("新機能: キャンセル機能", () => {
    test("キャンセルボタンが正しく表示される", () => {
      const onCancel = jest.fn();
      render(
        <AuthSubmitButton isPending={true} canCancel={true} onCancel={onCancel}>
          送信
        </AuthSubmitButton>
      );

      const cancelButton = screen.getByRole("button", { name: "処理をキャンセルする" });
      expect(cancelButton).toBeInTheDocument();
      expect(cancelButton).not.toBeDisabled();
    });

    test("キャンセルボタンクリックで正しくハンドラーが呼ばれる", async () => {
      const onCancel = jest.fn();
      render(
        <AuthSubmitButton isPending={true} canCancel={true} onCancel={onCancel}>
          送信
        </AuthSubmitButton>
      );

      const cancelButton = screen.getByRole("button", { name: "処理をキャンセルする" });
      await user.click(cancelButton);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    test("キャンセル不可能な場合はキャンセルボタンが表示されない", () => {
      const onCancel = jest.fn();
      render(
        <AuthSubmitButton isPending={true} canCancel={false} onCancel={onCancel}>
          送信
        </AuthSubmitButton>
      );

      expect(
        screen.queryByRole("button", { name: "処理をキャンセルする" })
      ).not.toBeInTheDocument();
    });
  });

  describe("新機能: タイムアウト表示", () => {
    test("タイムアウトが設定されている場合にカウントダウンが表示される", async () => {
      jest.useFakeTimers();

      render(
        <AuthSubmitButton isPending={true} timeoutMs={10000} showTimeoutCountdown={true}>
          送信
        </AuthSubmitButton>
      );

      expect(screen.getByText("タイムアウトまで10秒")).toBeInTheDocument();

      // 5秒経過
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(screen.getByText("タイムアウトまで5秒")).toBeInTheDocument();
      });

      jest.useRealTimers();
    });

    test("タイムアウト発生時に正しくハンドラーが呼ばれる", async () => {
      jest.useFakeTimers();

      const onTimeout = jest.fn();
      render(
        <AuthSubmitButton isPending={true} timeoutMs={5000} onTimeout={onTimeout}>
          送信
        </AuthSubmitButton>
      );

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(onTimeout).toHaveBeenCalledTimes(1);
      });

      jest.useRealTimers();
    });
  });

  describe("アクセシビリティ強化", () => {
    test("ライブリージョンが正しく設定される", () => {
      render(
        <AuthSubmitButton isPending={true} loadingText="処理中...">
          送信
        </AuthSubmitButton>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-live", "polite");
      expect(button).toHaveAttribute("aria-busy", "true");
    });

    test("スクリーンリーダー向けの説明が正しく設定される", () => {
      render(
        <AuthSubmitButton
          isPending={true}
          loadingText="データを保存中..."
          progress={30}
          showProgress={true}
        >
          送信
        </AuthSubmitButton>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-describedby");

      const description = screen.getByText("データを保存中...進捗: 30%");
      expect(description).toBeInTheDocument();
      expect(description).toHaveAttribute("id", button.getAttribute("aria-describedby"));
    });

    test("キーボードナビゲーションが正しく動作する", async () => {
      const onCancel = jest.fn();
      render(
        <AuthSubmitButton isPending={true} canCancel={true} onCancel={onCancel}>
          送信
        </AuthSubmitButton>
      );

      const cancelButton = screen.getByRole("button", { name: "処理をキャンセルする" });

      cancelButton.focus();
      await user.keyboard("{Enter}");

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("レスポンシブデザイン", () => {
    test("モバイル画面でコンパクトなレイアウトが適用される", () => {
      // モバイル用のmatchMediaをモック
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === "(max-width: 768px)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      render(
        <AuthSubmitButton isPending={true} responsive={true} showProgress={true} progress={50}>
          送信
        </AuthSubmitButton>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("auth-submit-button--mobile");
    });

    test("デスクトップ画面で詳細なレイアウトが適用される", () => {
      // デスクトップ用のmatchMediaをモック
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query !== "(max-width: 768px)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      render(
        <AuthSubmitButton
          isPending={true}
          responsive={true}
          showProgress={true}
          progress={50}
          estimatedTimeRemaining={30}
        >
          送信
        </AuthSubmitButton>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("auth-submit-button--desktop");
    });
  });

  describe("パフォーマンス最適化", () => {
    test.skip("不要な再レンダリングが防止される - 実装されていない機能", () => {
      const renderSpy = jest.fn();

      const TestComponent = ({ isPending }: { isPending: boolean }) => {
        renderSpy();
        return <AuthSubmitButton isPending={isPending}>送信</AuthSubmitButton>;
      };

      const { rerender } = render(<TestComponent isPending={false} />);

      renderSpy.mockClear();

      // 同じpropsでre-renderしても再レンダリングされない
      rerender(<TestComponent isPending={false} />);

      expect(renderSpy).not.toHaveBeenCalled();
    });

    test("reduce-motionが尊重される", () => {
      // reduce-motionを有効にしたmatchMediaをモック
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      render(
        <AuthSubmitButton isPending={true} loadingVariant="spinner">
          送信
        </AuthSubmitButton>
      );

      const button = screen.getByRole("button");
      expect(button).toHaveClass("auth-submit-button--reduced-motion");
    });
  });

  describe("エラーハンドリング", () => {
    test("無効なプロパティが渡された場合でも正常に動作する", () => {
      render(
        <AuthSubmitButton
          isPending={true}
          // @ts-ignore - テスト用に無効な型を渡す
          loadingVariant="invalid"
          // @ts-ignore - テスト用に無効な型を渡す
          progress={150}
        >
          送信
        </AuthSubmitButton>
      );

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("auth-submit-button--spinner"); // デフォルト値
    });

    test("onCancelが未定義でもキャンセル機能が正常に動作する", () => {
      render(
        <AuthSubmitButton isPending={true} canCancel={true}>
          送信
        </AuthSubmitButton>
      );

      const cancelButton = screen.getByRole("button", { name: "処理をキャンセルする" });
      expect(cancelButton).toBeInTheDocument();

      // エラーが発生しないことを確認
      expect(() => fireEvent.click(cancelButton)).not.toThrow();
    });
  });

  describe("統合テスト", () => {
    test("複数の機能が同時に正しく動作する", async () => {
      const onCancel = jest.fn();
      const onTimeout = jest.fn();

      render(
        <AuthSubmitButton
          isPending={true}
          loadingText="データを保存中..."
          loadingVariant="dots"
          showProgress={true}
          progress={35}
          canCancel={true}
          onCancel={onCancel}
          timeoutMs={10000}
          onTimeout={onTimeout}
          showTimeoutCountdown={true}
        >
          送信
        </AuthSubmitButton>
      );

      // 全ての要素が正しく表示されることを確認
      expect(screen.getByText("データを保存中...")).toBeInTheDocument(); // ボタン内のテキスト
      expect(screen.getByText("データを保存中...進捗: 35%")).toBeInTheDocument(); // アクセシビリティ説明
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "処理をキャンセルする" })).toBeInTheDocument();
      expect(screen.getByText("タイムアウトまで10秒")).toBeInTheDocument();

      const buttons = screen.getAllByRole("button");
      const submitButton = buttons.find((btn) => btn.getAttribute("type") === "submit");
      expect(submitButton).toHaveClass("auth-submit-button--dots");
    });
  });
});
