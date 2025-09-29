"use client";

import { PaymentMethod, PAYMENT_METHOD_LABELS } from "@core/constants/payment-methods";
import { EVENT_STATUS_LABELS } from "@core/types/enums";
import { sanitizeEventDescription, sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

interface EventDetailProps {
  event: {
    id: string;
    title: string;
    date: string;
    location: any;
    fee: number;
    capacity: any;
    status: "upcoming" | "ongoing" | "past" | "canceled";
    description?: any;
    registration_deadline?: any;
    payment_deadline?: any;
    payment_methods: PaymentMethod[];
    created_at: string;
    updated_at: string;
    created_by: string;
    creator_name: string;
  };
}

export function EventDetail({ event }: EventDetailProps) {
  if (!event?.id || !event.title) {
    return <div>イベント情報が正しく読み込まれませんでした。</div>;
  }

  const formatCurrency = (amount: number) => {
    return amount === 0 ? "無料" : `${amount.toLocaleString()}円`;
  };

  const getStatusText = (status: string) => {
    return EVENT_STATUS_LABELS[status as keyof typeof EVENT_STATUS_LABELS] || status;
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg shadow">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{sanitizeForEventPay(event.title)}</h1>
        <div className="mt-2 text-sm text-gray-600">
          ステータス: <span className="font-medium">{getStatusText(event.status)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700">開催日</h3>
            <p className="mt-1 text-sm text-gray-900">
              {formatUtcToJstByType(event.date, "japanese")}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700">開催場所</h3>
            <p className="mt-1 text-sm text-gray-900">{sanitizeForEventPay(event.location)}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700">参加費</h3>
            <p className="mt-1 text-sm text-gray-900">{formatCurrency(event.fee)}</p>
          </div>

          {event.capacity !== null && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">定員</h3>
              <p className="mt-1 text-sm text-gray-900">定員 {event.capacity}人</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {event.registration_deadline && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">申込締切</h3>
              <p className="mt-1 text-sm text-gray-900">
                {formatUtcToJstByType(event.registration_deadline, "japanese")}
              </p>
            </div>
          )}

          {event.payment_deadline && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">オンライン決済締切</h3>
              <p className="mt-1 text-sm text-gray-900">
                {formatUtcToJstByType(event.payment_deadline, "japanese")}
              </p>
            </div>
          )}

          {event.fee > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">決済方法</h3>
              <p className="mt-1 text-sm text-gray-900">
                {event.payment_methods.map((method) => PAYMENT_METHOD_LABELS[method]).join(", ")}
              </p>
            </div>
          )}
        </div>
      </div>

      {event.description && (
        <div>
          <h3 className="text-sm font-medium text-gray-700">詳細説明</h3>
          <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
            {sanitizeEventDescription(event.description)}
          </p>
        </div>
      )}

      <div className="pt-4 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-500">
          <div>
            <span className="font-medium">作成日時:</span>{" "}
            {formatUtcToJstByType(event.created_at, "japanese")}
          </div>
          <div>
            <span className="font-medium">最終更新:</span>{" "}
            {formatUtcToJstByType(event.updated_at, "japanese")}
          </div>
        </div>
      </div>
    </div>
  );
}
