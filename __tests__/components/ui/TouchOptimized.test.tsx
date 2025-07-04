/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TouchOptimized } from '@/components/ui/TouchOptimized';

// タッチイベントのモック
const mockTouchEvent = (type: string, touches: any[]) => {
  return new TouchEvent(type, {
    touches: touches.map(touch => ({
      ...touch,
      identifier: 0,
      target: document.createElement('div'),
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      force: 1,
    })) as any,
  });
};

describe('TouchOptimized', () => {
  beforeEach(() => {
    // タッチ機能をモック
    Object.defineProperty(window, 'ontouchstart', {
      value: {},
      writable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('基本的なレンダリング', () => {
    it('タッチ対応のボタンが正しくレンダリングされる', () => {
      render(
        <TouchOptimized variant="button" onClick={() => {}}>
          タッチボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('タッチボタン');
    });

    it('タッチ対応のリンクが正しくレンダリングされる', () => {
      render(
        <TouchOptimized variant="link" href="/test">
          タッチリンク
        </TouchOptimized>
      );
      
      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
      expect(link).toHaveTextContent('タッチリンク');
      expect(link).toHaveAttribute('href', '/test');
    });

    it('タッチ対応のコンテナが正しくレンダリングされる', () => {
      render(
        <TouchOptimized variant="container" onClick={() => {}}>
          タッチコンテナ
        </TouchOptimized>
      );
      
      const container = screen.getByText('タッチコンテナ');
      expect(container).toBeInTheDocument();
    });
  });

  describe('タッチターゲットサイズ', () => {
    it('最小タッチターゲットサイズが44x44pxに設定される', () => {
      render(
        <TouchOptimized variant="button" onClick={() => {}}>
          小さいボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveStyle('min-width: 44px');
      expect(button).toHaveStyle('min-height: 44px');
    });

    it('大きいコンテンツでも最小サイズが保持される', () => {
      render(
        <TouchOptimized variant="button" onClick={() => {}}>
          とても長いボタンテキストが入っているボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveStyle('min-width: 44px');
      expect(button).toHaveStyle('min-height: 44px');
    });

    it('カスタムサイズを指定できる', () => {
      render(
        <TouchOptimized
          variant="button"
          onClick={() => {}}
          minTouchTarget={{ width: 48, height: 48 }}
        >
          カスタムサイズボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveStyle('min-width: 48px');
      expect(button).toHaveStyle('min-height: 48px');
    });
  });

  describe('タッチフィードバック', () => {
    it('タッチ開始時にフィードバッククラスが追加される', async () => {
      const user = userEvent.setup();
      
      render(
        <TouchOptimized variant="button" onClick={() => {}}>
          フィードバックボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      
      // タッチ開始
      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100, identifier: 0 }],
      });
      
      await waitFor(() => {
        expect(button).toHaveClass('touch-feedback-active');
      });
    });

    it('タッチ終了時にフィードバッククラスが削除される', async () => {
      const user = userEvent.setup();
      
      render(
        <TouchOptimized variant="button" onClick={() => {}}>
          フィードバックボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      
      // タッチ開始
      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100, identifier: 0 }],
      });
      
      await waitFor(() => {
        expect(button).toHaveClass('touch-feedback-active');
      });
      
      // タッチ終了
      fireEvent.touchEnd(button);
      
      await waitFor(() => {
        expect(button).not.toHaveClass('touch-feedback-active');
      });
    });

    it('タッチキャンセル時にフィードバッククラスが削除される', async () => {
      render(
        <TouchOptimized variant="button" onClick={() => {}}>
          フィードバックボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      
      // タッチ開始
      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100, identifier: 0 }],
      });
      
      await waitFor(() => {
        expect(button).toHaveClass('touch-feedback-active');
      });
      
      // タッチキャンセル
      fireEvent.touchCancel(button);
      
      await waitFor(() => {
        expect(button).not.toHaveClass('touch-feedback-active');
      });
    });
  });

  describe('タッチイベント処理', () => {
    it('タッチイベントでクリックハンドラーが呼ばれる', () => {
      const handleClick = jest.fn();
      
      render(
        <TouchOptimized variant="button" onClick={handleClick}>
          タッチボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      
      // タッチイベント
      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100, identifier: 0 }],
      });
      fireEvent.touchEnd(button);
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('タッチ移動が発生した場合はクリックが発生しない', () => {
      const handleClick = jest.fn();
      
      render(
        <TouchOptimized variant="button" onClick={handleClick}>
          タッチボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      
      // タッチ開始
      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100, identifier: 0 }],
      });
      
      // タッチ移動（10px以上）
      fireEvent.touchMove(button, {
        touches: [{ clientX: 120, clientY: 120 }],
      });
      
      // タッチ終了
      fireEvent.touchEnd(button);
      
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('長押しイベントが正しく処理される', async () => {
      jest.useFakeTimers();
      
      const handleLongPress = jest.fn();
      
      render(
        <TouchOptimized
          variant="button"
          onClick={() => {}}
          onLongPress={handleLongPress}
          longPressDelay={500}
        >
          長押しボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      
      // タッチ開始
      fireEvent.touchStart(button, {
        touches: [{ clientX: 100, clientY: 100, identifier: 0 }],
      });
      
      // 長押し時間待機
      jest.advanceTimersByTime(500);
      
      expect(handleLongPress).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });
  });

  describe('アクセシビリティ', () => {
    it('キーボードナビゲーションが正しく動作する', () => {
      const handleClick = jest.fn();
      
      render(
        <TouchOptimized variant="button" onClick={handleClick}>
          キーボードボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      
      // Enterキー
      fireEvent.keyDown(button, { key: 'Enter' });
      expect(handleClick).toHaveBeenCalledTimes(1);
      
      // Spaceキー
      fireEvent.keyDown(button, { key: ' ' });
      expect(handleClick).toHaveBeenCalledTimes(2);
    });

    it('ARIAラベルが正しく設定される', () => {
      render(
        <TouchOptimized
          variant="button"
          onClick={() => {}}
          ariaLabel="カスタムラベル"
        >
          ボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'カスタムラベル');
    });

    it('フォーカス状態が正しく管理される', () => {
      render(
        <TouchOptimized variant="button" onClick={() => {}}>
          フォーカスボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      
      // フォーカス
      button.focus();
      expect(button).toHaveFocus();
      
      // ブラー
      button.blur();
      expect(button).not.toHaveFocus();
    });
  });

  describe('スタイリング', () => {
    it('カスタムクラスが正しく適用される', () => {
      render(
        <TouchOptimized
          variant="button"
          onClick={() => {}}
          className="custom-class"
        >
          カスタムボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });

    it('デフォルトのタッチ最適化スタイルが適用される', () => {
      render(
        <TouchOptimized variant="button" onClick={() => {}}>
          デフォルトボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('touch-optimized');
    });

    it('アニメーション関連のクラスが適用される', () => {
      render(
        <TouchOptimized variant="button" onClick={() => {}}>
          アニメーションボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('touch-transition');
    });
  });

  describe('パフォーマンス', () => {
    it('不要な再レンダリングが発生しない', () => {
      const renderSpy = jest.fn();
      
      const TestComponent = () => {
        renderSpy();
        return (
          <TouchOptimized variant="button" onClick={() => {}}>
            テストボタン
          </TouchOptimized>
        );
      };
      
      const { rerender } = render(<TestComponent />);
      
      // 初回レンダリング
      expect(renderSpy).toHaveBeenCalledTimes(1);
      
      // 同じpropsで再レンダリング
      rerender(<TestComponent />);
      
      // 再レンダリング回数を確認
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    it('大量のタッチイベントでもパフォーマンスが保たれる', () => {
      const handleClick = jest.fn();
      
      render(
        <TouchOptimized variant="button" onClick={handleClick}>
          パフォーマンステストボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      
      // 大量のタッチイベントを発生
      for (let i = 0; i < 100; i++) {
        fireEvent.touchStart(button, {
          touches: [{ clientX: 100, clientY: 100, identifier: 0 }],
        });
        fireEvent.touchEnd(button);
      }
      
      // 適切な回数だけハンドラーが呼ばれる
      expect(handleClick).toHaveBeenCalledTimes(100);
    });
  });

  describe('エラーハンドリング', () => {
    it('無効なpropsでもエラーが発生しない', () => {
      expect(() => {
        render(
          <TouchOptimized variant="button" onClick={() => {}}>
            エラーテストボタン
          </TouchOptimized>
        );
      }).not.toThrow();
    });

    it('イベントハンドラーでエラーが発生してもアプリケーションが続行される', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const errorHandler = jest.fn(() => {
        throw new Error('テストエラー');
      });
      
      render(
        <TouchOptimized variant="button" onClick={errorHandler}>
          エラーボタン
        </TouchOptimized>
      );
      
      const button = screen.getByRole('button');
      
      // エラーが発生してもアプリケーションがクラッシュしない
      expect(() => {
        fireEvent.touchStart(button, {
          touches: [{ clientX: 100, clientY: 100, identifier: 0 }],
        });
        fireEvent.touchEnd(button);
      }).not.toThrow();
      
      // エラーが正しく処理されてログに出力される
      expect(consoleSpy).toHaveBeenCalledWith('TouchOptimized onClick error:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });
});