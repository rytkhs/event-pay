/**
 * 決済セッション検証APIエンドポイント
 * Stripe Checkout Session IDを使用して決済ステータスを検証
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logging/app-logger";
import { createRateLimitStore, checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

// リクエストバリデーションスキーマ
const VerifySessionSchema = z.object({
  session_id: z.string().min(1, "セッションIDは必須です"),
  attendance_id: z.string().uuid("有効な参加IDを入力してください").optional(),
});

// レスポンス型
interface VerificationResult {
  success: boolean;
  payment_status: "success" | "failed" | "cancelled" | "processing" | "pending";
  payment_id?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const store = await createRateLimitStore();
    const clientIP = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const rateLimitKey = `payment-verify:${clientIP}`;

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
          payment_status: "failed" as const
        },
        { status: 429 }
      );
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session_id");
    const attendanceId = url.searchParams.get("attendance_id");

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
          payment_status: "failed" as const,
        },
        { status: 400 }
      );
    }

    const { session_id, attendance_id } = validationResult.data;

    // Stripe Checkout Sessionを取得
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
          payment_status: "failed" as const,
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

    // DBからの整合性チェック（attendance_idが提供された場合）
    if (attendance_id) {
      const supabase = createClient();

      const { data: payment, error: dbError } = await supabase
        .from("payments")
        .select("id, status, stripe_checkout_session_id, amount")
        .eq("attendance_id", attendance_id)
        .eq("stripe_checkout_session_id", session_id)
        .single();

      if (dbError && dbError.code !== "PGRST116") { // PGRST116 = not found
        logger.error("Database query failed during payment verification", {
          tag: "payment-verify",
          attendance_id,
          error: dbError.message,
        });
      }

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
    }

    const result: VerificationResult = {
      success: true,
      payment_status: paymentStatus,
    };

    // 成功時の追加情報
    if (paymentStatus === "success" && checkoutSession.payment_intent) {
      const paymentIntent = checkoutSession.payment_intent as any;
      result.amount = paymentIntent.amount;
      result.currency = paymentIntent.currency;
    }

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
        payment_status: "failed" as const,
      },
      { status: 500 }
    );
  }
}
