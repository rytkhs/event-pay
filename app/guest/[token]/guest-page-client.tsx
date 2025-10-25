"use client";

import { useState } from "react";

import { AlertCircle } from "lucide-react";

import { useToast } from "@core/contexts/toast-context";
import { useErrorHandler } from "@core/hooks/use-error-handler";
import { type GuestAttendanceData } from "@core/utils/guest-token";

import { PaymentStatusAlert } from "@features/events";
import {
  GuestManagementForm,
  GuestStatusOverview,
  // GuestEventDetails,
  createGuestStripeSessionAction,
} from "@features/guest";

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

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
  // const router = useRouter();
  const { toast } = useToast();
  const { handleError } = useErrorHandler();
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Stripe決済セッション作成処理
  const handleStripePayment = async () => {
    if (!attendance || attendance.event.fee <= 0) return;

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

      const result = await createGuestStripeSessionAction({
        guestToken: attendance.guest_token,
        successUrl: buildRedirectUrl("success"),
        cancelUrl: buildRedirectUrl("canceled"),
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
      handleError(error, {
        action: "create_stripe_session",
        additionalData: {
          tag: "guestStripePayment",
          attendanceId: attendance.id,
          eventId: attendance.event.id,
        },
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <>
      {/* 中止イベントバナー */}
      {(attendance.event as any).canceled_at && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>イベントは中止されました</AlertTitle>
          <AlertDescription>
            このイベントは中止されています。詳細については主催者にお問い合わせください。
          </AlertDescription>
        </Alert>
      )}

      {/* ステータス概要 */}
      <section className="mb-6 sm:mb-8">
        <GuestStatusOverview
          attendance={attendance}
          scrollTargetId="guest-form-section"
          onPaymentClick={handleStripePayment}
          isProcessingPayment={isProcessingPayment}
        />
      </section>

      {/* 決済結果表示 */}
      {payment && (
        <PaymentStatusAlert
          sessionId={sessionId}
          attendanceId={attendance.id}
          paymentStatus={payment}
          eventTitle={attendance.event.title}
          guestToken={guestToken}
        />
      )}

      {/* イベント詳細 */}
      {/* <section className="mb-6 sm:mb-8">
        <GuestEventDetails attendance={attendance} />
      </section> */}

      {/* ゲスト管理フォーム */}
      <section id="guest-form-section">
        <GuestManagementForm attendance={attendance} canModify={canModify} />
      </section>
    </>
  );
}
