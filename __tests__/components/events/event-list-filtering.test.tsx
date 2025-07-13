import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventListWithFilters } from '@/components/events/event-list-with-filters';
import { Event } from '@/types/event';

const mockEvents: Event[] = [
  {
    id: 'event-1',
    title: '有料イベント（開催予定）',
    date: '2024-06-01T10:00:00Z',
    location: '東京会議室',
    fee: 1000,
    capacity: 20,
    status: 'upcoming',
    creator_name: 'テスト太郎',
    attendances_count: 5,
    created_at: '2024-05-01T10:00:00Z',
  },
  {
    id: 'event-2',
    title: '無料イベント（終了済み）',
    date: '2024-01-01T10:00:00Z',
    location: '大阪会議室',
    fee: 0,
    capacity: 10,
    status: 'past',
    creator_name: 'テスト花子',
    attendances_count: 8,
    created_at: '2023-12-01T10:00:00Z',
  },
  {
    id: 'event-3',
    title: 'キャンセルイベント',
    date: '2024-03-01T10:00:00Z',
    location: '名古屋会議室',
    fee: 2000,
    capacity: 15,
    status: 'cancelled',
    creator_name: 'テスト次郎',
    attendances_count: 3,
    created_at: '2024-02-01T10:00:00Z',
  },
  {
    id: 'event-4',
    title: '開催中イベント',
    date: '2024-05-15T10:00:00Z',
    location: '福岡会議室',
    fee: 500,
    capacity: 25,
    status: 'ongoing',
    creator_name: 'テスト三郎',
    attendances_count: 12,
    created_at: '2024-04-15T10:00:00Z',
  },
];

describe('EventListWithFilters Component - Red Phase Tests', () => {
  test('フィルター・ソート・イベントリストが統合表示される', () => {
    render(<EventListWithFilters events={mockEvents} />);

    expect(screen.getByTestId('event-list-with-filters')).toBeInTheDocument();
    expect(screen.getByTestId('event-filters')).toBeInTheDocument();
    expect(screen.getByTestId('event-sort')).toBeInTheDocument();
    expect(screen.getByTestId('event-grid')).toBeInTheDocument();
  });

  test('ステータスフィルター適用時、該当イベントのみ表示される', async () => {
    const user = userEvent.setup();
    render(<EventListWithFilters events={mockEvents} />);

    const statusFilter = screen.getByTestId('status-filter');
    await user.click(statusFilter);

    await waitFor(() => {
      const upcomingOption = screen.getByText('開催予定');
      user.click(upcomingOption);
    });

    await waitFor(() => {
      expect(screen.getByText('有料イベント（開催予定）')).toBeInTheDocument();
      expect(screen.queryByText('無料イベント（終了済み）')).not.toBeInTheDocument();
      expect(screen.queryByText('キャンセルイベント')).not.toBeInTheDocument();
    });
  });

  test('決済フィルター適用時、該当イベントのみ表示される', async () => {
    const user = userEvent.setup();
    render(<EventListWithFilters events={mockEvents} />);

    const paymentFilter = screen.getByTestId('payment-filter');
    await user.click(paymentFilter);

    await waitFor(() => {
      const freeOption = screen.getByText('無料');
      user.click(freeOption);
    });

    await waitFor(() => {
      expect(screen.getByText('無料イベント（終了済み）')).toBeInTheDocument();
      expect(screen.queryByText('有料イベント（開催予定）')).not.toBeInTheDocument();
      expect(screen.queryByText('キャンセルイベント')).not.toBeInTheDocument();
    });
  });

  test('日付範囲フィルター適用時、該当期間のイベントのみ表示される', async () => {
    const user = userEvent.setup();
    render(<EventListWithFilters events={mockEvents} />);

    const startDateInput = screen.getByLabelText('開始日');
    const endDateInput = screen.getByLabelText('終了日');

    await user.type(startDateInput, '2024-05-01');
    await user.type(endDateInput, '2024-06-30');

    await waitFor(() => {
      expect(screen.getByText('有料イベント（開催予定）')).toBeInTheDocument();
      expect(screen.getByText('開催中イベント')).toBeInTheDocument();
      expect(screen.queryByText('無料イベント（終了済み）')).not.toBeInTheDocument();
      expect(screen.queryByText('キャンセルイベント')).not.toBeInTheDocument();
    });
  });

  test('日付範囲フィルター - end日当日のイベントを含む（23:59:59まで）', async () => {
    const user = userEvent.setup();
    
    const eventOnEndDate: Event = {
      id: 'event-end-date',
      title: 'End日当日のイベント',
      date: '2024-06-01T23:30:00Z', // end日の23:30
      location: 'テスト会場',
      fee: 0,
      capacity: 10,
      status: 'upcoming',
      creator_name: 'テスト者',
      attendances_count: 2,
      created_at: '2024-05-31T10:00:00Z',
    };

    render(<EventListWithFilters events={[...mockEvents, eventOnEndDate]} />);

    const startDateInput = screen.getByLabelText('開始日');
    const endDateInput = screen.getByLabelText('終了日');

    await user.type(startDateInput, '2024-06-01');
    await user.type(endDateInput, '2024-06-01'); // 同じ日をend日に設定

    await waitFor(() => {
      // end日当日のイベントが含まれることを確認
      expect(screen.getByText('End日当日のイベント')).toBeInTheDocument();
      expect(screen.getByText('有料イベント（開催予定）')).toBeInTheDocument(); // 06-01のイベント
    });
  });

  test('開催日順ソート（昇順）が正しく適用される', async () => {
    const user = userEvent.setup();
    render(<EventListWithFilters events={mockEvents} />);

    const sortSelect = screen.getByRole('combobox', { name: '並び順' });
    await user.click(sortSelect);

    await waitFor(() => {
      const dateOption = screen.getByText('開催日時');
      user.click(dateOption);
    });

    const ascButton = screen.getByLabelText('昇順');
    await user.click(ascButton);

    await waitFor(() => {
      const eventTitles = screen.getAllByTestId('event-title');
      expect(eventTitles[0]).toHaveTextContent('無料イベント（終了済み）'); // 2024-01-01
      expect(eventTitles[1]).toHaveTextContent('キャンセルイベント'); // 2024-03-01
      expect(eventTitles[2]).toHaveTextContent('開催中イベント'); // 2024-05-15
      expect(eventTitles[3]).toHaveTextContent('有料イベント（開催予定）'); // 2024-06-01
    });
  });

  test('参加者数順ソート（降順）が正しく適用される', async () => {
    const user = userEvent.setup();
    render(<EventListWithFilters events={mockEvents} />);

    const sortSelect = screen.getByRole('combobox', { name: '並び順' });
    await user.click(sortSelect);

    await waitFor(() => {
      const attendanceOption = screen.getByText('参加者数');
      user.click(attendanceOption);
    });

    const descButton = screen.getByLabelText('降順');
    await user.click(descButton);

    await waitFor(() => {
      const eventTitles = screen.getAllByTestId('event-title');
      expect(eventTitles[0]).toHaveTextContent('開催中イベント'); // 12人
      expect(eventTitles[1]).toHaveTextContent('無料イベント（終了済み）'); // 8人
      expect(eventTitles[2]).toHaveTextContent('有料イベント（開催予定）'); // 5人
      expect(eventTitles[3]).toHaveTextContent('キャンセルイベント'); // 3人
    });
  });

  test('フィルターとソートの組み合わせが正しく機能する', async () => {
    const user = userEvent.setup();
    render(<EventListWithFilters events={mockEvents} />);

    // 有料イベントのみでフィルター
    const paymentFilter = screen.getByTestId('payment-filter');
    await user.click(paymentFilter);

    await waitFor(() => {
      const paidOption = screen.getByText('有料');
      user.click(paidOption);
    });

    // 参加費順ソート（昇順）
    const sortSelect = screen.getByRole('combobox', { name: '並び順' });
    await user.click(sortSelect);

    await waitFor(() => {
      const feeOption = screen.getByText('参加費');
      user.click(feeOption);
    });

    const ascButton = screen.getByLabelText('昇順');
    await user.click(ascButton);

    await waitFor(() => {
      const eventTitles = screen.getAllByTestId('event-title');
      expect(eventTitles).toHaveLength(3); // 有料イベント3件
      expect(eventTitles[0]).toHaveTextContent('開催中イベント'); // 500円
      expect(eventTitles[1]).toHaveTextContent('有料イベント（開催予定）'); // 1000円
      expect(eventTitles[2]).toHaveTextContent('キャンセルイベント'); // 2000円
    });
  });

  test('フィルタークリア時、全てのイベントが表示される', async () => {
    const user = userEvent.setup();
    render(<EventListWithFilters events={mockEvents} />);

    // 一旦フィルターを適用
    const statusFilter = screen.getByTestId('status-filter');
    await user.click(statusFilter);

    await waitFor(() => {
      const upcomingOption = screen.getByText('開催予定');
      user.click(upcomingOption);
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('event-card')).toHaveLength(1);
    });

    // フィルターをクリア
    const clearButton = screen.getByText('フィルターをクリア');
    await user.click(clearButton);

    await waitFor(() => {
      expect(screen.getAllByTestId('event-card')).toHaveLength(4);
    });
  });

  test('空の検索結果の場合、適切なメッセージが表示される', async () => {
    const user = userEvent.setup();
    render(<EventListWithFilters events={mockEvents} />);

    const startDateInput = screen.getByLabelText('開始日');
    const endDateInput = screen.getByLabelText('終了日');

    // 該当期間がない日付範囲を設定
    await user.type(startDateInput, '2025-01-01');
    await user.type(endDateInput, '2025-01-31');

    await waitFor(() => {
      expect(screen.getByText('条件に合うイベントが見つかりません')).toBeInTheDocument();
      expect(screen.getByText('フィルター条件を変更してお試しください')).toBeInTheDocument();
    });
  });

  test('無効なフィルター組み合わせの場合、警告メッセージが表示される', async () => {
    const user = userEvent.setup();
    render(<EventListWithFilters events={mockEvents} />);

    const startDateInput = screen.getByLabelText('開始日');
    const endDateInput = screen.getByLabelText('終了日');

    // 不正な日付範囲（終了日が開始日より前）
    await user.type(startDateInput, '2024-12-31');
    await user.type(endDateInput, '2024-01-01');

    await waitFor(() => {
      expect(screen.getByText('終了日は開始日より後の日付を選択してください')).toBeInTheDocument();
    });
  });
});
