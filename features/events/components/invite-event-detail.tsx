"use client";

import { useState } from "react";
import { EventDetail } from "@core/utils/invite-token";
import { sanitizeEventDescription, sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants/payment-methods";
import { EVENT_STATUS_LABELS } from "@/types/enums";
import { type ParticipationFormData } from "@core/validation/participation";
import {
  registerParticipationAction,
  type RegisterParticipationData,
} from "@/app/events/actions/register-participation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ParticipationForm } from "./participation-form";
import { ParticipationConfirmation } from "./participation-confirmation";

interface InviteEventDetailProps {
  event: EventDetail;
  inviteToken: string;
}

export function InviteEventDetail({ event, inviteToken }: InviteEventDetailProps) {
  const [showForm, setShowForm] = useState(false);
  const [registrationData, setRegistrationData] = useState<RegisterParticipationData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (amount: number) => {
    return amount === 0 ? "無料" : `${amount.toLocaleString()}円`;
  };

  const getStatusText = (status: string) => {
    return EVENT_STATUS_LABELS[status as keyof typeof EVENT_STATUS_LABELS] || status;
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
      setIsSubmitting(true);
      setError(null);

      // FormDataを作成
      const formData = new FormData();
      formData.append("inviteToken", data.inviteToken);
      formData.append("nickname", data.nickname);
      formData.append("email", data.email);
      formData.append("attendanceStatus", data.attendanceStatus);
      if (data.paymentMethod) {
        formData.append("paymentMethod", data.paymentMethod);
      }

      // 参加登録サーバーアクションを実行
      const result = await registerParticipationAction(formData);

      if (result.success && result.data) {
        // 成功時は確認ページを表示
        setRegistrationData(result.data);
        setShowForm(false);
      } else {
        // エラー時はエラーメッセージを表示
        setError(!result.success ? result.error : "参加申し込み中にエラーが発生しました");
      }
    } catch (_error) {
      setError("参加申し込み中にエラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 確認ページが表示される場合
  if (registrationData) {
    return <ParticipationConfirmation registrationData={registrationData} event={event} />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* エラーメッセージ */}
      {error && (
        <Card className="p-3 sm:p-4 bg-red-50 border-red-200">
          <div className="text-sm text-red-800">
            <strong>エラー:</strong> {error}
          </div>
        </Card>
      )}

      {/* イベント詳細カード */}
      <Card className="p-4 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">
              {sanitizeForEventPay(event.title)}
            </h2>
            <div className="mt-2 text-sm text-gray-600">
              ステータス: <span className="font-medium">{getStatusText(event.status)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-3 sm:space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700">開催日</h3>
                <p className="mt-1 text-sm text-gray-900 break-words">
                  {formatUtcToJstByType(event.date, "japanese")}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700">開催場所</h3>
                <p className="mt-1 text-sm text-gray-900 break-words">
                  {sanitizeForEventPay(event.location || "未定")}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700">参加費</h3>
                <p className="mt-1 text-sm text-gray-900 font-semibold">
                  {formatCurrency(event.fee)}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700">定員</h3>
                <p className="mt-1 text-sm text-gray-900">
                  {event.capacity === null ? (
                    "制限なし"
                  ) : event.capacity === 0 ? (
                    "0人（募集停止）"
                  ) : event.capacity < 0 ? (
                    "無効な定員"
                  ) : (
                    <>
                      {event.attendances_count}/{event.capacity}人
                      {isCapacityReached && (
                        <span className="ml-2 text-red-600 font-medium block sm:inline">
                          （満員）
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {event.registration_deadline && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700">申込締切</h3>
                  <p className="mt-1 text-sm text-gray-900 break-words">
                    {formatUtcToJstByType(event.registration_deadline, "japanese")}
                    {isRegistrationDeadlinePassed && (
                      <span className="ml-2 text-red-600 font-medium block sm:inline">
                        （締切済み）
                      </span>
                    )}
                  </p>
                </div>
              )}

              {event.payment_deadline && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700">決済締切</h3>
                  <p className="mt-1 text-sm text-gray-900 break-words">
                    {formatUtcToJstByType(event.payment_deadline, "japanese")}
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
              <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap break-words">
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
            disabled={isSubmitting}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 sm:px-8 py-3 sm:py-3 text-base sm:text-lg font-medium h-12 sm:h-auto"
            size="lg"
          >
            {isSubmitting ? "処理中..." : "参加申し込みをする"}
          </Button>
        ) : (
          <div className="space-y-3">
            <Button
              disabled
              className="w-full sm:w-auto px-6 sm:px-8 py-3 text-base sm:text-lg h-12 sm:h-auto"
              size="lg"
            >
              参加申し込み不可
            </Button>
            <div className="text-sm text-red-600 space-y-1">
              {isCapacityReached && <p>定員に達しています</p>}
              {isRegistrationDeadlinePassed && <p>申込期限が過ぎています</p>}
              {event.status !== "upcoming" && <p>このイベントは申し込みを受け付けていません</p>}
            </div>
          </div>
        )}
      </div>

      {/* 参加申し込みフォーム */}
      {showForm && (
        <ParticipationForm
          event={event}
          inviteToken={inviteToken}
          onSubmit={handleParticipationSubmit}
          onCancel={() => {
            setShowForm(false);
            setError(null);
          }}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
