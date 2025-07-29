"use client";

import { useState } from "react";
import { EventDetail } from "@/lib/utils/invite-token";
import { sanitizeEventDescription, sanitizeForEventPay } from "@/lib/utils/sanitize";
import { formatUtcToJapaneseDisplay } from "@/lib/utils/timezone";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants/payment-methods";
import { type ParticipationFormData } from "@/lib/validations/participation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ParticipationForm } from "./participation-form";

interface InviteEventDetailProps {
  event: EventDetail;
  inviteToken: string;
}

export function InviteEventDetail({ event, inviteToken }: InviteEventDetailProps) {
  const [showForm, setShowForm] = useState(false);

  const formatCurrency = (amount: number) => {
    return amount === 0 ? "無料" : `${amount.toLocaleString()}円`;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "upcoming":
        return "開催予定";
      case "ongoing":
        return "開催中";
      case "past":
        return "終了";
      case "cancelled":
        return "キャンセル";
      default:
        return status;
    }
  };

  // 定員状況の確認
  const isCapacityReached = event.capacity ? event.attendances_count >= event.capacity : false;

  // 申込期限の確認
  const isRegistrationDeadlinePassed = event.registration_deadline
    ? new Date() > new Date(event.registration_deadline)
    : false;

  const canRegister =
    !isCapacityReached && !isRegistrationDeadlinePassed && event.status === "upcoming";

  const handleParticipationSubmit = async (data: ParticipationFormData) => {
    try {
      // TODO: 次のタスクで実装される参加登録サーバーアクション
      console.log("参加申し込みデータ:", data);

      // 仮の成功処理
      alert("参加申し込みが完了しました！（実装は次のタスクで行われます）");
      setShowForm(false);
    } catch (error) {
      alert("参加申し込み中にエラーが発生しました");
    }
  };

  return (
    <div className="space-y-6">
      {/* イベント詳細カード */}
      <Card className="p-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{sanitizeForEventPay(event.title)}</h2>
            <div className="mt-2 text-sm text-gray-600">
              ステータス: <span className="font-medium">{getStatusText(event.status)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700">開催日</h3>
                <p className="mt-1 text-sm text-gray-900">
                  {formatUtcToJapaneseDisplay(event.date)}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700">開催場所</h3>
                <p className="mt-1 text-sm text-gray-900">
                  {sanitizeForEventPay(event.location || "未定")}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700">参加費</h3>
                <p className="mt-1 text-sm text-gray-900">{formatCurrency(event.fee)}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700">定員</h3>
                <p className="mt-1 text-sm text-gray-900">
                  {event.capacity ? (
                    <>
                      {event.attendances_count}/{event.capacity}人
                      {isCapacityReached && (
                        <span className="ml-2 text-red-600 font-medium">（満員）</span>
                      )}
                    </>
                  ) : (
                    "制限なし"
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {event.registration_deadline && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700">申込締切</h3>
                  <p className="mt-1 text-sm text-gray-900">
                    {formatUtcToJapaneseDisplay(event.registration_deadline)}
                    {isRegistrationDeadlinePassed && (
                      <span className="ml-2 text-red-600 font-medium">（締切済み）</span>
                    )}
                  </p>
                </div>
              )}

              {event.payment_deadline && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700">決済締切</h3>
                  <p className="mt-1 text-sm text-gray-900">
                    {formatUtcToJapaneseDisplay(event.payment_deadline)}
                  </p>
                </div>
              )}

              {event.fee > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700">決済方法</h3>
                  <p className="mt-1 text-sm text-gray-900">
                    {event.payment_methods
                      .map((method) => PAYMENT_METHOD_LABELS[method])
                      .join(", ")}
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
        </div>
      </Card>

      {/* 参加申し込みボタン */}
      <div className="text-center">
        {canRegister ? (
          <Button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg"
            size="lg"
          >
            参加申し込みをする
          </Button>
        ) : (
          <div className="space-y-2">
            <Button disabled className="px-8 py-3 text-lg" size="lg">
              参加申し込み不可
            </Button>
            <p className="text-sm text-red-600">
              {isCapacityReached && "定員に達しています"}
              {isRegistrationDeadlinePassed && "申込期限が過ぎています"}
              {event.status !== "upcoming" && "このイベントは申し込みを受け付けていません"}
            </p>
          </div>
        )}
      </div>

      {/* 参加申し込みフォーム */}
      {showForm && (
        <ParticipationForm
          event={event}
          inviteToken={inviteToken}
          onSubmit={handleParticipationSubmit}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
