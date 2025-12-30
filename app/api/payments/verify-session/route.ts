/**
 * 決済セッション検証APIエンドポイント
 * Stripe Checkout Session IDを使用して決済ステータスを検証
 */

export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { z } from "zod";

import { createProblemResponse, createQueryValidationError } from "@core/api/problem-details";
import { logger } from "@core/logging/app-logger";
import { withRateLimit, buildKey, POLICIES } from "@core/rate-limit";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { logSecurityEvent } from "@core/security/security-logger";
import { getStripe } from "@core/stripe/client";
import { getClientIP } from "@core/utils/ip-detection";
import { maskSessionId } from "@core/utils/mask";

// リクエストバリデーションスキーマ
const VerifySessionSchema = z.object({
  session_id: z
    .string({
      required_error: "セッションIDは必須です",
      invalid_type_error: "セッションIDは必須です",
    })
    .min(1, "セッションIDは必須です"),
  attendance_id: z
    .string({
      required_error: "有効な参加IDを入力してください",
      invalid_type_error: "有効な参加IDを入力してください",
    })
    .uuid("有効な参加IDを入力してください"),
});

// レスポンス型
interface VerificationResult {
  success: boolean;
  /**
   * 決済ステータス
   *
   * success フラグが true の場合のみ必ず含まれる。
   * リクエストエラー時（success: false）のレスポンスでは省略される。
   */
  payment_status?: "success" | "failed" | "canceled" | "processing" | "pending";
  /**
   * このセッションで支払いが必要か（無料・全額割引は false）
   * success フラグが true の場合に付与され得る。
   */
  payment_required?: boolean;
  error?: string;
}

export async function GET(request: NextRequest) {
  try {
    // 事前レート制限（署名検証互換: ボディ未消費）
    const mw = withRateLimit(POLICIES["stripe.checkout"], (r) =>
      buildKey({
        scope: "stripe.checkout",
        ip: getClientIP(r),
        token: r.headers.get("x-guest-token") || undefined,
      })
    );
    const rateLimited = await mw(request);
    if (rateLimited) return rateLimited;

    const guestToken = request.headers.get("x-guest-token");
    if (!guestToken) {
      logSecurityEvent({
        type: "INVALID_TOKEN",
        severity: "HIGH",
        message: "Missing guest token in payment verification request",
        details: {
          endpoint: "/api/payments/verify-session",
        },
        ip: getClientIP(request),
        timestamp: new Date(),
      });
      return createProblemResponse("MISSING_PARAMETER", {
        instance: "/api/payments/verify-session",
        detail: "ゲストトークンが必要です",
      });
    }

    // 1. 残りのパラメータを取得
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session_id");
    const attendanceParam = url.searchParams.get("attendance_id") || "unknown";
    const attendanceId = attendanceParam === "unknown" ? null : attendanceParam;

    // バリデーション
    const validationResult = VerifySessionSchema.safeParse({
      session_id: sessionId,
      attendance_id: attendanceId,
    });

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) =>
        createQueryValidationError(err.path[0] as string, "VALIDATION_ERROR", err.message)
      );

      return createProblemResponse("VALIDATION_ERROR", {
        instance: "/api/payments/verify-session",
        detail: "リクエストパラメータの検証に失敗しました",
        errors,
      });
    }

    const { session_id, attendance_id } = validationResult.data;

    // attendances テーブル経由で payment 情報を取得（サービスロールでRLSをバイパス）
    // ゲストトークンでの権限確認は事前に実施済み（APIレベルでヘッダー検証）
    const secureClientFactory = SecureSupabaseClientFactory.create();
    const supabase = await secureClientFactory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "PAYMENT_SESSION_VERIFICATION",
      {
        additionalInfo: {
          attendanceId: attendance_id,
          sessionId: maskSessionId(session_id),
          hasGuestToken: !!guestToken,
        },
      }
    );

    // attendances テーブルから関連する payment 情報を取得（権限確認済み）
    const { data: attendanceData, error: dbError } = await supabase
      .from("attendances")
      .select(
        `
        id,
        guest_token,
        payment:payments (
          id,
          status,
          stripe_checkout_session_id,
          amount
        )
      `
      )
      .eq("id", attendance_id)
      .single();

    // ゲストトークンの照合確認（セキュリティチェック）
    if (!attendanceData || attendanceData.guest_token !== guestToken) {
      logSecurityEvent({
        type: "SUSPICIOUS_ACTIVITY",
        severity: "HIGH",
        message: attendanceData
          ? "Guest token mismatch during payment verification"
          : "Payment verification attempted with non-existent attendance record",
        details: {
          attendanceId: attendance_id,
          sessionId: maskSessionId(session_id),
          tokenMatch: false,
          attendanceExists: !!attendanceData,
        },
        ip: getClientIP(request),
        timestamp: new Date(),
      });

      return createProblemResponse("PAYMENT_SESSION_NOT_FOUND", {
        instance: "/api/payments/verify-session",
      });
    }

    // payment データの抽出と検証
    let payment: {
      id: string;
      status: string;
      stripe_checkout_session_id: string | null;
      amount: number;
    } | null = null;

    if (attendanceData?.payment) {
      const paymentArray = Array.isArray(attendanceData.payment)
        ? attendanceData.payment
        : [attendanceData.payment];

      // セッション ID でフィルタリング
      const matchingPayment = paymentArray.find(
        (p) => p && p.stripe_checkout_session_id === session_id
      );

      if (matchingPayment) {
        payment = matchingPayment;
      }
    }

    if (dbError && (dbError as any).code !== "PGRST116") {
      logger.error("Database query failed during payment verification", {
        category: "payment",
        action: "dbQueryFailed",
        attendance_id,
        error: (dbError as any).message,
      });
    }

    // Stripe Checkout Session 情報（フォールバック突合でも利用）
    let checkoutSession: unknown | null = null;

    if (!payment) {
      // フォールバック: StripeのSessionから internal payment_id を推定
      try {
        checkoutSession = await getStripe().checkout.sessions.retrieve(session_id, {
          expand: ["payment_intent"],
        });
      } catch (stripeError) {
        logger.warn("Stripe session retrieval failed (fallback)", {
          category: "payment",
          action: "stripeSessionRetrievalFailedFallback",
          session_id: maskSessionId(session_id),
          error: stripeError instanceof Error ? stripeError.message : String(stripeError),
        });

        // Stripe APIエラーの場合は即座に404を返す
        return createProblemResponse("PAYMENT_SESSION_NOT_FOUND", {
          instance: "/api/payments/verify-session",
        });
      }

      if (checkoutSession) {
        const cs = checkoutSession as {
          client_reference_id?: string | null;
          metadata?: Record<string, unknown> | null;
          payment_intent?: unknown;
        };

        const candidatePaymentId: string | null = ((): string | null => {
          const fromClientRef =
            typeof cs.client_reference_id === "string" && cs.client_reference_id.length > 0
              ? cs.client_reference_id
              : null;
          const fromSessionMeta =
            cs.metadata &&
            typeof cs.metadata["payment_id"] === "string" &&
            (cs.metadata["payment_id"] as string).length > 0
              ? (cs.metadata["payment_id"] as string)
              : null;
          const fromPiMeta = ((): string | null => {
            const pi = cs.payment_intent as unknown;
            if (
              pi &&
              typeof pi === "object" &&
              (pi as { metadata?: Record<string, unknown> | null }).metadata
            ) {
              const md = (pi as { metadata?: Record<string, unknown> | null }).metadata;
              const raw = md?.["payment_id"];
              return typeof raw === "string" && raw.length > 0 ? raw : null;
            }
            return null;
          })();
          return fromClientRef || fromSessionMeta || fromPiMeta;
        })();

        if (candidatePaymentId) {
          // フォールバック時：直接 payments テーブルからデータを取得（既に権限確認済み）
          const { data: fallbackPayment } = await supabase
            .from("payments")
            .select("id, status, stripe_checkout_session_id, amount")
            .eq("id", candidatePaymentId)
            .eq("attendance_id", attendance_id)
            .single();

          if (fallbackPayment) {
            // 既に他のセッションで置換済みか？
            if (
              typeof fallbackPayment.stripe_checkout_session_id === "string" &&
              fallbackPayment.stripe_checkout_session_id.length > 0 &&
              fallbackPayment.stripe_checkout_session_id !== session_id
            ) {
              logSecurityEvent({
                type: "SUSPICIOUS_ACTIVITY",
                severity: "MEDIUM",
                message: "Outdated checkout session detected during verification",
                details: {
                  attendanceId: attendance_id,
                  requestedSessionId: maskSessionId(session_id),
                  currentSessionId: maskSessionId(
                    fallbackPayment.stripe_checkout_session_id as string
                  ),
                  paymentId: fallbackPayment.id,
                  reason: "session_outdated",
                },
                ip: getClientIP(request),
                timestamp: new Date(),
              });

              return createProblemResponse("PAYMENT_SESSION_OUTDATED", {
                instance: "/api/payments/verify-session",
              });
            }

            // フォールバック成立
            payment = fallbackPayment;
            logSecurityEvent({
              type: "SUSPICIOUS_ACTIVITY",
              severity: "LOW",
              message: "Payment matched by fallback using client_reference_id/metadata",
              details: {
                attendanceId: attendance_id,
                sessionId: maskSessionId(session_id),
                paymentId: fallbackPayment.id,
                reason: "fallback_matched",
              },
              ip: getClientIP(request),
              timestamp: new Date(),
            });
          }
        }
      }

      if (!payment) {
        // 最終的に突合できなかった場合は情報を返さない
        logSecurityEvent({
          type: "SUSPICIOUS_ACTIVITY",
          severity: "HIGH",
          message: "Payment verification failed - no matching record found with guest token",
          details: {
            attendanceId: attendance_id,
            sessionId: maskSessionId(session_id),
            hasGuestToken: !!guestToken,
            dbErrorCode: dbError ? (dbError as any).code : undefined,
          },
          ip: getClientIP(request),
          timestamp: new Date(),
        });

        return createProblemResponse("PAYMENT_SESSION_NOT_FOUND", {
          instance: "/api/payments/verify-session",
        });
      }
    }

    // Stripe Checkout Session を未取得の場合のみ取得
    if (!checkoutSession) {
      try {
        checkoutSession = await getStripe().checkout.sessions.retrieve(session_id, {
          expand: ["payment_intent"],
        });
      } catch (stripeError) {
        logger.warn("Stripe session retrieval failed", {
          category: "payment",
          action: "stripeSessionRetrievalFailed",
          session_id: maskSessionId(session_id), // セキュリティのため先頭8文字のみログ
          error: stripeError instanceof Error ? stripeError.message : String(stripeError),
        });

        return createProblemResponse("PAYMENT_SESSION_NOT_FOUND", {
          instance: "/api/payments/verify-session",
        });
      }
    }

    // checkoutSession が null の場合は処理を中断
    if (!checkoutSession) {
      return createProblemResponse("PAYMENT_SESSION_NOT_FOUND", {
        instance: "/api/payments/verify-session",
      });
    }

    // セッションステータスから決済状況を判定
    let paymentStatus: VerificationResult["payment_status"];
    const cs2 = checkoutSession as { payment_status?: string; status?: string };
    switch (cs2.payment_status) {
      case "paid":
        paymentStatus = "success";
        break;
      case "unpaid":
        // セッションが期限切れかキャンセルされた場合
        if (cs2.status === "expired") {
          paymentStatus = "canceled";
        } else {
          paymentStatus = "pending";
        }
        break;
      case "no_payment_required":
        paymentStatus = "success"; // 無料イベントなど
        break;
      default:
        paymentStatus = "processing";
    }

    // 支払い要否を判定（no_cost orders / 100% off / 価格0）
    const isNoPaymentRequired =
      cs2.payment_status === "no_payment_required" ||
      (typeof (checkoutSession as { amount_total?: number }).amount_total === "number" &&
        (checkoutSession as { amount_total?: number }).amount_total === 0) ||
      (typeof payment?.amount === "number" && payment.amount === 0);

    // DBとStripeのステータスが一致しない場合の処理
    if (payment && paymentStatus === "success") {
      const dbStatus = payment.status;
      if (!["paid", "received"].includes(dbStatus)) {
        // Webhook処理が遅延している可能性があるため、warning レベル
        logger.warn("Payment status mismatch between Stripe and DB", {
          category: "payment",
          action: "paymentStatusMismatch",
          stripe_status: paymentStatus,
          db_status: dbStatus,
          session_id: maskSessionId(session_id),
          payment_id: payment.id,
        });

        // この場合は一旦processing扱いとし、クライアント側で再確認を促す
        paymentStatus = "processing";
      }
    }

    const result: VerificationResult = {
      success: true,
      payment_status: paymentStatus,
      payment_required: !isNoPaymentRequired,
    };

    logger.info("Payment session verification completed", {
      category: "payment",
      action: "paymentVerificationCompleted",
      session_id: `${session_id.substring(0, 8)}...`,
      payment_status: paymentStatus,
      attendance_id,
    });

    return NextResponse.json(result);
  } catch (error) {
    // Problem Details標準の相関ID生成に統一（req_xxxxxxxx形式）
    const errorContext = {
      category: "payment" as const,
      action: "paymentVerificationError",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };

    // エラーの種類による詳細分類
    if (error && typeof error === "object") {
      const errObj = error as any;

      // Stripe API関連エラー
      if (errObj.type || errObj.message?.includes("stripe") || errObj.name?.includes("Stripe")) {
        logger.error("Stripe API error during payment verification", {
          ...errorContext,
          error_classification: "stripe_error",
          severity: "high",
          stripe_error_type: errObj.type,
          stripe_error_code: errObj.code,
        });
        return createProblemResponse("EXTERNAL_SERVICE_ERROR", {
          instance: "/api/payments/verify-session",
          detail: "決済サービスとの通信でエラーが発生しました",
          retryable: true,
        });
      }

      // データベースエラー
      if (
        errObj.code ||
        errObj.message?.includes("database") ||
        errObj.message?.includes("postgres")
      ) {
        logger.error("Database error in payment verification", {
          ...errorContext,
          error_classification: "database_error",
          severity: "critical",
          db_error_code: errObj.code,
        });
        return createProblemResponse("DATABASE_ERROR", {
          instance: "/api/payments/verify-session",
          detail: "データベースエラーが発生しました",
          retryable: true,
        });
      }

      // レート制限エラー
      if (errObj.message?.includes("rate limit") || errObj.message?.includes("too many requests")) {
        logger.warn("Rate limit exceeded in payment verification", {
          ...errorContext,
          error_classification: "rate_limit_error",
          severity: "medium",
        });
        return createProblemResponse("RATE_LIMITED", {
          instance: "/api/payments/verify-session",
          detail: "リクエスト頻度が高すぎます",
        });
      }

      // 認証・権限エラー
      if (
        errObj.message?.includes("auth") ||
        errObj.message?.includes("token") ||
        errObj.message?.includes("permission")
      ) {
        logger.warn("Authentication error in payment verification", {
          ...errorContext,
          error_classification: "auth_error",
          severity: "medium",
        });
        return createProblemResponse("UNAUTHORIZED", {
          instance: "/api/payments/verify-session",
          detail: "認証エラーが発生しました",
        });
      }

      // ネットワーク・接続エラー
      if (
        errObj.message?.includes("fetch") ||
        errObj.message?.includes("network") ||
        errObj.message?.includes("timeout") ||
        errObj.code === "ENOTFOUND" ||
        errObj.code === "ECONNRESET"
      ) {
        logger.warn("Network error in payment verification", {
          ...errorContext,
          error_classification: "network_error",
          severity: "medium",
          network_error_code: errObj.code,
        });
        return createProblemResponse("EXTERNAL_SERVICE_ERROR", {
          instance: "/api/payments/verify-session",
          detail: "ネットワーク接続エラーが発生しました",
          retryable: true,
        });
      }

      // JSON解析エラー
      if (
        errObj instanceof SyntaxError ||
        errObj.message?.includes("JSON") ||
        errObj.name === "SyntaxError"
      ) {
        logger.warn("JSON parsing error in payment verification", {
          ...errorContext,
          error_classification: "client_error",
          severity: "low",
        });
        return createProblemResponse("INVALID_REQUEST", {
          instance: "/api/payments/verify-session",
          detail: "リクエスト形式が正しくありません",
        });
      }

      // バリデーションエラー
      if (
        errObj.message?.includes("validation") ||
        errObj.message?.includes("invalid") ||
        errObj.name === "ValidationError"
      ) {
        logger.info("Validation error in payment verification", {
          ...errorContext,
          error_classification: "validation_error",
          severity: "low",
        });
        return createProblemResponse("VALIDATION_ERROR", {
          instance: "/api/payments/verify-session",
          detail: "入力値が無効です",
        });
      }
    }

    // その他の予期しないエラー（最も重大として扱う）
    logger.error("Unexpected error in payment verification", {
      ...errorContext,
      error_classification: "system_error",
      severity: "critical",
      requires_investigation: true,
    });

    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/payments/verify-session",
      detail: "予期しないエラーが発生しました",
      retryable: true,
    });
  }
}
