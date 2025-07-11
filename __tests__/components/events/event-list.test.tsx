import { render, screen } from '@testing-library/react';
import { EventList } from '@/components/events/event-list';
import { Event } from '@/types/event';

const mockEvents: Event[] = [
  {
    id: 'event-1',
    title: 'テストイベント1',
    date: '2024-01-01T10:00:00Z',
    location: '東京会議室',
    fee: 1000,
    capacity: 20,
    status: 'upcoming',
    creator_name: 'テスト太郎',
    attendances_count: 5,
  },
  {
    id: 'event-2',
    title: 'テストイベント2',
    date: '2024-01-02T14:00:00Z',
    location: '大阪会議室',
    fee: 0,
    capacity: 10,
    status: 'upcoming',
    creator_name: 'テスト太郎',
    attendances_count: 3,
  },
];

describe('EventList Component - Red Phase Tests', () => {
  test('イベントリストが正しく表示される', () => {
    render(<EventList events={mockEvents} />);

    // このテストは失敗するはず（まだ実装されていない）
    expect(screen.getByText('テストイベント1')).toBeInTheDocument();
    expect(screen.getByText('テストイベント2')).toBeInTheDocument();
  });

  test('空のイベントリストの場合、適切なメッセージが表示される', () => {
    render(<EventList events={[]} />);

    // このテストは失敗するはず（まだ実装されていない）
    expect(screen.getByText('イベントがまだありません')).toBeInTheDocument();
    expect(screen.getByText('新しいイベントを作成してみましょう')).toBeInTheDocument();
  });

  test('イベント作成ボタンが表示される', () => {
    render(<EventList events={[]} />);

    // Linkコンポーネントは'link'ロールとして認識される
    const createButton = screen.getByRole('link', { name: /新しいイベントを作成/i });
    expect(createButton).toBeInTheDocument();
  });

  test('複数のイベントが適切にレンダリングされる', () => {
    render(<EventList events={mockEvents} />);

    // このテストは失敗するはず（まだ実装されていない）
    const eventCards = screen.getAllByTestId('event-card');
    expect(eventCards).toHaveLength(2);
  });

  test('イベントカードがグリッドレイアウトで表示される', () => {
    render(<EventList events={mockEvents} />);

    // このテストは失敗するはず（まだ実装されていない）
    const eventGrid = screen.getByTestId('event-grid');
    expect(eventGrid).toHaveClass('grid', 'grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
  });
});