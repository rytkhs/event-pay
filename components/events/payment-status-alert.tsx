"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, AlertCircle, X, Loader2 } from "lucide-react";

interface PaymentStatusAlertProps {
  sessionId?: string;
  attendanceId: string;
  paymentStatus: string;
  eventTitle: string;
}

interface VerificationResult {
  success: boolean;
  payment_status?: "success" | "failed" | "cancelled" | "processing" | "pending";
  payment_required?: boolean;
  error?: string;
}

export function PaymentStatusAlert({
  sessionId,
  attendanceId,
  paymentStatus,
  eventTitle,
}: PaymentStatusAlertProps) {
  const router = useRouter();
  const [verifiedStatus, setVerifiedStatus] = useState<string | null>(null);
  const [paymentRequired, setPaymentRequired] = useState<boolean | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 12; // 5秒間隔で1分間

  // セッション検証を行う関数
  const verifySession = useCallback(async () => {
    if (!sessionId) return;

    setIsVerifying(true);
    setVerificationError(null);

    try {
      const params = new URLSearchParams({
        session_id: sessionId,
        attendance_id: attendanceId,
      });

      const response = await fetch(`/api/payments/verify-session?${params}`);
      const result: VerificationResult = await response.json();

      if (result.success) {
        setVerifiedStatus(result.payment_status ?? null);
        if (typeof result.payment_required === "boolean") {
          setPaymentRequired(result.payment_required);
        }

        // 決済完了の場合は、ページを最新状態にリフレッシュ
        if (result.payment_status === "success") {
          setTimeout(() => {
            router.refresh();
          }, 2000);
        }
      } else {
        setVerificationError(result.error || "検証に失敗しました");
      }
    } catch (_error) {
      // エラーログはクライアント側では記録しない（セキュリティ上の理由）
      setVerificationError("ネットワークエラーが発生しました");
    } finally {
      setIsVerifying(false);
    }
  }, [sessionId, attendanceId, router]);

  // ポーリング打ち切り後に手動再確認する関数
  const retryVerify = useCallback(() => {
    setRetryCount(0); // リセットして再度ポーリングできるように
    verifySession();
  }, [verifySession]);

  // URL パラメータをクリアするための関数
  const clearPaymentStatus = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    url.searchParams.delete("session_id");
    router.replace(url.pathname + url.search + url.hash);
  }, [router]);

  // セッション検証を実行（sessionIdがある場合）
  useEffect(() => {
    // キャンセル導線では検証を行わず、UIのキャンセル表示を優先する
    if (paymentStatus === "cancelled") return;

    if (sessionId && !verifiedStatus && !isVerifying) {
      verifySession();
    }
  }, [sessionId, verifiedStatus, isVerifying, verifySession, paymentStatus]);

  // 決済ステータスが processing/pending の間はポーリングで再検証
  useEffect(() => {
    // キャンセルがURLで指定されている場合は常にキャンセルを優先
    const currentStatus =
      paymentStatus === "cancelled" ? "cancelled" : verifiedStatus || paymentStatus;

    // 対象ステータスか & sessionId があるか & リトライ上限未満
    if (
      paymentStatus !== "cancelled" &&
      sessionId &&
      ["processing", "pending"].includes(currentStatus) &&
      retryCount < maxRetries
    ) {
      const intervalId = setInterval(() => {
        verifySession();
        setRetryCount((c) => c + 1);
      }, 5000); // 5秒ごと

      return () => clearInterval(intervalId);
    }
  }, [sessionId, verifiedStatus, paymentStatus, verifySession, retryCount]);

  // ステータス確定後はリトライ回数をリセット
  useEffect(() => {
    const finalStatuses = ["success", "failed", "cancelled"];
    if (finalStatuses.includes(verifiedStatus || "")) {
      setRetryCount(0);
    }
  }, [verifiedStatus]);

  // 自動的にアラートを閉じる（成功時のみ）
  useEffect(() => {
    const currentStatus =
      paymentStatus === "cancelled" ? "cancelled" : verifiedStatus || paymentStatus;
    if (currentStatus === "success") {
      const timer = setTimeout(() => {
        clearPaymentStatus();
      }, 10000); // 10秒後に自動で閉じる

      return () => clearTimeout(timer);
    }
  }, [verifiedStatus, paymentStatus, clearPaymentStatus]);

  const getAlertContent = () => {
    // 検証中はローディング状態を表示
    // キャンセル時は検証ローディングを表示しない
    if (sessionId && isVerifying && paymentStatus !== "cancelled") {
      return {
        variant: "default" as const,
        icon: <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />,
        bgColor: "bg-blue-50 border-blue-200",
        textColor: "text-blue-800",
        title: "決済状況を確認中",
        description: "決済ステータスを検証しています...",
      };
    }

    // 検証エラーがある場合
    if (verificationError) {
      return {
        variant: "default" as const,
        icon: <AlertCircle className="h-5 w-5 text-red-600" />,
        bgColor: "bg-red-50 border-red-200",
        textColor: "text-red-800",
        title: "検証エラー",
        description: verificationError,
      };
    }

    // キャンセル導線ではURLのキャンセルを優先、他は検証済みを優先
    const currentStatus =
      paymentStatus === "cancelled" ? "cancelled" : verifiedStatus || paymentStatus;

    switch (currentStatus) {
      case "success":
        if (paymentRequired === false) {
          // 無料/全額割引: 支払い不要の完了
          return {
            variant: "default" as const,
            icon: <CheckCircle className="h-5 w-5 text-green-600" />,
            bgColor: "bg-green-50 border-green-200",
            textColor: "text-green-800",
            title: verifiedStatus ? "参加登録が完了しました（検証済み）" : "参加登録が完了しました",
            description: `${sanitizeForEventPay(eventTitle)}の参加登録が確定しました。お支払いは不要です。`,
          };
        }
        // 有料の決済完了
        return {
          variant: "default" as const,
          icon: <CheckCircle className="h-5 w-5 text-green-600" />,
          bgColor: "bg-green-50 border-green-200",
          textColor: "text-green-800",
          title: verifiedStatus ? "決済が完了しました（検証済み）" : "決済が完了しました",
          description: `${sanitizeForEventPay(eventTitle)}の参加費の決済が正常に完了しました。参加登録が確定されました。`,
        };
      case "cancelled":
        return {
          variant: "default" as const,
          icon: <XCircle className="h-5 w-5 text-orange-600" />,
          bgColor: "bg-orange-50 border-orange-200",
          textColor: "text-orange-800",
          title: "決済がキャンセルされました",
          description:
            "決済処理がキャンセルされました。参加費の決済を完了するには、ページ下部の再決済ボタンから決済をやり直してください。",
        };
      case "failed":
        return {
          variant: "default" as const,
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          bgColor: "bg-red-50 border-red-200",
          textColor: "text-red-800",
          title: "決済に失敗しました",
          description:
            "決済処理に失敗しました。カード情報を確認の上、ページ下部の再決済ボタンから決済をやり直してください。",
        };
      default:
        // ポーリング上限に達した場合のガイダンスを追加
        if (
          retryCount >= maxRetries &&
          sessionId &&
          ["processing", "pending"].includes(currentStatus)
        ) {
          return {
            variant: "default" as const,
            icon: <AlertCircle className="h-5 w-5 text-blue-600" />,
            bgColor: "bg-blue-50 border-blue-200",
            textColor: "text-blue-800",
            title: "決済状況を再確認できません",
            description:
              "決済確認に時間がかかっています。もう一度確認を行うか、ページを再読み込みしてください。",
            // 再確認 / リロード用のアクション要素を返す
            actions: (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={retryVerify}>
                  もう一度確認
                </Button>
                <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
                  ページを更新
                </Button>
              </div>
            ),
          } as const;
        }

        return {
          variant: "default" as const,
          icon: <AlertCircle className="h-5 w-5 text-blue-600" />,
          bgColor: "bg-blue-50 border-blue-200",
          textColor: "text-blue-800",
          title: "決済処理中",
          description: "決済処理の状況を確認中です。しばらくお待ちください。",
        };
    }
  };

  const alertContent = getAlertContent();

  return (
    <Alert className={`${alertContent.bgColor} mb-4 sm:mb-6`} role="alert" aria-live="polite">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
            {alertContent.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className={`font-semibold text-sm ${alertContent.textColor}`}>
              {alertContent.title}
            </h3>
            <AlertDescription className={`mt-1 text-sm ${alertContent.textColor}`}>
              {alertContent.description}
            </AlertDescription>
            {alertContent.actions}
            {(verifiedStatus === "success" || paymentStatus === "success") && (
              <div className="mt-2">
                <p className={`text-xs ${alertContent.textColor} opacity-80`}>
                  このメッセージは10秒後に自動的に非表示になります。
                </p>
                {verifiedStatus && (
                  <p className={`text-xs ${alertContent.textColor} opacity-60 mt-1`}>
                    ✓ Stripeとの整合性を確認済み
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearPaymentStatus}
          className="flex-shrink-0 h-6 w-6 p-0 hover:bg-transparent"
          aria-label="アラートを閉じる"
        >
          <X className="h-4 w-4 text-gray-500 hover:text-gray-700" />
        </Button>
      </div>
    </Alert>
  );
}
