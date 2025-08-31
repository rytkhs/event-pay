"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGuestAttendanceAction } from "@/app/events/actions/update-guest-attendance";
import { createGuestStripeSessionAction } from "@/app/guest/actions/create-stripe-session";
import { type GuestAttendanceData } from "@core/utils/guest-token";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";
import { PAYMENT_METHOD_LABELS } from "@core/constants/payment-methods";
import { PaymentStatusSpan } from "@features/payments/components/payment-status-badge";
import { canGuestRepay } from "@core/validation/payment-eligibility";
import { useToast } from "@core/contexts/toast-context";
import { ATTENDANCE_STATUS_LABELS } from "@core/types/enums";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Save,
  CreditCard,
  Banknote,
  AlertCircle,
  CheckCircle,
  ExternalLink,
} from "lucide-react";

interface GuestManagementFormProps {
  attendance: GuestAttendanceData;
  canModify: boolean;
}

export function GuestManagementForm({ attendance, canModify }: GuestManagementFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [attendanceStatus, setAttendanceStatus] = useState(attendance.status);
  const [paymentMethod, setPaymentMethod] = useState(attendance.payment?.method || "stripe");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 再決済ボタン表示条件
  const canRepayResult = canGuestRepay(attendance, attendance.event);
  const canRepay = canRepayResult.isEligible;

  // 参加ステータスの日本語表示
  const getAttendanceStatusText = (status: string) => {
    return ATTENDANCE_STATUS_LABELS[status as keyof typeof ATTENDANCE_STATUS_LABELS] || status;
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

  // Stripe決済セッション作成処理
  const handleStripePayment = async () => {
    if (!attendance || attendance.event.fee <= 0) return;

    setIsProcessingPayment(true);
    try {
      // 現在のURLに安全にクエリパラメータを追加してリダイレクト先を生成
      const buildRedirectUrl = (status: "success" | "cancelled") => {
        const url = new URL(window.location.href);
        url.searchParams.delete("session_id");
        // 既存の payment パラメータを置き換える / 存在しなければ追加する
        url.searchParams.set("payment", status);
        return url.toString();
      };

      const result = await createGuestStripeSessionAction({
        guestToken: attendance.guest_token,
        successUrl: buildRedirectUrl("success"),
        cancelUrl: buildRedirectUrl("cancelled"),
      });

      if (result.success && result.data) {
        // Stripe Checkoutページにリダイレクト
        window.location.href = result.data.sessionUrl;
      } else {
        toast({
          title: "決済エラー",
          description: !result.success ? result.error : "決済セッションの作成に失敗しました。",
          variant: "destructive",
        });
      }
    } catch (error) {
      // エラーログの記録
      if (process.env.NODE_ENV === "development") {
        const { logger } = await import("@core/logging/app-logger");
        logger.error("Stripe決済セッション作成エラー", {
          tag: "guestStripePayment",
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
          attendance_id: attendance.id,
          event_id: attendance.event.id,
        });
      }

      toast({
        title: "決済エラー",
        description: "予期しないエラーが発生しました。しばらく待ってからもう一度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsProcessingPayment(false);
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

        // 決済が必要な場合の処理
        if (result.data?.requiresAdditionalPayment && paymentMethod === "stripe") {
          // 成功メッセージを表示してから決済フローを開始
          toast({
            title: "参加状況を更新しました",
            description: "続いてオンライン決済を行います。",
            variant: "success",
          });

          // 少し待ってから決済フローを開始
          setTimeout(() => {
            handleStripePayment();
          }, 1000);
        } else {
          // ページをリロードして最新データを表示
          router.refresh();
        }
      } else {
        setError(result.error || "参加状況の更新に失敗しました。もう一度お試しください。");
      }
    } catch (error) {
      // 本番環境では適切なログシステムでエラーログを記録
      if (process.env.NODE_ENV === "development") {
        const { logger } = await import("@core/logging/app-logger");
        logger.error("ゲスト管理フォーム送信エラー", {
          tag: "guestManagementForm",
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
          attendance_id: attendance.id,
          event_id: attendance.event.id,
        });
      }

      // ユーザーフレンドリーなエラーメッセージを表示
      setError("予期しないエラーが発生しました。しばらく待ってからもう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 変更があるかどうかの判定
  const hasChanges =
    attendanceStatus !== attendance.status ||
    (attendanceStatus === "attending" &&
      attendance.event.fee > 0 &&
      paymentMethod !== attendance.payment?.method) ||
    // 再決済が必要なケース：参加中で同じ決済方法だが決済が失敗/未完了状態
    (attendanceStatus === "attending" &&
      attendance.event.fee > 0 &&
      attendance.payment?.method === paymentMethod &&
      attendance.payment?.status &&
      ["failed", "pending"].includes(attendance.payment.status));

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
                <PaymentStatusSpan status={attendance.payment.status} />
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* 変更不可の場合の警告 */}
      {!canModify && (
        <section aria-labelledby="modification-disabled-title">
          <Alert role="alert" aria-describedby="modification-disabled-description">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription id="modification-disabled-description">
              <span className="sr-only" id="modification-disabled-title">
                参加状況変更不可
              </span>
              参加状況の変更期限を過ぎているため、現在変更できません。
              <br />
              ご質問やご不明点がある場合は、イベント主催者にお問い合わせください。
            </AlertDescription>
          </Alert>

          {/* 再決済ボタン（参加変更不可でも決済だけ可能にする） */}
          {canRepay && (
            <div className="mt-4 flex justify-center">
              <Button
                onClick={handleStripePayment}
                disabled={isProcessingPayment}
                className="min-w-[160px]"
              >
                {isProcessingPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                    決済準備中...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" aria-hidden="true" />
                    再決済へ進む
                  </>
                )}
              </Button>
            </div>
          )}
        </section>
      )}

      {/* 参加状況変更フォーム */}
      {canModify && (
        <section aria-labelledby="attendance-form-title">
          <Card className="p-4 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6" noValidate>
              <div>
                <h3
                  id="attendance-form-title"
                  className="text-lg font-semibold text-gray-900 mb-3 sm:mb-4"
                >
                  参加状況の変更
                </h3>
              </div>

              {/* エラー・成功メッセージ */}
              {error && (
                <Alert variant="destructive" role="alert" aria-live="polite">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  <AlertDescription>
                    <span className="sr-only">エラー：</span>
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-green-200 bg-green-50" role="status" aria-live="polite">
                  <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
                  <AlertDescription className="text-green-800">
                    <span className="sr-only">成功：</span>
                    {success}
                  </AlertDescription>
                </Alert>
              )}

              {/* 参加ステータス選択 */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-gray-900">
                  参加ステータス{" "}
                  <span className="text-red-500" aria-label="必須">
                    *
                  </span>
                </legend>
                <RadioGroup
                  value={attendanceStatus}
                  onValueChange={(value) => setAttendanceStatus(value as typeof attendanceStatus)}
                  className="space-y-3 sm:space-y-2"
                  aria-required="true"
                  aria-describedby="attendance-status-help"
                >
                  <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors min-h-[44px]">
                    <RadioGroupItem
                      value="attending"
                      id="attending"
                      className="h-5 w-5 sm:h-4 sm:w-4"
                      aria-describedby="attending-description"
                    />
                    <Label
                      htmlFor="attending"
                      className="text-sm text-gray-700 cursor-pointer flex-1 min-h-[44px] flex items-center"
                    >
                      参加
                    </Label>
                    <span id="attending-description" className="sr-only">
                      イベントに参加します
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors min-h-[44px]">
                    <RadioGroupItem
                      value="not_attending"
                      id="not_attending"
                      className="h-5 w-5 sm:h-4 sm:w-4"
                      aria-describedby="not-attending-description"
                    />
                    <Label
                      htmlFor="not_attending"
                      className="text-sm text-gray-700 cursor-pointer flex-1 min-h-[44px] flex items-center"
                    >
                      不参加
                    </Label>
                    <span id="not-attending-description" className="sr-only">
                      イベントに参加しません
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors min-h-[44px]">
                    <RadioGroupItem
                      value="maybe"
                      id="maybe"
                      className="h-5 w-5 sm:h-4 sm:w-4"
                      aria-describedby="maybe-description"
                    />
                    <Label
                      htmlFor="maybe"
                      className="text-sm text-gray-700 cursor-pointer flex-1 min-h-[44px] flex items-center"
                    >
                      未定
                    </Label>
                    <span id="maybe-description" className="sr-only">
                      参加するかまだ決まっていません
                    </span>
                  </div>
                </RadioGroup>
                <p id="attendance-status-help" className="text-xs text-gray-600 sr-only">
                  参加ステータスを選択してください。参加を選択した場合、決済方法の選択が必要になることがあります。
                </p>
              </fieldset>

              {/* 決済方法選択（参加かつ有料の場合のみ表示） */}
              {attendanceStatus === "attending" && attendance.event.fee > 0 && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-gray-900">
                    決済方法{" "}
                    <span className="text-red-500" aria-label="必須">
                      *
                    </span>
                  </legend>
                  {/* 決済完了済みの場合は選択不可とし注意文言のみ表示 */}
                  {attendance.payment?.status &&
                  ["paid", "received", "completed", "waived"].includes(
                    attendance.payment.status
                  ) ? (
                    <Alert className="border-blue-200 bg-blue-50" role="alert">
                      <CheckCircle className="h-4 w-4 text-blue-600" aria-hidden="true" />
                      <AlertDescription>
                        この参加者の決済は完了しています。支払方法を変更することはできません。
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <RadioGroup
                      value={paymentMethod}
                      onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}
                      className="space-y-3 sm:space-y-2"
                      aria-required="true"
                      aria-describedby="payment-method-help"
                    >
                      <div className="flex items-start space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors min-h-[64px]">
                        <RadioGroupItem
                          value="stripe"
                          id="stripe"
                          className="h-5 w-5 sm:h-4 sm:w-4 mt-0.5"
                          aria-describedby="stripe-description"
                        />
                        <Label
                          htmlFor="stripe"
                          className="text-sm text-gray-700 cursor-pointer flex-1 flex items-start space-x-2 min-h-[44px]"
                        >
                          <CreditCard className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                          <div>
                            <div className="font-medium">{PAYMENT_METHOD_LABELS.stripe}</div>
                            <div className="text-xs text-gray-500 mt-1">クレジットカード決済</div>
                          </div>
                        </Label>
                        <span id="stripe-description" className="sr-only">
                          オンラインでクレジットカードによる決済を行います
                        </span>
                      </div>
                      <div className="flex items-start space-x-3 p-3 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors min-h-[64px]">
                        <RadioGroupItem
                          value="cash"
                          id="cash"
                          className="h-5 w-5 sm:h-4 sm:w-4 mt-0.5"
                          aria-describedby="cash-description"
                        />
                        <Label
                          htmlFor="cash"
                          className="text-sm text-gray-700 cursor-pointer flex-1 flex items-start space-x-2 min-h-[44px]"
                        >
                          <Banknote className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                          <div>
                            <div className="font-medium">{PAYMENT_METHOD_LABELS.cash}</div>
                            <div className="text-xs text-gray-500 mt-1">当日現金支払い</div>
                          </div>
                        </Label>
                        <span id="cash-description" className="sr-only">
                          イベント当日に会場で現金で支払います
                        </span>
                      </div>
                    </RadioGroup>
                  )}

                  <p id="payment-method-help" className="text-xs text-gray-600 sr-only">
                    決済方法を選択してください。オンライン決済または現金決済を選べます。
                  </p>

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
                </fieldset>
              )}

              {/* 送信ボタン */}
              <div className="flex justify-center sm:justify-end">
                <Button
                  type="submit"
                  disabled={isSubmitting || isProcessingPayment || !hasChanges}
                  className="w-full sm:w-auto min-w-[120px] h-12 sm:h-10 text-base sm:text-sm font-medium min-h-[44px]"
                  aria-describedby={hasChanges ? undefined : "no-changes-help"}
                >
                  {isSubmitting || isProcessingPayment ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      {isProcessingPayment ? "決済準備中..." : "更新中..."}
                      <span className="sr-only">
                        {isProcessingPayment
                          ? "決済セッションを準備しています"
                          : "参加状況を更新しています"}
                      </span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                      {/* 再決済の場合はボタンテキストを変更 */}
                      {attendanceStatus === "attending" &&
                      attendance.event.fee > 0 &&
                      attendance.payment?.method === paymentMethod &&
                      attendance.payment?.status &&
                      ["failed", "pending"].includes(attendance.payment.status)
                        ? "再決済を実行"
                        : "変更を保存"}
                      {attendanceStatus === "attending" &&
                        attendance.event.fee > 0 &&
                        paymentMethod === "stripe" &&
                        hasChanges && <ExternalLink className="h-4 w-4 ml-1" aria-hidden="true" />}
                    </>
                  )}
                </Button>
                {!hasChanges && (
                  <p id="no-changes-help" className="sr-only">
                    変更がないため、送信ボタンは無効になっています
                  </p>
                )}
              </div>

              {/* 決済フロー案内 */}
              {attendanceStatus === "attending" &&
                attendance.event.fee > 0 &&
                paymentMethod === "stripe" &&
                hasChanges && (
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <div className="flex items-start space-x-2">
                      <CreditCard
                        className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <div className="text-xs text-blue-800 leading-relaxed">
                        <p className="font-medium">
                          {attendance.payment?.status &&
                          ["failed", "pending"].includes(attendance.payment.status)
                            ? "再決済について"
                            : "オンライン決済について"}
                        </p>
                        <p className="mt-1">
                          {attendance.payment?.status &&
                          ["failed", "pending"].includes(attendance.payment.status)
                            ? "「再決済を実行」をクリックすると、新しいStripe決済ページに移動します。"
                            : "「変更を保存」をクリックすると、参加状況の更新後に自動的にStripe決済ページに移動します。"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
            </form>
          </Card>
        </section>
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
                {formatUtcToJstByType(attendance.event.date, "japanese")}
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
                  {formatUtcToJstByType(attendance.event.registration_deadline, "japanese")}
                </p>
              </div>
            )}

            {attendance.event.payment_deadline && (
              <div>
                <h4 className="text-sm font-medium text-gray-700">決済締切</h4>
                <p className="mt-1 text-sm text-gray-900 break-words">
                  {formatUtcToJstByType(attendance.event.payment_deadline, "japanese")}
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
              <p className="mt-1 text-sm text-gray-900 break-all">
                {sanitizeForEventPay(attendance.email)}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-700">登録日時</h4>
              <p className="mt-1 text-sm text-gray-900 break-words">
                {formatUtcToJstByType(attendance.created_at, "japanese")}
              </p>
            </div>

            {attendance.updated_at !== attendance.created_at && (
              <div>
                <h4 className="text-sm font-medium text-gray-700">最終更新</h4>
                <p className="mt-1 text-sm text-gray-900 break-words">
                  {formatUtcToJstByType(attendance.updated_at, "japanese")}
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
