"use client";

import type { Event } from "@core/types/models";

import { EventOverview } from "./event-overview";

interface ParticipantViewProps {
  eventDetail: Event;
}

export function ParticipantView({ eventDetail }: ParticipantViewProps) {
  return (
    <div className="space-y-6">
      {/* 参加者向けシンプルビュー */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">参加をご検討中の方へ</h2>
        <p className="text-sm text-blue-700">
          イベントの詳細は下記をご確認ください。参加をご希望の場合は、上部の「参加登録」ボタンから申し込みをお願いします。
        </p>
      </div>

      {/* イベント詳細 */}
      <EventOverview event={eventDetail} />

      {/* 参加者向け注意事項 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-base font-semibold text-gray-900 mb-2">参加に関するご案内</h3>
        <div className="space-y-2 text-sm text-gray-700">
          <p>• 参加申し込みは定員に達し次第締切となります</p>
          <p>• 参加費のお支払いは登録完了後にご案内いたします</p>
          <p>• キャンセルについては主催者までお問い合わせください</p>
          {eventDetail.registration_deadline && (
            <p className="font-medium text-orange-600">
              • 申し込み締切:{" "}
              {new Date(eventDetail.registration_deadline).toLocaleDateString("ja-JP")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
