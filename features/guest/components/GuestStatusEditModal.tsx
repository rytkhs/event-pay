"use client";

import React, { useState, useEffect } from "react";

import { useRouter } from "next/navigation";

import {
  X,
  Check,
  Banknote,
  CreditCard,
  UserMinus,
  HelpCircle,
  UserCheck,
  Loader2,
  AlertCircle,
} from "lucide-react";

import { ga4Client } from "@core/analytics/ga4-client";
import { useToast } from "@core/contexts/toast-context";
import type { ActionResult } from "@core/errors/adapters/server-actions";
import { useErrorHandler } from "@core/hooks/use-error-handler";
import { getModificationRestrictionReason } from "@core/utils/guest-restrictions";
import { type GuestAttendanceData } from "@core/utils/guest-token";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

import {
  type AttendanceStatus,
  type PaymentMethod,
  type UpdateGuestAttendanceData,
} from "../types";

interface GuestStatusEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  attendance: GuestAttendanceData;
  canModify: boolean;
  updateGuestAttendanceAction: UpdateGuestAttendanceAction;
}

type UpdateGuestAttendanceAction = (
  formData: FormData
) => Promise<ActionResult<UpdateGuestAttendanceData>>;

/**
 * 変更不可の理由に応じたメッセージを取得
 */
function getModificationRestrictionMessage(attendance: GuestAttendanceData): string {
  const reason = getModificationRestrictionReason(attendance);

  if (reason === "canceled") {
    return "このイベントは中止されているため、参加状況を変更できません。";
  } else if (reason === "deadline_passed") {
    return "参加登録の締切を過ぎているため、参加状況を変更できません。";
  }

  return "参加状況の変更期限を過ぎているため、現在変更できません。";
}

/**
 * Connect Account関連エラーの詳細メッセージを取得
 */
function getConnectAccountErrorMessage(errorCode?: string): string {
  switch (errorCode) {
    case "CONNECT_ACCOUNT_NOT_FOUND":
      return "オンライン決済の準備ができていません。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。";
    case "CONNECT_ACCOUNT_RESTRICTED":
      return "現在オンライン決済がご利用いただけません。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。";
    case "STRIPE_CONFIG_ERROR":
      return "決済システムに一時的な問題が発生しています。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。";
    default:
      return "オンライン決済に問題が発生しました。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。";
  }
}

export const GuestStatusEditModal: React.FC<GuestStatusEditModalProps> = ({
  isOpen,
  onClose,
  attendance,
  canModify,
  updateGuestAttendanceAction,
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const { handleError } = useErrorHandler();

  // State
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>(attendance.status);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      // 利用可能な決済方法から初期値を選択
      const getInitialPaymentMethod = () => {
        const availableMethods = attendance.event.payment_methods || [];
        const currentMethod = attendance.payment?.method;

        if (currentMethod && availableMethods.includes(currentMethod)) {
          return currentMethod;
        }
        // Default priority
        if (availableMethods.includes("stripe")) return "stripe";
        if (availableMethods.includes("cash")) return "cash";
        return undefined;
      };

      setAttendanceStatus(attendance.status);
      setPaymentMethod(getInitialPaymentMethod());
      setError(null);
    }
  }, [isOpen, attendance]);

  // Handlers
  const handleSave = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("guestToken", attendance.guest_token);
      formData.append("attendanceStatus", attendanceStatus);

      // 参加かつ有料の場合のみ決済方法を送信
      if (attendanceStatus === "attending" && (attendance.event.fee ?? 0) > 0) {
        if (!paymentMethod) {
          setError("決済方法を選択してください。");
          setIsSubmitting(false);
          return;
        }
        formData.append("paymentMethod", paymentMethod);
      }

      const result = await updateGuestAttendanceAction(formData);

      if (result.success) {
        // GA4
        if (attendanceStatus === "attending") {
          ga4Client.sendEvent({
            name: "event_registration",
            params: {
              event_id: attendance.event.id,
            },
          });
        }

        toast({
          title: "更新完了",
          description: "参加状況を保存しました。",
          variant: "success",
        });

        router.refresh();
        onClose();
      } else {
        // Handle Errors (Connect Account logic)
        const isConnectAccountError =
          result.error?.code === "CONNECT_ACCOUNT_NOT_FOUND" ||
          result.error?.code === "CONNECT_ACCOUNT_RESTRICTED" ||
          result.error?.code === "STRIPE_CONFIG_ERROR" ||
          (result.error?.details as { connectAccountIssue?: boolean } | undefined)
            ?.connectAccountIssue === true;

        if (isConnectAccountError) {
          const connectErrorMessage = getConnectAccountErrorMessage(result.error?.code);
          setError(connectErrorMessage);
        } else {
          setError(result.error?.userMessage || "更新に失敗しました。");
        }
      }
    } catch (err) {
      handleError(err, {
        action: "guest_modal_submit",
        additionalData: { tag: "GuestStatusEditModal" },
      });
      setError("予期しないエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- UI Helpers ---
  const isPaid =
    attendance.payment?.status &&
    ["paid", "received", "waived", "refunded"].includes(attendance.payment.status);

  // Available methods checking
  const availableMethods = (attendance.event.payment_methods || []).filter((m) =>
    ["stripe", "cash"].includes(m)
  );

  return (
    <Drawer open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DrawerContent className="max-w-md mx-auto">
        <DrawerHeader className="relative">
          <DrawerTitle>ステータス変更</DrawerTitle>
          <DrawerDescription className="sr-only">
            ゲストの参加状況と支払い方法を変更します。
          </DrawerDescription>
          <DrawerClose className="absolute right-4 top-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
            <span className="sr-only">閉じる</span>
          </DrawerClose>
        </DrawerHeader>

        <div className="p-6 overflow-y-auto max-h-[80vh]">
          {/* Modification Disabled Warning */}
          {!canModify && (
            <div className="mb-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{getModificationRestrictionMessage(attendance)}</AlertDescription>
              </Alert>
            </div>
          )}

          {/* Global Error */}
          {error && (
            <div className="mb-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          {/* 1. Attendance Selection */}
          <div className="mb-8">
            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              出欠確認
            </span>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => canModify && setAttendanceStatus("attending")}
                disabled={!canModify}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all disabled:opacity-50 ${
                  attendanceStatus === "attending"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                <UserCheck
                  className={`w-6 h-6 mb-1 ${attendanceStatus === "attending" ? "fill-emerald-200" : ""}`}
                />
                <span className="text-sm font-bold">参加</span>
              </button>

              <button
                onClick={() => canModify && setAttendanceStatus("maybe")}
                disabled={!canModify}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all disabled:opacity-50 ${
                  attendanceStatus === "maybe"
                    ? "border-amber-500 bg-amber-50 text-amber-800"
                    : "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                <HelpCircle className="w-6 h-6 mb-1" />
                <span className="text-sm font-bold">未定</span>
              </button>

              <button
                onClick={() => canModify && setAttendanceStatus("not_attending")}
                disabled={!canModify}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all disabled:opacity-50 ${
                  attendanceStatus === "not_attending"
                    ? "border-gray-500 bg-gray-100 text-gray-800"
                    : "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                <UserMinus className="w-6 h-6 mb-1" />
                <span className="text-sm font-bold">不参加</span>
              </button>
            </div>
          </div>

          {/* 2. Payment Method (Conditional) */}
          {attendanceStatus === "attending" && (attendance.event.fee ?? 0) > 0 && (
            <div className="mb-8 animate-fadeIn">
              <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                支払い方法
              </span>

              {isPaid ? (
                <Alert className="border-blue-200 bg-blue-50">
                  <Check className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    決済が完了しているため、支払い方法は変更できません。
                  </AlertDescription>
                </Alert>
              ) : availableMethods.length === 0 ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    利用可能な決済方法がありません。しばらく経ってから再度お試しください。
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  {/* Stripe Option */}
                  {availableMethods.includes("stripe") && (
                    <button
                      onClick={() => canModify && setPaymentMethod("stripe")}
                      disabled={!canModify}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all disabled:opacity-50 ${
                        paymentMethod === "stripe"
                          ? "border-indigo-500 bg-indigo-50 shadow-sm relative overflow-hidden"
                          : "border-gray-100 bg-white hover:border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-4 relative z-10">
                        <div
                          className={`p-3 rounded-full ${paymentMethod === "stripe" ? "bg-indigo-200 text-indigo-700" : "bg-gray-100 text-gray-500"}`}
                        >
                          <CreditCard className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                          <p
                            className={`font-bold ${paymentMethod === "stripe" ? "text-indigo-900" : "text-gray-800"}`}
                          >
                            オンライン決済
                          </p>
                          <p className="text-xs text-gray-500">
                            クレジットカード / Apple Pay / Google Payなど
                          </p>
                        </div>
                      </div>
                      {paymentMethod === "stripe" && (
                        <Check className="w-5 h-5 text-indigo-600 relative z-10" />
                      )}
                    </button>
                  )}

                  {/* Cash Option */}
                  {availableMethods.includes("cash") && (
                    <button
                      onClick={() => canModify && setPaymentMethod("cash")}
                      disabled={!canModify}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all disabled:opacity-50 ${
                        paymentMethod === "cash"
                          ? "border-blue-500 bg-blue-50 shadow-sm"
                          : "border-gray-100 bg-white hover:border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`p-3 rounded-full ${paymentMethod === "cash" ? "bg-blue-200 text-blue-700" : "bg-gray-100 text-gray-500"}`}
                        >
                          <Banknote className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                          <p
                            className={`font-bold ${paymentMethod === "cash" ? "text-blue-900" : "text-gray-800"}`}
                          >
                            現金決済
                          </p>
                          <p className="text-xs text-gray-500">現金で直接お支払いください</p>
                        </div>
                      </div>
                      {paymentMethod === "cash" && <Check className="w-5 h-5 text-blue-600" />}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Message for Non-Attending/Maybe */}
          {attendanceStatus === "not_attending" && (
            <div className="bg-gray-50 p-4 rounded-xl mb-8 text-center text-sm text-gray-500 animate-fadeIn">
              ご連絡ありがとうございます。またのご参加をお待ちしております。
            </div>
          )}

          {attendanceStatus === "maybe" && (
            <div className="bg-gray-50 p-4 rounded-xl mb-8 text-center text-sm text-gray-500 animate-fadeIn">
              回答期限までに再度ステータスの更新をお願いいたします。
            </div>
          )}
        </div>

        <DrawerFooter className="p-6 pt-0">
          <Button
            onClick={handleSave}
            disabled={
              !canModify ||
              isSubmitting ||
              (attendanceStatus === "attending" &&
                (attendance.event.fee ?? 0) > 0 &&
                !paymentMethod)
            }
            className="w-full bg-gray-900 text-white font-bold h-14 rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              "内容を保存する"
            )}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
