"use client";

import { useState, useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { Loader2, Save, CreditCard, AlertCircle, CheckCircle } from "lucide-react";

import { PAYMENT_METHOD_LABELS } from "@core/constants/payment-methods";
import { useToast } from "@core/contexts/toast-context";
import { useErrorHandler } from "@core/hooks/use-error-handler";
import { ATTENDANCE_STATUS_LABELS } from "@core/types/enums";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { type GuestAttendanceData } from "@core/utils/guest-token";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";
import { canGuestRepay } from "@core/validation/payment-eligibility";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { updateGuestAttendanceAction } from "../actions";

interface GuestManagementFormProps {
  attendance: GuestAttendanceData;
  canModify: boolean;
}

/**
 * Connect Account関連エラーの詳細メッセージを取得
 */
function getConnectAccountErrorMessage(errorCode?: string): string {
  switch (errorCode) {
    case "CONNECT_ACCOUNT_NOT_FOUND":
      return "決済の準備ができません。主催者のお支払い受付設定に不備があります。現金決済をご利用いただくか、主催者にお問い合わせください。";
    case "CONNECT_ACCOUNT_RESTRICTED":
      return "主催者のお支払い受付が一時的に制限されています。現金決済をご利用いただくか、主催者にお問い合わせください。";
    case "STRIPE_CONFIG_ERROR":
      return "決済システムに一時的な問題が発生しています。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。";
    default:
      return "オンライン決済に問題が発生しました。現金決済をご利用いただくか、主催者にお問い合わせください。";
  }
}

export function GuestManagementForm({ attendance, canModify }: GuestManagementFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { handleError } = useErrorHandler();
  const [attendanceStatus, setAttendanceStatus] = useState(attendance.status);
  const [paymentMethod, setPaymentMethod] = useState(attendance.payment?.method || "stripe");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const errorAlertRef = useRef<HTMLDivElement | null>(null);

  // 再決済ボタン表示条件
  const canRepayResult = canGuestRepay(attendance, {
    id: attendance.event.id,
    status: deriveEventStatus(attendance.event.date, null),
    fee: attendance.event.fee,
    date: attendance.event.date,
    payment_deadline: attendance.event.payment_deadline,
    allow_payment_after_deadline: attendance.event.allow_payment_after_deadline ?? false,
    grace_period_days: attendance.event.grace_period_days ?? 0,
  });
  const canRepay = canRepayResult.isEligible;

  // 参加ステータスの日本語表示
  const getAttendanceStatusText = (status: string) => {
    return ATTENDANCE_STATUS_LABELS[status as keyof typeof ATTENDANCE_STATUS_LABELS] || status;
  };

  // リセット処理
  const handleReset = () => {
    setAttendanceStatus(attendance.status);
    setPaymentMethod(attendance.payment?.method || "stripe");
    setError(null);
    setSuccess(null);
  };

  // 保存処理（決済開始なし）
  const performSubmit = async () => {
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
        toast({
          title: "保存完了",
          description: "参加状況を更新しました。",
          variant: "success",
        });

        // ページをリロードして最新データを表示
        router.refresh();
      } else {
        // Connect Account関連エラーかどうかを判定
        const isConnectAccountError =
          result.code === "CONNECT_ACCOUNT_NOT_FOUND" ||
          result.code === "CONNECT_ACCOUNT_RESTRICTED" ||
          result.code === "STRIPE_CONFIG_ERROR" ||
          (result.details as any)?.connectAccountIssue === true;

        if (isConnectAccountError) {
          // Connect Account問題時は詳細メッセージと代替案を表示
          const connectErrorMessage = getConnectAccountErrorMessage(result.code);
          setError(connectErrorMessage);

          // 自動的に現金決済に切り替える提案
          if (attendanceStatus === "attending" && attendance.event.fee > 0) {
            setTimeout(() => {
              if (paymentMethod !== "cash") {
                setPaymentMethod("cash");
                toast({
                  title: "決済方法を変更しました",
                  description: "オンライン決済に問題があるため、現金決済に変更しました。",
                  variant: "default",
                });
              }
            }, 1000);
          }
        } else {
          setError(result.error || "参加状況の更新に失敗しました。もう一度お試しください。");
        }
      }
    } catch (error) {
      handleError(error, {
        action: "guest_form_submit",
        additionalData: {
          tag: "guestManagementForm",
          attendanceId: attendance.id,
          eventId: attendance.event.id,
        },
      });
      setError("予期しないエラーが発生しました。しばらく待ってからもう一度お試しください。");
    } finally {
      setIsSubmitting(false);
      setIsConfirmOpen(false);
    }
  };

  // エラー発生時にエラー領域へスクロール＆フォーカス
  useEffect(() => {
    if (error && errorAlertRef.current) {
      errorAlertRef.current.focus({ preventScroll: true });
      errorAlertRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  // 送信前確認モーダルを開く
  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !hasChanges) return;
    setIsConfirmOpen(true);
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

          {/* 再決済はステータス概要の「決済を完了する」ボタンで行います */}
          {canRepay && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                決済が必要な場合は、ページ上部の「決済を完了する」ボタンをクリックしてください。
              </p>
            </div>
          )}
        </section>
      )}

      {/* 参加状況変更フォーム */}
      {canModify && (
        <section aria-labelledby="attendance-form-title">
          <Card className="p-6">
            <form onSubmit={handleOpenConfirm} className="space-y-6" noValidate>
              <div>
                <h2
                  id="attendance-form-title"
                  className="text-lg font-semibold text-gray-900 flex items-center mb-6"
                >
                  <div className="text-xl mr-2">⚙️</div>
                  参加管理
                </h2>
              </div>

              {/* エラー・成功メッセージ */}
              {error && (
                <>
                  {/* Connect Account関連エラーかどうかを判定 */}
                  {(() => {
                    const isConnectError =
                      error.includes("決済の準備ができません") ||
                      error.includes("お支払い受付設定に不備") ||
                      error.includes("一時的に制限されています") ||
                      error.includes("決済システムに一時的な問題");

                    return isConnectError ? (
                      <Alert
                        className="border-orange-200 bg-orange-50"
                        role="alert"
                        aria-live="assertive"
                        ref={errorAlertRef}
                        tabIndex={-1}
                      >
                        <AlertCircle className="h-4 w-4 text-orange-600" aria-hidden="true" />
                        <AlertDescription className="space-y-3">
                          <div className="text-orange-800">
                            <span className="sr-only">オンライン決済エラー：</span>
                            <div className="font-medium mb-2">オンライン決済に問題があります</div>
                            <div className="text-sm">{error}</div>
                          </div>

                          {/* 代替案提示 */}
                          {attendanceStatus === "attending" &&
                            attendance.event.fee > 0 &&
                            paymentMethod !== "cash" && (
                              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentMethod("cash");
                                    setError(null);
                                    toast({
                                      title: "現金決済に変更",
                                      description: "決済方法を現金決済に変更しました。",
                                      variant: "success",
                                    });
                                  }}
                                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-orange-700 bg-orange-100 border border-orange-300 rounded-md hover:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors"
                                >
                                  <CreditCard className="h-4 w-4 mr-2" />
                                  現金決済に変更する
                                </button>
                              </div>
                            )}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert
                        variant="destructive"
                        role="alert"
                        aria-live="assertive"
                        ref={errorAlertRef}
                        tabIndex={-1}
                      >
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        <AlertDescription>
                          <span className="sr-only">エラー：</span>
                          {error}
                        </AlertDescription>
                      </Alert>
                    );
                  })()}
                </>
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
                <legend className="text-sm font-medium text-gray-700 mb-3">参加意思:</legend>
                <div className="space-y-2">
                  {[
                    { value: "attending" as const, label: "参加", color: "green" },
                    { value: "not_attending" as const, label: "不参加", color: "red" },
                    { value: "maybe" as const, label: "未定", color: "yellow" },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        attendanceStatus === option.value
                          ? option.color === "green"
                            ? "border-green-300 bg-green-50"
                            : option.color === "red"
                              ? "border-red-300 bg-red-50"
                              : "border-yellow-300 bg-yellow-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="participationStatus"
                        value={option.value}
                        checked={attendanceStatus === option.value}
                        onChange={(e) =>
                          setAttendanceStatus(e.target.value as typeof attendanceStatus)
                        }
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
                          attendanceStatus === option.value
                            ? option.color === "green"
                              ? "border-green-500 bg-green-500"
                              : option.color === "red"
                                ? "border-red-500 bg-red-500"
                                : "border-yellow-500 bg-yellow-500"
                            : "border-gray-300"
                        }`}
                      >
                        {attendanceStatus === option.value && (
                          <div className="w-2 h-2 rounded-full bg-white"></div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{option.label}</span>
                    </label>
                  ))}
                </div>
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
                    <div className="space-y-2">
                      {[
                        {
                          value: "stripe" as const,
                          label: "オンライン決済",
                          description: "クレジットカード・銀行振込",
                        },
                        {
                          value: "cash" as const,
                          label: "当日現金払い",
                          description: "会場での現金支払い",
                        },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className={`flex items-start p-3 rounded-lg border-2 cursor-pointer transition-all ${
                            paymentMethod === option.value
                              ? "border-blue-300 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={option.value}
                            checked={paymentMethod === option.value}
                            onChange={(e) =>
                              setPaymentMethod(e.target.value as typeof paymentMethod)
                            }
                            className="sr-only"
                          />
                          <div
                            className={`w-4 h-4 rounded-full border-2 mr-3 mt-0.5 flex items-center justify-center flex-shrink-0 ${
                              paymentMethod === option.value
                                ? "border-blue-500 bg-blue-500"
                                : "border-gray-300"
                            }`}
                          >
                            {paymentMethod === option.value && (
                              <div className="w-2 h-2 rounded-full bg-white"></div>
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{option.label}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{option.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
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

              {/* 変更警告 */}
              {hasChanges && (
                <div className="flex items-start space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    変更が保存されていません。「変更を保存」ボタンをクリックして保存してください。
                  </div>
                </div>
              )}

              {/* 送信・リセットボタン */}
              <div className="pt-4 flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting || !hasChanges}
                  className={`flex items-center justify-center flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    hasChanges && !isSubmitting
                      ? "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      変更を保存
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isSubmitting || !hasChanges}
                  className={`flex items-center justify-center px-4 py-3 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    hasChanges && !isSubmitting
                      ? "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500"
                      : "bg-gray-50 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  リセット
                </button>
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
                <h4 className="text-sm font-medium text-gray-700">オンライン決済締切</h4>
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

      {/* 確認モーダル */}
      <Dialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setIsConfirmOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>変更内容の確認</DialogTitle>
            <DialogDescription>以下の内容で変更を保存します。よろしいですか？</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">参加意思:</span>
              <span className="font-medium text-gray-900">
                {getAttendanceStatusText(attendanceStatus)}
              </span>
            </div>
            {attendanceStatus === "attending" && attendance.event.fee > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">決済方法:</span>
                <span className="font-medium text-gray-900">
                  {PAYMENT_METHOD_LABELS[paymentMethod as keyof typeof PAYMENT_METHOD_LABELS]}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              キャンセル
            </Button>
            <Button
              type="button"
              onClick={performSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  保存中...
                </>
              ) : (
                "保存する"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
