/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EventListWithFilters } from '@/components/events/event-list-with-filters';
import type { Event } from '@/types/event';

// Next.js routerをモック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseSearchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;

describe('EventListWithFilters - サーバー統一ソートテスト', () => {
  const mockEvents: Event[] = Array.from({ length: 30 }, (_, i) => ({
    id: `event-${i + 1}`,
    title: `テストイベント ${i + 1}`,
    date: new Date(2024, 0, i + 1).toISOString(),
    location: `会場${i + 1}`,
    fee: (i + 1) * 1000,
    capacity: 50,
    status: 'upcoming' as const,
    creator_name: 'テストユーザー',
    attendances_count: i + 1,
    created_at: new Date(2024, 0, i + 1).toISOString(),
  }));

  const mockPush = jest.fn();
  const mockSearchParams = {
    toString: jest.fn(() => ''),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      prefetch: jest.fn(),
    } as any);
    mockUseSearchParams.mockReturnValue(mockSearchParams as any);
  });

  describe('サーバー統一ソート', () => {

    it('ソート変更時にURLパラメータが正しく更新されること', async () => {
      render(
        <EventListWithFilters 
          events={mockEvents}
          initialSortBy="date"
          initialSortOrder="asc"
        />
      );

      // 参加者数降順ソートを選択
      const sortBySelect = screen.getByDisplayValue('開催日時');
      fireEvent.change(sortBySelect, { target: { value: 'attendances_count' } });

      // URLパラメータが更新されることを確認
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('sortBy=attendances_count')
        );
      });
    });

    it('フィルター変更時にも現在のソート設定が保持されること', async () => {
      render(
        <EventListWithFilters 
          events={mockEvents}
          initialSortBy="fee"
          initialSortOrder="asc"
        />
      );

      // フィルターを変更
      const statusSelect = screen.getByDisplayValue('すべて');
      fireEvent.change(statusSelect, { target: { value: 'upcoming' } });

      // URLパラメータにソート設定が保持されることを確認
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringMatching(/sortBy=fee/)
        );
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringMatching(/status=upcoming/)
        );
      });
    });

    it('複数のソート・フィルター操作でURLパラメータが正しく更新されること', async () => {
      render(
        <EventListWithFilters 
          events={mockEvents}
          initialSortBy="date"
          initialSortOrder="asc"
        />
      );

      // 1. ソート変更
      const sortBySelect = screen.getByDisplayValue('開催日時');
      fireEvent.change(sortBySelect, { target: { value: 'created_at' } });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('sortBy=created_at')
        );
      });

      // 2. フィルター変更
      const paymentSelect = screen.getByDisplayValue('すべて');
      fireEvent.change(paymentSelect, { target: { value: 'paid' } });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('payment=paid')
        );
      });
    });

    it('初期値が正しく設定されること', async () => {
      render(
        <EventListWithFilters 
          events={mockEvents}
          initialSortBy="fee"
          initialSortOrder="desc"
          initialStatusFilter="upcoming"
        />
      );

      // 初期値が正しく表示されることを確認
      expect(screen.getByDisplayValue('参加費')).toBeInTheDocument();
      expect(screen.getByDisplayValue('upcoming')).toBeInTheDocument();
    });
  });

  describe('表示機能', () => {
    it('イベントが正しく表示されること', async () => {
      render(
        <EventListWithFilters 
          events={mockEvents}
          initialSortBy="date"
          initialSortOrder="asc"
        />
      );

      // イベントカードが表示されることを確認
      await waitFor(() => {
        const eventCards = screen.getAllByTestId(/event-card/);
        expect(eventCards).toHaveLength(mockEvents.length);
      });
    });
  });

  describe('URLパラメータ管理', () => {
    it('空の値やdefault値はURLパラメータから削除されること', async () => {
      render(
        <EventListWithFilters 
          events={mockEvents}
          initialSortBy="date"
          initialSortOrder="asc"
        />
      );

      // デフォルト値に戻す
      const statusSelect = screen.getByDisplayValue('すべて');
      fireEvent.change(statusSelect, { target: { value: 'all' } });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.not.stringContaining('status=all')
        );
      });
    });
  });
});