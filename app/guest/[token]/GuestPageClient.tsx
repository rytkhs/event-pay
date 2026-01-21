"use client";

import { useState, useMemo } from "react";

import { AlertCircle } from "lucide-react";

import type { BeginCheckoutParams } from "@core/analytics/event-types";
import { ga4Client } from "@core/analytics/ga4-client";
import { useToast } from "@core/contexts/toast-context";
import { useErrorHandler } from "@core/hooks/use-error-handler";
import { getPaymentDeadlineStatus } from "@core/utils/guest-restrictions";
import { type GuestAttendanceData } from "@core/utils/guest-token";
import { canCreateStripeSession } from "@core/validation/payment-eligibility";

import { PaymentStatusAlert } from "@features/events";
import {
  GuestStatusCard,
  GuestActionArea,
  GuestEventSummary,
  GuestSettingsArea,
  GuestStatusEditModal,
  GuestScenario,
} from "@features/guest";

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

import { createGuestStripeSessionAction } from "./actions";
interface GuestPageClientProps {
  attendance: GuestAttendanceData;
  canModify: boolean;
  payment?: string;
  sessionId?: string;
  guestToken: string;
}

export function GuestPageClient({
  attendance,
  canModify,
  payment,
  sessionId,
  guestToken,
}: GuestPageClientProps) {
  const { toast } = useToast();
  const { handleError } = useErrorHandler();
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // --- Validation Logic Restoration ---

  // 1. Payment Eligibility (Deadline, Capacity, etc.)
  // Note: canCreateStripeSession takes (attendance, event). Casting might be needed if types mismatch strictly,
  // but GuestAttendanceData usually matches or extends what's needed.
  // In GuestStatusOverview it was: canCreateStripeSession(attendance as any, attendance.event as any)
  const eligibility = canCreateStripeSession(attendance as any, attendance.event as any);

  // 2. Grace Period Status
  const deadlineStatus = getPaymentDeadlineStatus(attendance);
  const isGracePeriod = deadlineStatus === "grace_period";

  // 3. Invalid Payment Method (Selected method is no longer allowed)
  const isPaymentMethodInvalid = useMemo(() => {
    const availableMethods = attendance.event.payment_methods || [];
    const currentMethod = attendance.payment?.method;
    // If user has a method selected (e.g. stripe) but it's not in availableMethods anymore
    if (currentMethod && !availableMethods.includes(currentMethod)) {
      return true;
    }
    return false;
  }, [attendance]);

  // Derive Scenario
  const scenario = useMemo((): GuestScenario => {
    if (attendance.status === "not_attending") return GuestScenario.NOT_ATTENDING;
    if (attendance.status === "maybe") return GuestScenario.MAYBE;

    // Attending
    const fee = attendance.event.fee ?? 0;
    if (fee === 0) return GuestScenario.PAID; // Free event treated as Paid/Confirmed

    const isPaid =
      attendance.payment?.status &&
      ["paid", "received", "waived", "refunded"].includes(attendance.payment.status);

    if (isPaid) return GuestScenario.PAID;

    if (attendance.payment?.method === "cash") return GuestScenario.PENDING_CASH;

    return GuestScenario.PENDING_ONLINE;
  }, [attendance]);

  // Stripe Payment Handler
  const handleStripePayment = async () => {
    if (!attendance || (attendance.event.fee ?? 0) <= 0) return;

    setIsProcessingPayment(true);
    try {
      // 現在のURLに安全にクエリパラメータを追加してリダイレクト先を生成
      const buildRedirectUrl = (status: "success" | "canceled") => {
        const url = new URL(window.location.href);
        url.searchParams.delete("session_id");
        // 既存の payment パラメータを置き換える / 存在しなければ追加する
        url.searchParams.set("payment", status);
        return url.toString();
      };

      // GA4 Client IDを取得
      const gaClientId = await ga4Client.getClientId();

      // 2. Server Actionを開始 (非同期)
      const sessionCreationPromise = createGuestStripeSessionAction({
        guestToken: attendance.guest_token,
        successUrl: buildRedirectUrl("success"),
        cancelUrl: buildRedirectUrl("canceled"),
        gaClientId: gaClientId ?? undefined,
      });

      // 3. GA4イベント送信 (Fire and Forget)
      // Server Actionの完了を待たずに送信処理を行う
      const beginCheckoutParams: BeginCheckoutParams = {
        event_id: attendance.event.id,
        currency: "JPY",
        value: attendance.event.fee,
        items: [
          {
            item_id: attendance.event.id,
            item_name: attendance.event.title,
            price: attendance.event.fee,
            quantity: 1,
          },
        ],
      };
      ga4Client.sendEvent({ name: "begin_checkout", params: beginCheckoutParams });

      // 4. Server Actionの結果を待機
      const result = await sessionCreationPromise;

      if (result.success && result.data) {
        // Stripe Checkoutページにリダイレクト
        window.location.href = result.data.sessionUrl;
      } else {
        toast({
          title: "決済エラー",
          description: !result.success ? result.error : "決済セッションの作成に失敗しました。",
          variant: "destructive",
        });
        setIsProcessingPayment(false);
      }
    } catch (error) {
      handleError(error, {
        action: "create_stripe_session",
        additionalData: {
          tag: "guestStripePayment",
          attendanceId: attendance.id,
          eventId: attendance.event.id,
        },
      });
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Canceled Event Alert */}
      {(attendance.event as any).canceled_at && (
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>イベントは中止されました</AlertTitle>
          <AlertDescription>
            このイベントは中止されています。詳細については主催者にお問い合わせください。
          </AlertDescription>
        </Alert>
      )}

      {/* Payment Result Alert */}
      {payment && (
        <PaymentStatusAlert
          sessionId={sessionId}
          attendanceId={attendance.id}
          paymentStatus={payment}
          eventTitle={attendance.event.title}
          guestToken={guestToken}
        />
      )}

      {/* 1. Status Card */}
      <section className="animate-slideUp">
        <GuestStatusCard
          scenario={scenario}
          attendance={attendance}
          isPaymentInvalid={isPaymentMethodInvalid}
        />
      </section>

      {/* 2. Action Area */}
      <section className="animate-slideUp delay-100">
        <GuestActionArea
          scenario={scenario}
          onPay={handleStripePayment}
          onOpenModal={() => setIsModalOpen(true)}
          isProcessingPayment={isProcessingPayment}
          isEligible={eligibility.isEligible}
          ineligibilityReason={eligibility.reason}
          isGracePeriod={isGracePeriod}
          isPaymentInvalid={isPaymentMethodInvalid}
        />
      </section>

      {/* 3. Event Summary */}
      <section className="animate-slideUp delay-200">
        <GuestEventSummary attendance={attendance} />
      </section>

      {/* 4. Settings Area */}
      <section className="animate-slideUp delay-300">
        <GuestSettingsArea onOpenModal={() => setIsModalOpen(true)} />
      </section>

      {/* Footer is simpler in client or page? Mock had footer component. */}
      {/* Footer */}
      <footer className="py-8 text-center text-gray-400 text-xs space-y-3">
        {attendance.event.created_by && process.env.NEXT_PUBLIC_IS_DEMO !== "true" && (
          <div className="flex justify-center gap-4">
            <a
              href={`/tokushoho/${attendance.event.created_by}`}
              className="hover:text-gray-600 underline"
            >
              特定商取引法に基づく表記
            </a>
          </div>
        )}
        <div>
          <p>© みんなの集金</p>
        </div>
      </footer>

      {/* Edit Modal */}
      <GuestStatusEditModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        attendance={attendance}
        canModify={canModify}
      />
    </div>
  );
}
