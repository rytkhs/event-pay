"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGuestAttendanceAction } from "@/app/events/actions/update-guest-attendance";
import { type GuestAttendanceData } from "@/lib/utils/guest-token";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
import { formatUtcToJapaneseDisplay } from "@/lib/utils/timezone";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants/payment-methods";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, CreditCard, Banknote, AlertCircle, CheckCircle } from "lucide-react";

interface GuestManagementFormProps {
  attendance: GuestAttendanceData;
  canModify: boolean;
}

export function GuestManagementForm({ attendance, canModify }: GuestManagementFormProps) {
  const router = useRouter();
  const [attendanceStatus, setAttendanceStatus] = useState(attendance.status);
  const [paymentMethod, setPaymentMethod] = useState(attendance.payment?.method || "stripe");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case "stripe":
        return <CreditCard className="h-4 w-4" />;
      case "cash":
        return <Banknote className="h-4 w-4" />;
      default:
        return null;
    }
  };

  // フォーム送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("guestToken", attendance.guest_token);
      formData.append("attendanceStatus", attendanceStatus);

      // 参加かつ有料の場合のみ決済方法を送信
      if (attendanceStatus === "attending" && attendance.event.fee > 0) {
        formData.append("paymentMethod", paymentMethod);
      }

      const result = await updateGuestAttendanceAction(formData);

      if (result.success) {
        setSuccess("参加状況を更新しました");
        // ページをリロードして最新データを表示
        router.refresh();
      } else {
        setError(result.error || "更新に失敗しました");
      }
    } catch (err) {
      // エラーログは本番環境では適切なログシステムを使用
      setError("予期しないエラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 変更があるかどうかの判定
  const hasChanges =
    attendanceStatus !== attendance.status ||
    (attendanceStatus === "attending" &&
      attendance.event.fee > 0 &&
      paymentMethod !== attendance.payment?.method);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 現在の参加状況表示 */}
      <Card className="p-4 sm:p-6">
        <div className="space-y-3 sm:space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">現在の参加状況</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700">参加ステータス</h4>
              <p className="mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    attendance.status === "attending"
                      ? "bg-green-100 text-green-800"
                      : attendance.status === "not_attending"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {getAttendanceStatusText(attendance.status)}
                </span>
              </p>
            </div>

            {attendance.payment && (
              <div>
                <h4 className="text-sm font-medium text-gray-700">決済方法</h4>
                <p className="mt-1 text-sm text-gray-900 flex items-center space-x-2">
                  {getPaymentMethodIcon(attendance.payment.method)}
                  <span>{PAYMENT_METHOD_LABELS[attendance.payment.method]}</span>
                </p>
              </div>
            )}
          </div>

          {attendance.payment && (
            <div>
              <h4 className="text-sm font-medium text-gray-700">決済状況</h4>
              <p className="mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    attendance.payment.status === "completed"
                      ? "bg-green-100 text-green-800"
                      : attendance.payment.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {attendance.payment.status === "completed"
                    ? "完了"
                    : attendance.payment.status === "pending"
                      ? "未完了"
                      : "失敗"}
                </span>
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* 変更不可の場合の警告 */}
      {!canModify && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            参加状況の変更期限を過ぎているため、変更できません。
            ご質問がある場合は、イベント主催者にお問い合わせください。
          </AlertDescription>
        </Alert>
      )}

      {/* 参加状況変更フォーム */}
      {canModify && (
        <Card className="p-4 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 sm:mb-4">参加状況の変更</h3>
            </div>

            {/* エラー・成功メッセージ */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">{success}</AlertDescription>
              </Alert>
            )}

            {/* 参加ステータス選択 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-900">
                参加ステータス <span className="text-red-500">*</span>
              </Label>
              <RadioGroup
                value={attendanceStatus}
                onValueChange={(value) => setAttendanceStatus(value as typeof attendanceStatus)}
                className="space-y-3 sm:space-y-2"
              >
                <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                  <RadioGroupItem
                    value="attending"
                    id="attending"
                    className="h-5 w-5 sm:h-4 sm:w-4"
                  />
                  <Label
                    htmlFor="attending"
                    className="text-sm text-gray-700 cursor-pointer flex-1"
                  >
                    参加
                  </Label>
                </div>
                <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                  <RadioGroupItem
                    value="not_attending"
                    id="not_attending"
                    className="h-5 w-5 sm:h-4 sm:w-4"
                  />
                  <Label
                    htmlFor="not_attending"
                    className="text-sm text-gray-700 cursor-pointer flex-1"
                  >
                    不参加
                  </Label>
                </div>
                <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                  <RadioGroupItem value="maybe" id="maybe" className="h-5 w-5 sm:h-4 sm:w-4" />
                  <Label htmlFor="maybe" className="text-sm text-gray-700 cursor-pointer flex-1">
                    未定
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* 決済方法選択（参加かつ有料の場合のみ表示） */}
            {attendanceStatus === "attending" && attendance.event.fee > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium text-gray-900">
                  決済方法 <span className="text-red-500">*</span>
                </Label>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}
                  className="space-y-3 sm:space-y-2"
                >
                  <div className="flex items-start space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                    <RadioGroupItem
                      value="stripe"
                      id="stripe"
                      className="h-5 w-5 sm:h-4 sm:w-4 mt-0.5"
                    />
                    <Label
                      htmlFor="stripe"
                      className="text-sm text-gray-700 cursor-pointer flex-1 flex items-start space-x-2"
                    >
                      <CreditCard className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium">{PAYMENT_METHOD_LABELS.stripe}</div>
                        <div className="text-xs text-gray-500 mt-1">クレジットカード決済</div>
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-start space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                    <RadioGroupItem
                      value="cash"
                      id="cash"
                      className="h-5 w-5 sm:h-4 sm:w-4 mt-0.5"
                    />
                    <Label
                      htmlFor="cash"
                      className="text-sm text-gray-700 cursor-pointer flex-1 flex items-start space-x-2"
                    >
                      <Banknote className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium">{PAYMENT_METHOD_LABELS.cash}</div>
                        <div className="text-xs text-gray-500 mt-1">当日現金支払い</div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>

                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-800 font-medium">
                    参加費: {attendance.event.fee.toLocaleString()}円
                  </p>
                  {paymentMethod === "stripe" && (
                    <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                      クレジットカード決済の場合、決済手続きのご案内をメールでお送りします。
                    </p>
                  )}
                  {paymentMethod === "cash" && (
                    <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                      現金決済の場合、イベント当日に会場でお支払いください。
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 送信ボタン */}
            <div className="flex justify-center sm:justify-end">
              <Button
                type="submit"
                disabled={isSubmitting || !hasChanges}
                className="w-full sm:w-auto min-w-[120px] h-12 sm:h-10 text-base sm:text-sm font-medium"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    更新中...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    変更を保存
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* イベント詳細情報 */}
      <Card className="p-4 sm:p-6">
        <div className="space-y-3 sm:space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">イベント詳細</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700">イベント名</h4>
              <p className="mt-1 text-sm text-gray-900 break-words">
                {sanitizeForEventPay(attendance.event.title)}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700">開催日時</h4>
              <p className="mt-1 text-sm text-gray-900 break-words">
                {formatUtcToJapaneseDisplay(attendance.event.date)}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700">開催場所</h4>
              <p className="mt-1 text-sm text-gray-900 break-words">
                {sanitizeForEventPay(attendance.event.location || "未定")}
              </p>
            </div>

            {attendance.event.fee > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700">参加費</h4>
                <p className="mt-1 text-base sm:text-sm text-gray-900 font-semibold">
                  {attendance.event.fee.toLocaleString()}円
                </p>
              </div>
            )}

            {attendance.event.registration_deadline && (
              <div>
                <h4 className="text-sm font-medium text-gray-700">申込締切</h4>
                <p className="mt-1 text-sm text-gray-900 break-words">
                  {formatUtcToJapaneseDisplay(attendance.event.registration_deadline)}
                </p>
              </div>
            )}

            {attendance.event.payment_deadline && (
              <div>
                <h4 className="text-sm font-medium text-gray-700">決済締切</h4>
                <p className="mt-1 text-sm text-gray-900 break-words">
                  {formatUtcToJapaneseDisplay(attendance.event.payment_deadline)}
                </p>
              </div>
            )}
          </div>

          {attendance.event.description && (
            <div>
              <h4 className="text-sm font-medium text-gray-700">イベント詳細</h4>
              <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap break-words">
                {sanitizeForEventPay(attendance.event.description)}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* 参加者情報 */}
      <Card className="p-4 sm:p-6">
        <div className="space-y-3 sm:space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">登録情報</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-700">ニックネーム</h4>
              <p className="mt-1 text-sm text-gray-900 break-words">
                {sanitizeForEventPay(attendance.nickname)}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700">メールアドレス</h4>
              <p className="mt-1 text-sm text-gray-900 break-all">{attendance.email}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700">登録日時</h4>
              <p className="mt-1 text-sm text-gray-900 break-words">
                {formatUtcToJapaneseDisplay(attendance.created_at)}
              </p>
            </div>

            {attendance.updated_at !== attendance.created_at && (
              <div>
                <h4 className="text-sm font-medium text-gray-700">最終更新</h4>
                <p className="mt-1 text-sm text-gray-900 break-words">
                  {formatUtcToJapaneseDisplay(attendance.updated_at)}
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
