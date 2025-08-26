/**
 * 決済セッション検証APIエンドポイント
 * Stripe Checkout Session IDを使用して決済ステータスを検証
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";

import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { logger } from "@/lib/logging/app-logger";
import { logSecurityEvent } from "@/lib/security/security-logger";
import { createRateLimitStore, checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

// リクエストバリデーションスキーマ
const VerifySessionSchema = z.object({
  session_id: z.string().min(1, "セッションIDは必須です"),
  attendance_id: z.string().uuid("有効な参加IDを入力してください"),
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
  payment_status?: "success" | "failed" | "cancelled" | "processing" | "pending";
  /**
   * このセッションで支払いが必要か（無料・全額割引は false）
   * success フラグが true の場合に付与され得る。
   */
  payment_required?: boolean;
  error?: string;
}

export async function GET(request: NextRequest) {
  try {
    const guestToken = request.headers.get("x-guest-token");
    if (!guestToken) {
      logSecurityEvent({
        type: "INVALID_TOKEN",
        severity: "HIGH",
        message: "Missing guest token in payment verification request",
        details: {
          endpoint: "/api/payments/verify-session",
        },
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
        timestamp: new Date(),
      });
      return NextResponse.json(
        {
          success: false,
          error: "ゲストトークンが必要です",
        },
        { status: 400 }
      );
    }

    // ------------------------------
    // Rate limiting
    // ------------------------------
    // 1. まずクエリパラメータを取得して attendance_id を抽出
    const url = new URL(request.url);
    const attendanceParam = url.searchParams.get("attendance_id") || "unknown";

    // 2. IP アドレス取得は複数ヘッダーをフォールバック
    const clientIP =
      // XFF は複数 IP が "a, b" 形式で並ぶので先頭を取る
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      request.headers.get("cf-connecting-ip") ??
      // Next.js Edge Runtime では request.ip が存在する場合がある
      (request as unknown as { ip?: string }).ip ??
      "unknown";

    // 3. IP と attendance_id の複合キーで粒度を細分化
    const rateLimitKey = `payment-verify:${clientIP}:${attendanceParam}`;

    const store = await createRateLimitStore();
    const rateLimitResult = await checkRateLimit(store, rateLimitKey, {
      maxAttempts: 10,
      windowMs: 60 * 1000, // 1 minute
      blockDurationMs: 60 * 1000, // 1 minute block
    });

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "リクエストが多すぎます。しばらく待ってから再試行してください。",
        },
        { status: 429 }
      );
    }

    // 4. 残りのパラメータを取得
    const sessionId = url.searchParams.get("session_id");
    const attendanceId = attendanceParam === "unknown" ? null : attendanceParam;

    // バリデーション
    const validationResult = VerifySessionSchema.safeParse({
      session_id: sessionId,
      attendance_id: attendanceId,
    });

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "無効なパラメータです",
        },
        { status: 400 }
      );
    }

    const { session_id, attendance_id } = validationResult.data;

    // まずDBで attendance_id と session_id の突合（存在しない場合は終了）
    // ゲストトークンを使用してRLSを満たすクライアントを生成
    const secureClientFactory = SecureSupabaseClientFactory.getInstance();
    const supabase = await secureClientFactory.createGuestClient(guestToken);

    const { data: payment, error: dbError } = await supabase
      .from("payments")
      .select("id, status, stripe_checkout_session_id, amount")
      .eq("attendance_id", attendance_id)
      .eq("stripe_checkout_session_id", session_id)
      .single();

    if (dbError && dbError.code !== "PGRST116") {
      logger.error("Database query failed during payment verification", {
        tag: "payment-verify",
        attendance_id,
        error: dbError.message,
      });
    }

    if (!payment) {
      // RLS違反やデータ不整合の可能性をログ記録
      logSecurityEvent({
        type: "SUSPICIOUS_ACTIVITY",
        severity: "HIGH",
        message: "Payment verification failed - no matching record found with guest token",
        details: {
          attendanceId: attendance_id,
          sessionId: session_id.substring(0, 8) + "...",
          hasGuestToken: !!guestToken,
          dbErrorCode: dbError?.code,
        },
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
        timestamp: new Date(),
      });

      // 突合不一致時は情報を返さない
      return NextResponse.json(
        {
          success: false,
          error: "決済セッションが見つかりません",
        },
        { status: 404 }
      );
    }

    // DB一致後にのみStripe Checkout Sessionを取得
    let checkoutSession;
    try {
      checkoutSession = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ["payment_intent"],
      });
    } catch (stripeError) {
      logger.warn("Stripe session retrieval failed", {
        tag: "payment-verify",
        session_id: session_id.substring(0, 8) + "...", // セキュリティのため一部のみログ
        error: stripeError instanceof Error ? stripeError.message : String(stripeError),
      });

      return NextResponse.json(
        {
          success: false,
          error: "決済セッションが見つかりません",
        },
        { status: 404 }
      );
    }

    // セッションステータスから決済状況を判定
    let paymentStatus: VerificationResult["payment_status"];
    switch (checkoutSession.payment_status) {
      case "paid":
        paymentStatus = "success";
        break;
      case "unpaid":
        // セッションが期限切れかキャンセルされた場合
        if (checkoutSession.status === "expired") {
          paymentStatus = "cancelled";
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
      checkoutSession.payment_status === "no_payment_required" ||
      (typeof (checkoutSession as { amount_total?: number }).amount_total === "number" &&
        (checkoutSession as { amount_total?: number }).amount_total === 0) ||
      (typeof payment?.amount === "number" && payment.amount === 0);

    // DBとStripeのステータスが一致しない場合の処理
    if (payment && paymentStatus === "success") {
      const dbStatus = payment.status;
      if (!["paid", "completed", "received"].includes(dbStatus)) {
        // Webhook処理が遅延している可能性があるため、warning レベル
        logger.warn("Payment status mismatch between Stripe and DB", {
          tag: "payment-verify",
          stripe_status: paymentStatus,
          db_status: dbStatus,
          session_id: session_id.substring(0, 8) + "...",
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
      tag: "payment-verify",
      session_id: session_id.substring(0, 8) + "...",
      payment_status: paymentStatus,
      attendance_id,
    });

    return NextResponse.json(result);

  } catch (error) {
    logger.error("Unexpected error in payment verification", {
      tag: "payment-verify",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        error: "内部エラーが発生しました",
      },
      { status: 500 }
    );
  }
}
