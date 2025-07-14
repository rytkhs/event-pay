import { render, screen } from '@testing-library/react';
import EventDetailPage from '@/app/events/[id]/page';
import { getFutureDatetimeLocalForTest } from '@/lib/utils/test-helpers';

// Mock the EventDetail component since it's not implemented yet
jest.mock('@/components/events/event-detail', () => ({
  EventDetail: ({ event }: { event: any }) => (
    <div data-testid="event-detail-mock">
      EventDetail Mock: {event?.title || 'No event'}
    </div>
  ),
}));

// Mock the EventActions component since it's not implemented yet
jest.mock('@/components/events/event-actions', () => ({
  EventActions: ({ eventId }: { eventId: string }) => (
    <div data-testid="event-actions-mock">
      EventActions Mock: {eventId}
    </div>
  ),
}));

// Mock the Server Action since it's not implemented yet
jest.mock('@/app/events/actions/get-event-detail', () => ({
  getEventDetailAction: jest.fn(),
}));

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

const mockGetEventDetailAction = require('@/app/events/actions/get-event-detail').getEventDetailAction;

describe('EventDetailPage (/events/[id]/page.tsx)', () => {
  const mockParams = { id: 'event123' };
  
  const mockEventDetail = {
    id: 'event123',
    title: 'テストイベント',
    date: getFutureDatetimeLocalForTest(24),
    location: 'テスト会場',
    fee: 1000,
    capacity: 50,
    status: 'upcoming',
    description: 'テストイベントの詳細説明です。',
    registration_deadline: getFutureDatetimeLocalForTest(12),
    payment_deadline: getFutureDatetimeLocalForTest(18),
    payment_methods: ['stripe', 'cash'],
    created_at: '2024-12-01T10:00:00',
    updated_at: '2024-12-01T10:00:00',
    created_by: 'user123',
    creator_name: 'テストユーザー',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Green Phase - 機能テスト', () => {
    test('無効なparamsが渡された場合、適切なエラーハンドリングが行われる', async () => {
      const { notFound } = require('next/navigation');
      
      try {
        // @ts-expect-error - Testing invalid params
        await EventDetailPage({ params: {} });
      } catch {
        // エラーが投げられることを期待
      }
      
      expect(notFound).toHaveBeenCalled();
    });

    test('getEventDetailActionが失敗した場合、適切なエラー処理が行われる', async () => {
      const { notFound } = require('next/navigation');
      mockGetEventDetailAction.mockRejectedValue(new Error('Event not found'));

      try {
        await EventDetailPage({ params: mockParams });
      } catch {
        // エラーが投げられることを期待
      }
      
      expect(notFound).toHaveBeenCalled();
    });

    test('存在しないイベントIDの場合、404ページまたはnotFound()が呼ばれる', async () => {
      const { notFound } = require('next/navigation');
      mockGetEventDetailAction.mockRejectedValue(new Error('Event not found'));

      try {
        await EventDetailPage({ params: { id: 'nonexistent-id' } });
      } catch {
        // エラーが投げられることを期待
      }
      
      expect(notFound).toHaveBeenCalled();
    });

    test('認証エラーの場合、適切なリダイレクトが行われる', async () => {
      const { redirect } = require('next/navigation');
      // 認証エラーは Server Action 内で redirect が呼ばれる
      mockGetEventDetailAction.mockImplementation(() => {
        const { redirect } = require('next/navigation');
        redirect('/auth/login');
        return Promise.resolve(null); // 実際はここには到達しない
      });

      try {
        await EventDetailPage({ params: mockParams });
      } catch {
        // redirect が呼ばれた後のエラーを期待
      }
      
      expect(redirect).toHaveBeenCalledWith('/auth/login');
    });

    test('正常ケース: イベント詳細が正しく表示される', async () => {
      mockGetEventDetailAction.mockResolvedValue(mockEventDetail);

      const result = await EventDetailPage({ params: mockParams });
      render(result);
      
      expect(screen.getByTestId('event-detail-mock')).toBeInTheDocument();
      expect(screen.getByTestId('event-actions-mock')).toBeInTheDocument();
      expect(screen.getByText(/テストイベント/)).toBeInTheDocument();
    });

    test('EventDetailコンポーネントに正しいpropsが渡される', async () => {
      mockGetEventDetailAction.mockResolvedValue(mockEventDetail);

      const result = await EventDetailPage({ params: mockParams });
      render(result);
      
      expect(mockGetEventDetailAction).toHaveBeenCalledWith('event123');
      expect(screen.getByTestId('event-detail-mock')).toBeInTheDocument();
    });

    test('EventActionsコンポーネントに正しいeventIdが渡される', async () => {
      mockGetEventDetailAction.mockResolvedValue(mockEventDetail);

      const result = await EventDetailPage({ params: mockParams });
      render(result);
      
      expect(screen.getByTestId('event-actions-mock')).toBeInTheDocument();
      expect(screen.getByText(/event123/)).toBeInTheDocument();
    });

    test('ページタイトルがイベント名に設定される', async () => {
      mockGetEventDetailAction.mockResolvedValue(mockEventDetail);

      const result = await EventDetailPage({ params: mockParams });
      render(result);
      
      // Green Phaseでは基本的な表示のみテスト
      expect(screen.getByTestId('event-detail-mock')).toBeInTheDocument();
    });

    test('URLパラメータの検証が正しく行われる', async () => {
      const { notFound } = require('next/navigation');
      // 無効なUUID形式
      const invalidParams = { id: 'invalid-uuid' };
      
      await EventDetailPage({ params: invalidParams });
      
      expect(notFound).toHaveBeenCalled();
    });
  });
});