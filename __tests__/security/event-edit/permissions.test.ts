/**
 * Issue 37: イベント編集フォームUI - 権限・認証テスト
 * 実装済みEventEditPageコンポーネントのテスト
 */

import { render, screen } from '@testing-library/react';
import { redirect, notFound } from 'next/navigation';
import EventEditPage from '@/app/events/[id]/edit/page';

// Next.js navigation mock
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  notFound: jest.fn(),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: jest.fn(),
  })),
}));

// EventEditFormコンポーネントのモック
jest.mock('@/components/events/event-edit-form', () => ({
  EventEditForm: jest.fn().mockImplementation(() => 'EventEditForm Mock'),
}));

// EditRestrictionsNoticeコンポーネントのモック
jest.mock('@/components/events/edit-restrictions-notice', () => ({
  EditRestrictionsNotice: jest.fn().mockImplementation(() => 'EditRestrictionsNotice Mock'),
}));

// Supabaseクライアント作成をモック
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => globalThis.mockSupabase),
}));

describe('イベント編集権限テスト', () => {
  const mockEventId = 'test-event-id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('未認証ユーザーのアクセス制御', () => {
    it('未認証ユーザーは編集ページにアクセスできない', async () => {
      // 未認証状態をモック
      globalThis.mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      // redirect関数がthrowするようにして、テストが早期終了するようにする
      (redirect as jest.Mock).mockImplementation(() => {
        throw new Error('REDIRECT_TO_LOGIN');
      });

      // ページコンポーネントを実行（認証失敗時はeventクエリは実行されない）
      await expect(EventEditPage({ params: { id: mockEventId } })).rejects.toThrow('REDIRECT_TO_LOGIN');

      // 認証ページにリダイレクトされることを確認
      expect(redirect).toHaveBeenCalledWith('/auth/login');
    });

    it('認証エラーが発生した場合、適切にハンドリングされる', async () => {
      // 認証エラーをモック
      globalThis.mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Authentication failed' },
      });

      // redirect関数がthrowするようにして、テストが早期終了するようにする
      (redirect as jest.Mock).mockImplementation(() => {
        throw new Error('REDIRECT_TO_LOGIN');
      });

      // ページコンポーネントを実行（認証失敗時はeventクエリは実行されない）
      await expect(EventEditPage({ params: { id: mockEventId } })).rejects.toThrow('REDIRECT_TO_LOGIN');

      expect(redirect).toHaveBeenCalledWith('/auth/login');
    });
  });

  describe('イベント所有者権限チェック', () => {
    it('他人のイベントは編集できない', async () => {
      // 認証済みユーザーをモック
      globalThis.mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
        error: null,
      });

      // 他人のイベントをモック - 詳細な設定
      const mockQueryBuilder = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockEventId,
                title: 'Test Event',
                created_by: 'other-user-456', // 他のユーザーが作成
                attendances: [],
              },
              error: null,
            }),
          }),
        }),
      };
      
      globalThis.mockSupabase.from.mockReturnValue(mockQueryBuilder);

      // redirect関数がthrowするようにして、テストが早期終了するようにする
      (redirect as jest.Mock).mockImplementation(() => {
        throw new Error('REDIRECT_TO_EVENT_DETAIL');
      });

      await expect(EventEditPage({ params: { id: mockEventId } })).rejects.toThrow('REDIRECT_TO_EVENT_DETAIL');

      // 403エラーページまたはイベント詳細ページにリダイレクト
      expect(redirect).toHaveBeenCalledWith(`/events/${mockEventId}`);
    });

    it('自分のイベントは編集可能', async () => {
      const currentUserId = 'user-123';
      
      // redirectをリセットして、正常ケースでthrowしないようにする
      (redirect as jest.Mock).mockImplementation(jest.fn());
      (notFound as jest.Mock).mockImplementation(jest.fn());
      
      // 認証済みユーザーをモック
      globalThis.mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: currentUserId, email: 'user@example.com' } },
        error: null,
      });

      // 自分のイベントをモック - 詳細な設定
      const mockQueryBuilder = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: mockEventId,
                title: 'My Event',
                created_by: currentUserId, // 自分が作成
                attendances: [{ id: '1', status: 'confirmed' }],
              },
              error: null,
            }),
          }),
        }),
      };
      
      globalThis.mockSupabase.from.mockReturnValue(mockQueryBuilder);

      // ページが正常にレンダリングされることを確認
      const result = await EventEditPage({ params: { id: mockEventId } });
      expect(result).toBeDefined();
      expect(redirect).not.toHaveBeenCalled();
    });
  });

  describe('イベント存在チェック', () => {
    it('存在しないイベントの編集はエラー', async () => {
      // 認証済みユーザーをモック
      globalThis.mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
        error: null,
      });

      // 存在しないイベントをモック - 詳細な設定
      const mockQueryBuilder = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Event not found' },
            }),
          }),
        }),
      };
      
      globalThis.mockSupabase.from.mockReturnValue(mockQueryBuilder);

      // notFound関数がthrowするようにして、テストが早期終了するようにする
      (notFound as jest.Mock).mockImplementation(() => {
        throw new Error('NOT_FOUND');
      });

      await expect(EventEditPage({ params: { id: 'non-existent-event' } })).rejects.toThrow('NOT_FOUND');

      // notFound()が呼ばれることを確認
      expect(notFound).toHaveBeenCalled();
    });

    it('データベースエラーが発生した場合、適切にハンドリングされる', async () => {
      // 認証済みユーザーをモック
      globalThis.mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
        error: null,
      });

      // データベースエラーをモック - 詳細な設定
      const mockQueryBuilder = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database connection failed' },
            }),
          }),
        }),
      };
      
      globalThis.mockSupabase.from.mockReturnValue(mockQueryBuilder);

      // notFound関数がthrowするようにして、テストが早期終了するようにする
      (notFound as jest.Mock).mockImplementation(() => {
        throw new Error('NOT_FOUND');
      });

      await expect(EventEditPage({ params: { id: mockEventId } })).rejects.toThrow('NOT_FOUND');

      // notFound()が呼ばれることを確認
      expect(notFound).toHaveBeenCalled();
    });
  });

  describe('セッション管理', () => {
    it('セッションが無効な場合、再認証が必要', async () => {
      // 無効なセッションをモック
      globalThis.mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid session' },
      });

      // redirect関数がthrowするようにして、テストが早期終了するようにする
      (redirect as jest.Mock).mockImplementation(() => {
        throw new Error('REDIRECT_TO_LOGIN');
      });

      // ページコンポーネントを実行（認証失敗時はeventクエリは実行されない）
      await expect(EventEditPage({ params: { id: mockEventId } })).rejects.toThrow('REDIRECT_TO_LOGIN');

      expect(redirect).toHaveBeenCalledWith('/auth/login');
    });

    it('セッションが期限切れの場合、再認証が必要', async () => {
      // 期限切れセッションをモック
      globalThis.mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Session expired' },
      });

      // redirect関数がthrowするようにして、テストが早期終了するようにする
      (redirect as jest.Mock).mockImplementation(() => {
        throw new Error('REDIRECT_TO_LOGIN');
      });

      // ページコンポーネントを実行（認証失敗時はeventクエリは実行されない）
      await expect(EventEditPage({ params: { id: mockEventId } })).rejects.toThrow('REDIRECT_TO_LOGIN');

      expect(redirect).toHaveBeenCalledWith('/auth/login');
    });
  });
});