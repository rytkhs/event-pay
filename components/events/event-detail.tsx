"use client";

import { PaymentMethod, PAYMENT_METHOD_LABELS } from '@/lib/constants/payment-methods';
import { sanitizeEventDescription } from '@/lib/utils/sanitize';

interface EventDetailProps {
  event: {
    id: string;
    title: string;
    date: string;
    location: string;
    fee: number;
    capacity: number;
    status: 'upcoming' | 'ongoing' | 'past' | 'cancelled';
    description?: string;
    registration_deadline?: string;
    payment_deadline?: string;
    payment_methods: PaymentMethod[];
    created_at: string;
    updated_at: string;
    created_by: string;
    creator_name: string;
  };
}

export function EventDetail({ event }: EventDetailProps) {
  if (!event || !event.id || !event.title) {
    return <div>イベント情報が正しく読み込まれませんでした。</div>;
  }

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString()}円`;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'upcoming': return '開催予定';
      case 'ongoing': return '開催中';
      case 'past': return '終了';
      case 'cancelled': return 'キャンセル';
      default: return status;
    }
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg shadow">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
        <div className="mt-2 text-sm text-gray-600">
          ステータス: <span className="font-medium">{getStatusText(event.status)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700">開催日</h3>
            <p className="mt-1 text-sm text-gray-900">{formatDate(event.date)}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700">開催場所</h3>
            <p className="mt-1 text-sm text-gray-900">{event.location}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700">参加費</h3>
            <p className="mt-1 text-sm text-gray-900">{formatCurrency(event.fee)}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700">定員</h3>
            <p className="mt-1 text-sm text-gray-900">定員 {event.capacity}人</p>
          </div>
        </div>

        <div className="space-y-4">
          {event.registration_deadline && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">申込締切</h3>
              <p className="mt-1 text-sm text-gray-900">{formatDate(event.registration_deadline)}</p>
            </div>
          )}

          {event.payment_deadline && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">決済締切</h3>
              <p className="mt-1 text-sm text-gray-900">{formatDate(event.payment_deadline)}</p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-700">決済方法</h3>
            <p className="mt-1 text-sm text-gray-900">
              {event.payment_methods.map(method => PAYMENT_METHOD_LABELS[method]).join(', ')}
            </p>
          </div>
        </div>
      </div>

      {event.description && (
        <div>
          <h3 className="text-sm font-medium text-gray-700">詳細説明</h3>
          <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{sanitizeEventDescription(event.description)}</p>
        </div>
      )}

      <div className="pt-4 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-500">
          <div>
            <span className="font-medium">作成日時:</span> {formatDate(event.created_at)}
          </div>
          <div>
            <span className="font-medium">最終更新:</span> {formatDate(event.updated_at)}
          </div>
        </div>
      </div>
    </div>
  );
}