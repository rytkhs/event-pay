import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/events/pagination';

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

const mockPush = jest.fn();
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseSearchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;

describe('Pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    } as any);
  });

  describe('基本的なページネーション表示', () => {
    it('現在のページ、総件数、ページサイズに基づいてページネーションが表示される', () => {
      // テストリスト項目1: ページ番号1で10件のイベントを取得できる
      mockUseSearchParams.mockReturnValue(new URLSearchParams('page=1') as any);

      render(
        <Pagination
          currentPage={1}
          totalCount={25}
          pageSize={10}
          onPageChange={() => {}}
        />
      );

      // ページ1が選択されていることを確認
      expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
      
      // 次のページボタンが有効であることを確認（全25件で10件ずつなので3ページ存在）
      expect(screen.getByRole('button', { name: '次のページ' })).not.toBeDisabled();
      
      // 前のページボタンが無効であることを確認（1ページ目なので）
      expect(screen.getByRole('button', { name: '前のページ' })).toBeDisabled();
    });

    it('ページ番号をクリックしてページ遷移できる', async () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams('page=1') as any);
      const onPageChange = jest.fn();

      render(
        <Pagination
          currentPage={1}
          totalCount={25}
          pageSize={10}
          onPageChange={onPageChange}
        />
      );

      // ページ2をクリック
      fireEvent.click(screen.getByRole('button', { name: '2' }));

      await waitFor(() => {
        expect(onPageChange).toHaveBeenCalledWith(2);
      });
    });

    it('前のページボタンが適切に無効化される（1ページ目）', () => {
      // テストリスト項目9: 前のページボタンが適切に無効化される（1ページ目）
      mockUseSearchParams.mockReturnValue(new URLSearchParams('page=1') as any);

      render(
        <Pagination
          currentPage={1}
          totalCount={25}
          pageSize={10}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByRole('button', { name: '前のページ' })).toBeDisabled();
    });

    it('次のページボタンが適切に無効化される（最後のページ）', () => {
      // テストリスト項目10: 次のページボタンが適切に無効化される（最後のページ）
      mockUseSearchParams.mockReturnValue(new URLSearchParams('page=3') as any);

      render(
        <Pagination
          currentPage={3}
          totalCount={25}
          pageSize={10}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByRole('button', { name: '次のページ' })).toBeDisabled();
    });

    it('1ページ以下の場合はページネーションを表示しない', () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams('') as any);

      render(
        <Pagination
          currentPage={1}
          totalCount={5}
          pageSize={10}
          onPageChange={() => {}}
        />
      );

      // ページネーションが表示されないことを確認
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('ページ2で正しい状態が表示される', () => {
      // テストリスト項目2: ページ番号2で次の10件のイベントを取得できる
      mockUseSearchParams.mockReturnValue(new URLSearchParams('page=2') as any);

      render(
        <Pagination
          currentPage={2}
          totalCount={25}
          pageSize={10}
          onPageChange={() => {}}
        />
      );

      // ページ2が選択されていることを確認
      expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
      
      // 前のページボタンが有効であることを確認
      expect(screen.getByRole('button', { name: '前のページ' })).not.toBeDisabled();
      
      // 次のページボタンが有効であることを確認
      expect(screen.getByRole('button', { name: '次のページ' })).not.toBeDisabled();
    });
  });

  describe('エラーハンドリング', () => {
    it('無効なページ番号（0）でも適切に動作する', () => {
      // テストリスト項目13: 無効なページ番号（負の数、0）の処理
      mockUseSearchParams.mockReturnValue(new URLSearchParams('page=0') as any);

      render(
        <Pagination
          currentPage={0}
          totalCount={25}
          pageSize={10}
          onPageChange={() => {}}
        />
      );

      // 前のページボタンが無効であることを確認（不正なページ番号の場合）
      expect(screen.getByRole('button', { name: '前のページ' })).toBeDisabled();
    });

    it('負のページ番号でも適切に動作する', () => {
      mockUseSearchParams.mockReturnValue(new URLSearchParams('page=-1') as any);

      render(
        <Pagination
          currentPage={-1}
          totalCount={25}
          pageSize={10}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByRole('button', { name: '前のページ' })).toBeDisabled();
    });
  });

  describe('ページサイズとtotalCountの関係', () => {
    it('ページサイズ（limit）を指定して正しい総ページ数が計算される', () => {
      // テストリスト項目4: ページサイズ（limit）を指定できる
      // テストリスト項目5: 総件数（total）が正しく返される
      mockUseSearchParams.mockReturnValue(new URLSearchParams('page=1') as any);

      render(
        <Pagination
          currentPage={1}
          totalCount={27} // 27件のデータ
          pageSize={5}    // 5件ずつ表示 = 6ページ
          onPageChange={() => {}}
        />
      );

      // 6ページある場合、最大5ページまで表示されることを確認
      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument();
      // 最大5ページまでなので6ページ目は表示されない
      expect(screen.queryByRole('button', { name: '6' })).not.toBeInTheDocument();
    });
  });
});