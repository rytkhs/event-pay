"use client";

import { useState } from "react";
import { EventDetail } from "@/lib/utils/invite-token";
import { type RegisterParticipationData } from "@/app/events/actions/register-participation";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
import { formatUtcToJapaneseDisplay } from "@/lib/utils/timezone";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants/payment-methods";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Copy, ExternalLink, CreditCard, Banknote } from "lucide-react";
import { useClipboard } from "@/hooks/use-clipboard";

interface ParticipationConfirmationProps {
  registrationData: RegisterParticipationData;
  event: EventDetail;
}

export function ParticipationConfirmation({
  registrationData,
  event,
}: ParticipationConfirmationProps) {
  const [showGuestUrl, setShowGuestUrl] = useState(false);
  const { copyToClipboard, isCopied } = useClipboard();

  // ゲスト管理URLの生成
  const guestManagementUrl = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/guest/${registrationData.guestToken}`;

  // 参加ステータスの日本語表示
  const getAttendanceStatusText = (status: string) => {
    switch (status) {
      case "attending":
        return "参加";
      case "not_attending":
        return "不参加";
      case "maybe":
        return "未定";
      default:
        return status;
    }
  };

  // 決済方法のアイコン
  const getPaymentMethodIcon = (method?: string) => {
    switch (method) {
      case "stripe":
        return <CreditCard className="h-4 w-4" />;
      case "cash":
        return <Banknote className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const handleCopyGuestUrl = () => {
    copyToClipboard(guestManagementUrl);
  };

  const handleOpenGuestUrl = () => {
    window.open(guestManagementUrl, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* 成功メッセージ */}
      <Card className="p-6 bg-green-50 border-green-200">
        <div className="flex items-center space-x-3">
          <CheckCircle className="h-8 w-8 text-green-600" />
          <div>
            <h2 className="text-xl font-semibold text-green-900">参加申し込みが完了しました！</h2>
            <p className="text-sm text-green-700 mt-1">ご登録いただいた内容を確認してください</p>
          </div>
        </div>
      </Card>

      {/* 登録内容確認 */}
      <Card className="p-6">
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">登録内容</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700">イベント名</h4>
                <p className="mt-1 text-sm text-gray-900">
                  {sanitizeForEventPay(registrationData.eventTitle)}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700">ニックネーム</h4>
                <p className="mt-1 text-sm text-gray-900">
                  {sanitizeForEventPay(registrationData.participantNickname)}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700">メールアドレス</h4>
                <p className="mt-1 text-sm text-gray-900">{registrationData.participantEmail}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-700">参加ステータス</h4>
                <p className="mt-1 text-sm text-gray-900">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      registrationData.attendanceStatus === "attending"
                        ? "bg-green-100 text-green-800"
                        : registrationData.attendanceStatus === "not_attending"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {getAttendanceStatusText(registrationData.attendanceStatus)}
                  </span>
                </p>
              </div>

              {registrationData.paymentMethod && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700">決済方法</h4>
                  <p className="mt-1 text-sm text-gray-900 flex items-center space-x-2">
                    {getPaymentMethodIcon(registrationData.paymentMethod)}
                    <span>{PAYMENT_METHOD_LABELS[registrationData.paymentMethod]}</span>
                  </p>
                </div>
              )}

              {registrationData.attendanceStatus === "attending" && event.fee > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700">参加費</h4>
                  <p className="mt-1 text-sm text-gray-900 font-semibold">
                    {event.fee.toLocaleString()}円
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* 決済情報（参加かつ有料の場合） */}
      {registrationData.requiresPayment && (
        <Card className="p-6 bg-blue-50 border-blue-200">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              {getPaymentMethodIcon(registrationData.paymentMethod)}
              <h3 className="text-lg font-semibold text-blue-900">決済について</h3>
            </div>

            {registrationData.paymentMethod === "stripe" && (
              <div className="space-y-2">
                <p className="text-sm text-blue-800">クレジットカード決済を選択されました。</p>
                <p className="text-sm text-blue-700">
                  決済手続きのご案内を登録されたメールアドレスにお送りします。
                  メール内のリンクから決済を完了してください。
                </p>
              </div>
            )}

            {registrationData.paymentMethod === "cash" && (
              <div className="space-y-2">
                <p className="text-sm text-blue-800">現金決済を選択されました。</p>
                <p className="text-sm text-blue-700">
                  イベント当日に会場にて現金でお支払いください。
                  お釣りのないようご準備をお願いします。
                </p>
              </div>
            )}

            <div className="bg-white p-3 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-600">
                <strong>注意:</strong>
                決済が完了するまで参加登録は仮登録状態となります。
                決済期限までに手続きを完了してください。
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ゲスト管理URL */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">参加状況の管理</h3>
            <p className="text-sm text-gray-600 mt-1">
              以下のURLから参加状況の確認・変更ができます。ブックマークしておくことをお勧めします。
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => setShowGuestUrl(!showGuestUrl)}
              variant="outline"
              className="w-full justify-center"
            >
              {showGuestUrl ? "URLを非表示" : "管理URLを表示"}
            </Button>

            {showGuestUrl && (
              <div className="space-y-3">
                <div className="p-3 bg-gray-50 rounded-lg border">
                  <p className="text-xs text-gray-600 mb-2">管理URL:</p>
                  <p className="text-sm font-mono text-gray-900 break-all">{guestManagementUrl}</p>
                </div>

                <div className="flex space-x-2">
                  <Button
                    onClick={handleCopyGuestUrl}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {isCopied ? "コピー済み" : "URLをコピー"}
                  </Button>
                  <Button
                    onClick={handleOpenGuestUrl}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    新しいタブで開く
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
            <p className="text-xs text-yellow-800">
              <strong>重要:</strong>
              この管理URLは他の人と共有しないでください。
              URLを知っている人は誰でもあなたの参加状況を変更できます。
            </p>
          </div>
        </div>
      </Card>

      {/* イベント詳細情報 */}
      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">イベント詳細</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700">開催日時</h4>
              <p className="mt-1 text-sm text-gray-900">{formatUtcToJapaneseDisplay(event.date)}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700">開催場所</h4>
              <p className="mt-1 text-sm text-gray-900">
                {sanitizeForEventPay(event.location || "未定")}
              </p>
            </div>

            {event.registration_deadline && (
              <div>
                <h4 className="text-sm font-medium text-gray-700">申込締切</h4>
                <p className="mt-1 text-sm text-gray-900">
                  {formatUtcToJapaneseDisplay(event.registration_deadline)}
                </p>
              </div>
            )}

            {event.payment_deadline && (
              <div>
                <h4 className="text-sm font-medium text-gray-700">決済締切</h4>
                <p className="mt-1 text-sm text-gray-900">
                  {formatUtcToJapaneseDisplay(event.payment_deadline)}
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 次のステップ */}
      <Card className="p-6 bg-gray-50">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">次のステップ</h3>

          <div className="space-y-3">
            {registrationData.requiresPayment && (
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-medium">
                  1
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">決済手続き</p>
                  <p className="text-xs text-gray-600">
                    登録されたメールアドレスに決済案内をお送りします
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-medium">
                {registrationData.requiresPayment ? "2" : "1"}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">イベント当日</p>
                <p className="text-xs text-gray-600">
                  開催場所にお越しください。楽しいイベントをお待ちしています！
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 bg-gray-400 text-white rounded-full flex items-center justify-center text-xs font-medium">
                ?
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">参加状況の変更</p>
                <p className="text-xs text-gray-600">上記の管理URLから参加状況を変更できます</p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
