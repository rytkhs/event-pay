"use client";

import { useEffect, useCallback, useState, useMemo, useRef } from "react";

import { useRouter } from "next/navigation";

import { CheckCircle, XCircle, AlertCircle, X, Loader2 } from "lucide-react";

import { apiClient, isApiError } from "@core/api/client";
import { sanitizeForEventPay } from "@core/utils/sanitize";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface PaymentStatusAlertProps {
  sessionId?: string;
  attendanceId: string;
  paymentStatus: string;
  eventTitle: string;
  guestToken: string;
}

interface VerificationSuccessResult {
  payment_status: "success" | "failed" | "canceled" | "processing" | "pending";
  payment_required: boolean;
}

export function PaymentStatusAlert({
  sessionId,
  attendanceId,
  paymentStatus,
  eventTitle,
  guestToken,
}: PaymentStatusAlertProps) {
  const router = useRouter();
  const [verifiedStatus, setVerifiedStatus] = useState<string | null>(null);
  const [paymentRequired, setPaymentRequired] = useState<boolean | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 8; // 指数バックオフ + ジッターで合計約 2 分を想定
  const abortRef = useRef<AbortController | null>(null);

  // 指数バックオフ + ジッター（0.5〜1.0倍）
  const getBackoffDelayMs = (attempt: number) => {
    const base = 1000; // 1s
    const max = 30000; // 30s
    const raw = Math.min(base * Math.pow(2, attempt), max);
    const jitter = 0.5 + Math.random() * 0.5;
    return Math.floor(raw * jitter);
  };

  // セッション検証を行う関数
  const verifySession = useCallback(async () => {
    if (!sessionId) return;

    setIsVerifying(true);
    setVerificationError(null);
    let localController: AbortController | null = null;

    try {
      // 既存のリクエストがあれば中断
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch (_e) {}
      }

      const controller = new AbortController();
      abortRef.current = controller;
      localController = controller;

      const params = new URLSearchParams({
        session_id: sessionId,
        attendance_id: attendanceId,
      });

      // apiClientを使用してJSONレスポンスを取得
      const result = await apiClient.get<VerificationSuccessResult>(
        `/api/payments/verify-session?${params}`,
        {
          headers: {
            "x-guest-token": guestToken,
          },
          signal: controller.signal,
        }
      );

      // 成功時の処理
      setVerifiedStatus(result.payment_status ?? null);
      setPaymentRequired(result.payment_required);

      // 決済完了の場合は、ページを最新状態にリフレッシュ
      if (result.payment_status === "success") {
        setTimeout(() => {
          router.refresh();
        }, 2000);
      }
    } catch (error: unknown) {
      // 中断は無視
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name?: string }).name === "AbortError"
      ) {
        return;
      }

      // ApiErrorの場合は詳細なエラーハンドリング
      if (isApiError(error)) {
        // エラー分類
        // - 致命（即表示）: 401/403/404（認証・認可・不整合）→ 明示エラーを表示
        // - 一時（再試行）: 429/5xx/ネットワーク/ retryable:true → processingへフォールバック
        // - それ以外の400系: 明示エラー
        const isFatalAuthOrNotFound =
          error.status === 401 || error.status === 403 || error.status === 404;
        const isRetryable = error.retryable || error.status === 429 || error.status >= 500;

        if (isFatalAuthOrNotFound) {
          let message: string;
          if (error.status === 404) {
            message = "決済セッションが見つかりません。再度決済を開始してください。";
          } else {
            message =
              "検証に必要な認証情報が無効か権限がありません。リンクを開き直すか、主催者にお問い合わせください。";
          }
          setVerificationError(message);
        } else if (isRetryable) {
          // 処理中にフォールバック（ユーザーにはエラーを見せず再確認）
          setVerifiedStatus((s) => s || "processing");
        } else {
          // それ以外の明らかな無効パラメータなどはエラー表示
          const message = error.detail || "検証に失敗しました";
          setVerificationError(message);
        }
      } else {
        // その他のエラー（ネットワーク障害など）は一時的エラーとしてフォールバック
        setVerifiedStatus((s) => s || "processing");
      }
    } finally {
      setIsVerifying(false);
      // 自分が最後に立てたコントローラであればクリア
      try {
        if (abortRef.current === localController) {
          abortRef.current = null;
        }
      } catch (_e) {}
    }
  }, [sessionId, attendanceId, guestToken, router]);

  // アンマウント時に未完了の検証を中断
  useEffect(() => {
    return () => {
      try {
        abortRef.current?.abort();
      } catch (_e) {}
    };
  }, []);

  // paymentStatus と verifiedStatus からの派生状態を単一点に集約
  const derivedStatus = useMemo(() => {
    return paymentStatus === "canceled" ? "canceled" : verifiedStatus || paymentStatus;
  }, [paymentStatus, verifiedStatus]);

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
    if (derivedStatus === "canceled") return;

    if (sessionId && !verifiedStatus && !isVerifying) {
      verifySession();
    }
  }, [sessionId, verifiedStatus, isVerifying, verifySession, derivedStatus]);

  // 決済ステータスが processing/pending の間は指数バックオフで再検証
  useEffect(() => {
    if (
      derivedStatus !== "canceled" &&
      sessionId &&
      ["processing", "pending"].includes(derivedStatus) &&
      retryCount < maxRetries
    ) {
      const delay = getBackoffDelayMs(retryCount);
      const timeoutId = setTimeout(() => {
        verifySession();
        setRetryCount((c) => c + 1);
      }, delay);
      return () => clearTimeout(timeoutId);
    }
  }, [sessionId, derivedStatus, verifySession, retryCount]);

  // ステータス確定後はリトライ回数をリセット
  useEffect(() => {
    const finalStatuses = ["success", "failed", "canceled"];
    if (finalStatuses.includes(derivedStatus)) {
      setRetryCount(0);
    }
  }, [derivedStatus]);

  // 自動的にアラートを閉じる（成功時のみ）
  useEffect(() => {
    if (derivedStatus === "success") {
      const timer = setTimeout(() => {
        clearPaymentStatus();
      }, 10000); // 10秒後に自動で閉じる

      return () => clearTimeout(timer);
    }
  }, [derivedStatus, clearPaymentStatus]);

  const getAlertContent = () => {
    // 検証中はローディング状態を表示
    // キャンセル時は検証ローディングを表示しない
    if (sessionId && isVerifying && derivedStatus !== "canceled") {
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
    switch (derivedStatus) {
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
      case "canceled":
        return {
          variant: "default" as const,
          icon: <XCircle className="h-5 w-5 text-orange-600" />,
          bgColor: "bg-orange-50 border-orange-200",
          textColor: "text-orange-800",
          title: "決済がキャンセルされました",
          description:
            "決済処理がキャンセルされました。参加費の決済を完了するには、決済を完了するボタンからやり直してください。",
        };
      case "failed":
        return {
          variant: "default" as const,
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          bgColor: "bg-red-50 border-red-200",
          textColor: "text-red-800",
          title: "決済に失敗しました",
          description:
            "決済処理に失敗しました。カード情報を確認の上、決済を完了するボタンからやり直してください。",
        };
      default:
        // ポーリング上限に達した場合のガイダンスを追加
        if (
          retryCount >= maxRetries &&
          sessionId &&
          ["processing", "pending"].includes(derivedStatus)
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
            {derivedStatus === "success" && (
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
